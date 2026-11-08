import { auth } from "@/auth";
import { validateAuthSession } from "@/lib/auth-sessions";
import { ApiError } from "@/lib/request";
import type { IUser, UserRole } from "@/models/User";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  storageQuotaBytes: number;
  mustChangePassword: boolean;
  authSessionHash: string;
  sessionVersion: number;
  createdAt: Date;
  doc: IUser;
}

function mapUser(user: IUser, sessionHash: string): CurrentUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    storageQuotaBytes: user.storageQuotaBytes,
    mustChangePassword: user.mustChangePassword,
    authSessionHash: sessionHash,
    sessionVersion: user.sessionVersion,
    createdAt: user.createdAt,
    doc: user,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.authSessionHash) return null;

  const result = await validateAuthSession(
    session.user.id,
    session.user.authSessionHash,
    session.user.sessionVersion
  );
  if (!result) return null;
  return mapUser(result.user, session.user.authSessionHash);
}

export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  return user;
}

export async function requireAdminUser(): Promise<CurrentUser> {
  const user = await requireApiUser();
  if (user.role !== "admin") {
    throw new ApiError(403, "Administrator access required", "FORBIDDEN");
  }
  return user;
}

export async function requirePasswordReadyApiUser(): Promise<CurrentUser> {
  const user = await requireApiUser();
  if (user.mustChangePassword) {
    throw new ApiError(
      403,
      "You must change your temporary password before continuing",
      "PASSWORD_CHANGE_REQUIRED"
    );
  }
  return user;
}
