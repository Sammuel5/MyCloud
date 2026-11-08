import { describe, expect, it } from "vitest";
import {
  adminCreateUserSchema,
  changePasswordSchema,
  createFolderSchema,
  emailSchema,
  objectIdSchema,
  passwordSchema,
  publicLinkSchema,
  unlockSchema,
} from "@/lib/validation";

describe("validation schemas", () => {
  it("normalizes email addresses", () => {
    expect(emailSchema.parse("  User@Example.COM ")).toBe("user@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("enforces password strength", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase123!").success).toBe(false);
    expect(passwordSchema.safeParse("NoNumberHere!").success).toBe(false);
    expect(passwordSchema.safeParse("NoSymbolHere123").success).toBe(false);
    expect(passwordSchema.safeParse("Correct-Horse9").success).toBe(true);
  });

  it("validates user creation and applies safe defaults", () => {
    const parsed = adminCreateUserSchema.parse({
      name: "Sam",
      email: "SAM@example.com",
      password: "Correct-Horse9",
    });
    expect(parsed.role).toBe("user");
    expect(parsed.quotaBytes).toBe(0);
    expect(parsed.email).toBe("sam@example.com");
  });

  it("requires an object id for API identifiers", () => {
    expect(objectIdSchema.safeParse("507f1f77bcf86cd799439011").success).toBe(true);
    expect(objectIdSchema.safeParse("1").success).toBe(false);
    expect(objectIdSchema.safeParse("../../etc").success).toBe(false);
  });

  it("rejects folder names containing path separators", () => {
    expect(createFolderSchema.safeParse({ name: "Photos/2026" }).success).toBe(false);
    expect(createFolderSchema.parse({ name: "  Photos  " }).name).toBe("Photos");
    expect(createFolderSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createFolderSchema.safeParse({ name: ".." }).success).toBe(false);
  });

  it("validates password changes", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old",
        newPassword: "Correct-Horse9",
      }).success
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old",
        newPassword: "weak",
      }).success
    ).toBe(false);
  });

  it("requires public-link passwords to be at least eight characters", () => {
    const base = {
      resourceType: "file" as const,
      resourceId: "507f1f77bcf86cd799439011",
    };
    expect(publicLinkSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(publicLinkSchema.safeParse({ ...base, password: "long-enough" }).success).toBe(true);
  });

  it("validates unlock requests", () => {
    expect(unlockSchema.safeParse({ password: "x" }).success).toBe(true);
    expect(unlockSchema.safeParse({ password: "" }).success).toBe(false);
    expect(unlockSchema.safeParse({ password: "x".repeat(129) }).success).toBe(false);
  });
});
