import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { File, type IFile } from "@/models/File";
import { Folder, type IFolder } from "@/models/Folder";
import { Share } from "@/models/Share";
import { ShareLink, type IShareLink } from "@/models/ShareLink";
import { User } from "@/models/User";
import {
  getFileWithAccess,
  getFolderWithAccess,
  getFolderBreadcrumbs,
} from "@/lib/access";
import { getSystemSettings } from "@/lib/settings";
import { hashShareToken, randomToken } from "@/lib/crypto";
import { ApiError } from "@/lib/request";
import { previewKindForFile } from "@/lib/item-dto";
import type {
  ItemType,
  OutgoingShareDTO,
  PublicItemDTO,
  PublicShareInfo,
  ShareDTO,
  ShareLinkDTO,
  SharesResponse,
} from "@/lib/types";
import { logger } from "@/lib/logger";

async function getOwnedResource(
  userId: string,
  type: ItemType,
  resourceId: string
): Promise<IFile | IFolder> {
  const access =
    type === "file"
      ? await getFileWithAccess(userId, resourceId)
      : await getFolderWithAccess(userId, resourceId);
  if (!access) throw new ApiError(404, "Item not found", "NOT_FOUND");
  if (access.item.owner.toString() !== userId) {
    throw new ApiError(403, "Only the owner can manage sharing", "OWNER_REQUIRED");
  }
  return access.item;
}

export async function createUserShare(input: {
  ownerId: string;
  resourceType: ItemType;
  resourceId: string;
  email: string;
  role: "viewer" | "editor";
}): Promise<ShareDTO> {
  await getOwnedResource(input.ownerId, input.resourceType, input.resourceId);
  const recipient = await User.findOne({ email: input.email, active: true }).lean();
  if (!recipient) throw new ApiError(404, "No active user has that email address", "USER_NOT_FOUND");
  if (recipient._id.toString() === input.ownerId) {
    throw new ApiError(400, "You cannot share an item with yourself", "INVALID_SHARE");
  }

  const share = await Share.findOneAndUpdate(
    {
      resourceType: input.resourceType,
      resourceId: new Types.ObjectId(input.resourceId),
      sharedWith: recipient._id,
    },
    {
      $set: {
        role: input.role,
        owner: new Types.ObjectId(input.ownerId),
        createdBy: new Types.ObjectId(input.ownerId),
      },
      $setOnInsert: {
        resourceType: input.resourceType,
        resourceId: new Types.ObjectId(input.resourceId),
        sharedWith: recipient._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  if (!share) throw new Error("Unable to create share");

  return {
    id: share._id.toString(),
    user: { id: recipient._id.toString(), name: recipient.name, email: recipient.email },
    role: share.role,
    createdAt: share.createdAt.toISOString(),
  };
}

export async function getResourceShares(
  userId: string,
  resourceType: ItemType,
  resourceId: string
): Promise<SharesResponse> {
  await getOwnedResource(userId, resourceType, resourceId);
  const [shares, links] = await Promise.all([
    Share.find({ resourceType, resourceId }).sort({ createdAt: 1 }).lean(),
    ShareLink.find({
      resourceType,
      resourceId,
      revokedAt: null,
    })
      .select("+passwordHash")
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const userIds = shares.map((share) => share.sharedWith);
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((user) => [user._id.toString(), user]));

  return {
    shares: shares
      .map((share) => {
        const user = userMap.get(share.sharedWith.toString());
        if (!user) return null;
        return {
          id: share._id.toString(),
          user: { id: user._id.toString(), name: user.name, email: user.email },
          role: share.role,
          createdAt: share.createdAt.toISOString(),
        } satisfies ShareDTO;
      })
      .filter((value): value is ShareDTO => Boolean(value)),
    links: links.map((link) => ({
      id: link._id.toString(),
      hasPassword: Boolean(link.passwordHash),
      expiresAt: link.expiresAt?.toISOString() || null,
      allowDownload: link.allowDownload,
      accessCount: link.accessCount,
      lastAccessedAt: link.lastAccessedAt?.toISOString() || null,
      revokedAt: link.revokedAt?.toISOString() || null,
      createdAt: link.createdAt.toISOString(),
    })),
  };
}

export async function removeShare(actorId: string, shareId: string): Promise<void> {
  const share = await Share.findById(shareId).lean();
  if (!share) throw new ApiError(404, "Share not found", "NOT_FOUND");
  const isOwner = share.owner.toString() === actorId;
  const isRecipient = share.sharedWith.toString() === actorId;
  if (!isOwner && !isRecipient) {
    throw new ApiError(403, "You cannot remove this share", "FORBIDDEN");
  }
  await Share.deleteOne({ _id: share._id });
}

export async function createPublicShareLink(input: {
  ownerId: string;
  resourceType: ItemType;
  resourceId: string;
  password?: string;
  expiresInDays?: number;
  allowDownload: boolean;
}): Promise<{ id: string; path: string; expiresAt: string | null }> {
  const settings = await getSystemSettings();
  if (!settings.publicSharingEnabled) {
    throw new ApiError(
      403,
      "Public sharing is disabled. An administrator must enable it in system settings.",
      "PUBLIC_SHARING_DISABLED"
    );
  }
  await getOwnedResource(input.ownerId, input.resourceType, input.resourceId);

  const rawToken = randomToken(32);
  const tokenHash = hashShareToken(rawToken);
  const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const link = await ShareLink.create({
    tokenHash,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    owner: input.ownerId,
    createdBy: input.ownerId,
    passwordHash,
    expiresAt,
    allowDownload: input.allowDownload,
  });

  return {
    id: link._id.toString(),
    path: `/s/${rawToken}`,
    expiresAt: expiresAt?.toISOString() || null,
  };
}

export async function revokePublicShareLink(
  actorId: string,
  linkId: string
): Promise<void> {
  const link = await ShareLink.findOne({ _id: linkId, owner: actorId }).lean();
  if (!link) throw new ApiError(404, "Share link not found", "NOT_FOUND");
  await ShareLink.updateOne(
    { _id: link._id },
    { $set: { revokedAt: new Date() }, $unset: { passwordHash: 1 } }
  );
}

export interface ResolvedPublicLink {
  link: IShareLink;
  resource: IFile | IFolder;
}

export async function getPublicLinkByToken(rawToken: string): Promise<ResolvedPublicLink> {
  const settings = await getSystemSettings();
  if (!settings.publicSharingEnabled) {
    throw new ApiError(404, "Sharing is unavailable", "NOT_FOUND");
  }
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) {
    throw new ApiError(404, "Share not found", "NOT_FOUND");
  }
  const tokenHash = hashShareToken(rawToken);
  const link = await ShareLink.findOne({
    tokenHash,
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .select("+passwordHash")
    .lean();
  if (!link) throw new ApiError(404, "This share link is invalid or has expired", "NOT_FOUND");

  const resource =
    link.resourceType === "file"
      ? await File.findOne({ _id: link.resourceId, deletedAt: null }).lean()
      : await Folder.findOne({ _id: link.resourceId, deletedAt: null }).lean();
  if (!resource) throw new ApiError(404, "This item is no longer available", "NOT_FOUND");
  return { link, resource };
}

export function publicShareInfo(resolved: ResolvedPublicLink): PublicShareInfo {
  const { link, resource } = resolved;
  if (link.resourceType === "file") {
    const file = resource as IFile;
    return {
      type: "file",
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      extension: file.extension,
      previewKind: previewKindForFile(file),
      hasThumbnail: file.thumbnailStatus === "ready",
      updatedAt: file.updatedAt.toISOString(),
      requiresPassword: Boolean(link.passwordHash),
      allowDownload: link.allowDownload,
      expiresAt: link.expiresAt?.toISOString() || null,
    };
  }
  return {
    type: "folder",
    name: (resource as IFolder).name,
    updatedAt: (resource as IFolder).updatedAt.toISOString(),
    requiresPassword: Boolean(link.passwordHash),
    allowDownload: link.allowDownload,
    expiresAt: link.expiresAt?.toISOString() || null,
  };
}

export async function verifyPublicLinkPassword(
  link: IShareLink,
  password: string
): Promise<boolean> {
  if (!link.passwordHash) return true;
  return bcrypt.compare(password, link.passwordHash);
}

export async function validatePublicFolder(
  link: IShareLink,
  folderId: string
): Promise<IFolder> {
  if (link.resourceType !== "folder") {
    throw new ApiError(400, "This is not a shared folder", "INVALID_RESOURCE");
  }
  if (!Types.ObjectId.isValid(folderId)) {
    throw new ApiError(400, "Invalid folder identifier", "INVALID_ID");
  }
  const rootId = link.resourceId;
  const folder = await Folder.findOne({ _id: folderId, deletedAt: null }).lean();
  if (!folder) throw new ApiError(404, "Folder not found", "NOT_FOUND");
  const inside =
    folder._id.toString() === rootId.toString() ||
    folder.ancestorIds.some((ancestor) => ancestor.toString() === rootId.toString());
  if (!inside) throw new ApiError(404, "Folder not found", "NOT_FOUND");
  return folder;
}

export async function publicFolderItems(
  link: IShareLink,
  folderId: string
): Promise<{ folder: { id: string; name: string; breadcrumbs: Array<{ id: string; name: string }> }; items: PublicItemDTO[] }> {
  const folder = await validatePublicFolder(link, folderId);
  const [files, folders] = await Promise.all([
    File.find({ parentId: folder._id, deletedAt: null }).sort({ nameKey: 1 }).limit(500).lean(),
    Folder.find({ parentId: folder._id, deletedAt: null }).sort({ nameKey: 1 }).limit(500).lean(),
  ]);
  const items: PublicItemDTO[] = [
    ...folders.map((item) => ({
      id: item._id.toString(),
      type: "folder" as const,
      name: item.name,
      parentId: item.parentId?.toString() || null,
      hasThumbnail: false,
      updatedAt: item.updatedAt.toISOString(),
    })),
    ...files.map((item) => ({
      id: item._id.toString(),
      type: "file" as const,
      name: item.name,
      parentId: item.parentId?.toString() || null,
      size: item.size,
      mimeType: item.mimeType,
      extension: item.extension,
      previewKind: previewKindForFile(item),
      hasThumbnail: item.thumbnailStatus === "ready",
      updatedAt: item.updatedAt.toISOString(),
    })),
  ];
  items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1));
  const breadcrumbs = await getFolderBreadcrumbs(folder);
  const rootIndex = breadcrumbs.findIndex(
    (crumb) => crumb.id === link.resourceId.toString()
  );
  return {
    folder: {
      id: folder._id.toString(),
      name: folder.name,
      breadcrumbs: rootIndex >= 0 ? breadcrumbs.slice(rootIndex) : [],
    },
    items,
  };
}

export async function validatePublicFile(
  link: IShareLink,
  fileId: string
): Promise<IFile> {
  if (!Types.ObjectId.isValid(fileId)) {
    throw new ApiError(400, "Invalid file identifier", "INVALID_ID");
  }
  const file = await File.findOne({ _id: fileId, deletedAt: null }).lean();
  if (!file) throw new ApiError(404, "File not found", "NOT_FOUND");

  if (link.resourceType === "file") {
    if (file._id.toString() !== link.resourceId.toString()) {
      throw new ApiError(404, "File not found", "NOT_FOUND");
    }
    return file;
  }

  if (!file.parentId) throw new ApiError(404, "File not found", "NOT_FOUND");
  const parent = await Folder.findOne({ _id: file.parentId, deletedAt: null }).lean();
  if (!parent) throw new ApiError(404, "File not found", "NOT_FOUND");
  const inside =
    parent._id.toString() === link.resourceId.toString() ||
    parent.ancestorIds.some(
      (ancestor) => ancestor.toString() === link.resourceId.toString()
    );
  if (!inside) throw new ApiError(404, "File not found", "NOT_FOUND");
  return file;
}

export async function recordPublicLinkAccess(
  linkId: string,
  ipHash: string | null,
  userAgentValue: string,
  kind: "view" | "download"
): Promise<void> {
  await ShareLink.updateOne(
    { _id: linkId, revokedAt: null },
    { $inc: { accessCount: 1 }, $set: { lastAccessedAt: new Date() } }
  ).catch((error) => logger.warn("Could not update public link access count", { error }));
  const { auditEvent } = await import("@/lib/audit");
  await auditEvent({
    action: kind === "download" ? "public.download" : "public.view",
    targetType: "share_link",
    targetId: linkId,
    severity: "info",
    ipHash,
    userAgent: userAgentValue,
  });
}

export async function getOutgoingShares(userId: string): Promise<OutgoingShareDTO[]> {
  const [shares, links] = await Promise.all([
    Share.find({ owner: userId }).sort({ createdAt: -1 }).lean(),
    ShareLink.find({ owner: userId, revokedAt: null }).select("resourceType resourceId").lean(),
  ]);
  const grouped = new Map<
    string,
    {
      resourceType: ItemType;
      resourceId: string;
      collaborators: Array<{ id: string; name: string; email: string; role: "viewer" | "editor" }>;
      activeLinkCount: number;
    }
  >();
  for (const share of shares) {
    const key = `${share.resourceType}:${share.resourceId}`;
    const group = grouped.get(key) || {
      resourceType: share.resourceType,
      resourceId: share.resourceId.toString(),
      collaborators: [],
      activeLinkCount: 0,
    };
    grouped.set(key, group);
  }
  const userIds = [...new Set(shares.map((share) => share.sharedWith.toString()))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((user) => [user._id.toString(), user]));
  for (const share of shares) {
    const group = grouped.get(`${share.resourceType}:${share.resourceId}`);
    const user = userMap.get(share.sharedWith.toString());
    if (group && user) {
      group.collaborators.push({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: share.role,
      });
    }
  }
  for (const link of links) {
    const key = `${link.resourceType}:${link.resourceId}`;
    const group = grouped.get(key);
    if (group) group.activeLinkCount += 1;
  }

  const output: OutgoingShareDTO[] = [];
  for (const group of grouped.values()) {
    if (group.resourceType === "file") {
      const file = await File.findOne({ _id: group.resourceId, deletedAt: null }).lean();
      if (!file) continue;
      output.push({
        ...group,
        name: file.name,
        mimeType: file.mimeType,
        extension: file.extension,
        size: file.size,
        updatedAt: file.updatedAt.toISOString(),
      });
    } else {
      const folder = await Folder.findOne({ _id: group.resourceId, deletedAt: null }).lean();
      if (!folder) continue;
      output.push({
        ...group,
        name: folder.name,
        updatedAt: folder.updatedAt.toISOString(),
      });
    }
  }
  return output.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
