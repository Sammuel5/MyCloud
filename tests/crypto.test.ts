import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashIpAddress,
  hashSessionId,
  hashShareToken,
  publicAccessCookieName,
  randomToken,
  safeEqual,
  sha256,
  signPublicAccess,
  verifyPublicAccess,
} from "@/lib/crypto";

afterEach(() => {
  vi.useRealTimers();
});

describe("token and signature helpers", () => {
  it("generates URL-safe random tokens", () => {
    const token = randomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(30);
    expect(randomToken(32)).not.toBe(token);
  });

  it("hashes tokens deterministically", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(hashShareToken("shared")).toBe(hashShareToken("shared"));
    expect(hashShareToken("shared")).not.toBe(hashShareToken("shared2"));
  });

  it("namespaces session hashes", () => {
    expect(hashSessionId("abc")).toBe(sha256("mycloud-session:abc"));
  });

  it("hashes IP addresses with a deterministic HMAC prefix", () => {
    const first = hashIpAddress("192.0.2.1");
    expect(first).toHaveLength(32);
    expect(first).toBe(hashIpAddress("192.0.2.1"));
    expect(first).not.toBe(hashIpAddress("192.0.2.2"));
    expect(hashIpAddress(null)).toBe("unknown");
  });

  it("compares values without throwing on length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("signs and verifies public-link access cookies", () => {
    const payload = hashShareToken("raw-token");
    const cookie = signPublicAccess(payload);
    expect(verifyPublicAccess(cookie, payload)).toBe(true);
    expect(verifyPublicAccess(cookie, hashShareToken("other"))).toBe(false);
    expect(verifyPublicAccess(`${cookie}x`, payload)).toBe(false);
    expect(verifyPublicAccess(undefined, payload)).toBe(false);
  });

  it("rejects expired public-link cookies", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const payload = hashShareToken("raw-token");
    const cookie = signPublicAccess(payload);
    expect(verifyPublicAccess(cookie, payload)).toBe(true);
    vi.setSystemTime(new Date("2026-01-01T03:00:00Z"));
    expect(verifyPublicAccess(cookie, payload)).toBe(false);
  });

  it("derives a stable cookie name from the token hash", () => {
    const hash = hashShareToken("abc");
    expect(publicAccessCookieName(hash)).toBe(`mc_pub_${hash.slice(0, 16)}`);
  });
});
