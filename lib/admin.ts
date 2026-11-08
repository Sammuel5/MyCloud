import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User, type IUser, type UserRole } from "@/models/User";
import { File } from "@/models/File";
import { Share } from "@/models/Share";
import { UserSession } from "@/models/UserSession";
import { UploadSession } from "@/models/UploadSession";
import { revokeAllUserSessions } from "@/lib/auth-sessions";
import { ApiError } from "@/lib/request";
import type { UserDTO } from "@/lib/types";

interface ListUsersInput {
  page: number;
  limit: number;
  q?: string;
  role?: UserRole;
  active?: boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function usedBytesForUsers(ids: Types.ObjectId[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await File.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { owner: { $in: ids } } },
    { $group: { _id: "$owner", total: { $sum: "$size" } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), Number(row.total || 0)]));
}

function toDTO(user: IUser, usedBytes: number): UserDTO {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    storageQuotaBytes: user.storageQuotaBytes,
    usedBytes,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() || null,
  };
}

export async function listAdminUsers(input: ListUsersInput): Promise<{
  users: UserDTO[];
  total: number;
  page: number;
  limit: number;
}> {
  await connectDB();
  const filters: Record<string, unknown>[] = [];
  if (input.q?.trim()) {
    const regex = new RegExp(escapeRegex(input.q.trim()), "i");
    filters.push({ $or: [{ name: regex }, { email: regex }] });
  }
  if (input.role) filters.push({ role: input.role });
  if (typeof input.active === "boolean") filters.push({ active: input.active });
  const filter = filters.length ? { $and: filters } : {};

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  const used = await usedBytesForUsers(users.map((user) => user._id));
  return {
    users: users.map((user) => toDTO(user, used.get(user._id.toString()) || 0)),
    total,
    page: input.page,
    limit: input.limit,
  };
}

async function otherActiveAdminCount(excludeId?: string): Promise<number> {
  return User.countDocuments({
    role: "admin",
    active: true,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
}

export interface CreateAdminUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  quotaBytes: number;
}

export async function createAdminUser(
  actorId: string,
  input: CreateAdminUserInput
): Promise<UserDTO> {
  await connectDB();
  const existing = await User.exists({ email: input.email });
  if (existing) {
    throw new ApiError(409, "An account already uses that email address", "EMAIL_IN_USE");
  }
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
    active: true,
    mustChangePassword: true,
    storageQuotaBytes: input.quotaBytes,
    sessionVersion: 1,
    createdBy: actorId,
  });
  return toDTO(user.toObject(), 0);
}

export interface UpdateAdminUserInput {
  name?: string;
  role?: UserRole;
  active?: boolean;
  quotaBytes?: number;
  newPassword?: string;
  mustChangePassword?: boolean;
}

export async function updateAdminUser(
  actorId: string,
  targetId: string,
  input: UpdateAdminUserInput
): Promise<UserDTO> {
  await connectDB();
  const target = await User.findById(targetId).lean();
  if (!target) throw new ApiError(404, "User not found", "NOT_FOUND");

  if (targetId === actorId && input.role && input.role !== target.role) {
    throw new ApiError(400, "You cannot change your own administrator role", "SELF_ROLE_CHANGE");
  }
  if (targetId === actorId && input.active === false) {
    throw new ApiError(400, "You cannot deactivate your own account", "SELF_DEACTIVATION");
  }
  if (
    target.role === "admin" &&
    ((input.role && input.role !== "admin") || input.active === false)
  ) {
    const otherAdmins = await otherActiveAdminCount(targetId);
    if (otherAdmins === 0) {
      throw new ApiError(
        409,
        "At least one active administrator account must remain",
        "LAST_ADMIN"
      );
    }
  }

  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.role !== undefined) update.role = input.role;
  if (input.active !== undefined) update.active = input.active;
  if (input.quotaBytes !== undefined) update.storageQuotaBytes = input.quotaBytes;
  if (input.mustChangePassword !== undefined) {
    update.mustChangePassword = input.mustChangePassword;
  }

  let passwordChanged = false;
  if (input.newPassword) {
    update.passwordHash = await bcrypt.hash(input.newPassword, 12);
    update.mustChangePassword = input.mustChangePassword ?? true;
    passwordChanged = true;
  }

  const shouldRevoke =
    passwordChanged || input.active === false || input.role !== undefined;
  if (shouldRevoke) {
    await User.updateOne({ _id: targetId }, { $inc: { sessionVersion: 1 } });
    await revokeAllUserSessions(targetId);
  }
  if (Object.keys(update).length > 0) {
    await User.updateOne({ _id: targetId }, { $set: update });
  }

  const updated = await User.findById(targetId).lean();
  if (!updated) throw new ApiError(404, "User not found", "NOT_FOUND");
  const used = await usedBytesForUsers([updated._id]);
  return toDTO(updated, used.get(updated._id.toString()) || 0);
}

/**
 * Deactivates an account instead of destroying its files. Administrators can
 * reactivate the account later; permanent data removal stays an explicit
 * storage-management operation.
 */
export async function deactivateAdminUser(
  actorId: string,
  targetId: string
): Promise<void> {
  await connectDB();
  if (actorId === targetId) {
    throw new ApiError(400, "You cannot deactivate your own account", "SELF_DEACTIVATION");
  }
  const target = await User.findById(targetId).lean();
  if (!target) throw new ApiError(404, "User not found", "NOT_FOUND");
  if (target.role === "admin" && (await otherActiveAdminCount(targetId)) === 0) {
    throw new ApiError(409, "At least one active administrator must remain", "LAST_ADMIN");
  }
  await User.updateOne(
    { _id: targetId },
    { $set: { active: false }, $inc: { sessionVersion: 1 } }
  );
  await revokeAllUserSessions(targetId);
}

export async function getUserAdminDetail(userId: string): Promise<UserDTO> {
  await connectDB();
  if (!Types.ObjectId.isValid(userId)) throw new ApiError(400, "Invalid user id", "INVALID_ID");
  const user = await User.findById(userId).lean();
  if (!user) throw new ApiError(404, "User not found", "NOT_FOUND");
  const used = await usedBytesForUsers([user._id]);
  return toDTO(user, used.get(user._id.toString()) || 0);
}

export async function getUserOperationalSummary(userId: string): Promise<{
  activeSessions: number;
  outgoingShares: number;
  incomingShares: number;
  activeUploads: number;
}> {
  await connectDB();
  const [activeSessions, outgoingShares, incomingShares, activeUploads] = await Promise.all([
    UserSession.countDocuments({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }),
    Share.countDocuments({ owner: userId }),
    Share.countDocuments({ sharedWith: userId }),
    UploadSession.countDocuments({
      owner: userId,
      status: { $in: ["uploading", "assembling"] },
    }),
  ]);
  return { activeSessions, outgoingShares, incomingShares, activeUploads };
}
