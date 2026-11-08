import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import {
  getPublicLinkByToken,
  type ResolvedPublicLink,
} from "@/lib/shares";
import {
  publicAccessCookieName,
  signPublicAccess,
  verifyPublicAccess,
} from "@/lib/crypto";
import { ApiError } from "@/lib/request";

export const PUBLIC_ACCESS_COOKIE_MAX_AGE = 2 * 60 * 60;

export async function requireUnlockedPublicLink(
  request: NextRequest,
  rawToken: string
): Promise<ResolvedPublicLink> {
  const resolved = await getPublicLinkByToken(rawToken);
  if (resolved.link.passwordHash) {
    const cookieName = publicAccessCookieName(resolved.link.tokenHash);
    const cookie = request.cookies.get(cookieName)?.value;
    if (!verifyPublicAccess(cookie, resolved.link.tokenHash)) {
      throw new ApiError(401, "This share requires a password", "PUBLIC_LOCKED");
    }
  }
  return resolved;
}

export function setPublicAccessCookie(
  response: NextResponse,
  request: NextRequest,
  tokenHash: string
): void {
  const cookieName = publicAccessCookieName(tokenHash);
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  response.cookies.set({
    name: cookieName,
    value: signPublicAccess(tokenHash),
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: PUBLIC_ACCESS_COOKIE_MAX_AGE,
  });
}
