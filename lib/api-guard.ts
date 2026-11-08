import type { CurrentUser } from "@/lib/auth-user";
import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { ApiError, assertSameOrigin } from "@/lib/request";

/**
 * Every cookie-authenticated mutation goes through this guard. It verifies the
 * request is same-origin and that the account is not still using a temporary
 * password.
 */
export async function requireMutationUser(request: Request): Promise<CurrentUser> {
  assertSameOrigin(request);
  return requirePasswordReadyApiUser();
}

export async function requireAdminMutation(request: Request): Promise<CurrentUser> {
  const user = await requireMutationUser(request);
  if (user.role !== "admin") {
    throw new ApiError(403, "Administrator access required", "FORBIDDEN");
  }
  return user;
}

/**
 * Reads and validates URL search params. Unknown params are ignored.
 */
export function queryObject(request: Request | URL): Record<string, string> {
  const url = request instanceof URL ? request : new URL(request.url);
  const result: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
