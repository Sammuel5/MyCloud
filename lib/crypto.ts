import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/config";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashShareToken(token: string): string {
  return sha256(token);
}

export function hashSessionId(sessionId: string): string {
  return sha256(`mycloud-session:${sessionId}`);
}

export function hashIpAddress(ip: string | null): string {
  if (!ip) return "unknown";
  return createHmac("sha256", getAuthSecret()).update(ip).digest("hex").slice(0, 32);
}

export function signPublicAccess(payload: string): string {
  const expires = Date.now() + 2 * 60 * 60 * 1000;
  const value = `${payload}.${expires}`;
  const signature = createHmac("sha256", getAuthSecret()).update(`public:${value}`).digest("base64url");
  return `${Buffer.from(value).toString("base64url")}.${signature}`;
}

export function verifyPublicAccess(cookieValue: string | undefined, expectedPayload: string): boolean {
  if (!cookieValue) return false;
  const [encodedValue, signature] = cookieValue.split(".");
  if (!encodedValue || !signature) return false;
  let value: string;
  try {
    value = Buffer.from(encodedValue, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const expectedSignature = createHmac("sha256", getAuthSecret())
    .update(`public:${value}`)
    .digest("base64url");
  if (!safeEqual(signature, expectedSignature)) return false;
  const [payload, expiresRaw] = value.split(".");
  if (payload !== expectedPayload) return false;
  const expires = Number(expiresRaw);
  return Number.isFinite(expires) && expires > Date.now();
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function publicAccessCookieName(tokenHash: string): string {
  return `mc_pub_${tokenHash.slice(0, 16)}`;
}
