import { describe, expect, it } from "vitest";
import {
  copyName,
  encodeContentDisposition,
  getExtension,
  nameKey,
  numberedName,
  sanitizeDisplayName,
  splitName,
} from "@/lib/file-names";

describe("display file names", () => {
  it("removes path separators and forbidden Windows characters", () => {
    expect(sanitizeDisplayName("report: final?.pdf")).toBe("report final.pdf");
    expect(sanitizeDisplayName("../../etc/passwd")).toBe("....etcpasswd");
  });

  it("removes control characters and trailing dots/spaces", () => {
    expect(sanitizeDisplayName("hello\u0000world... ")).toBe("helloworld");
  });

  it("escapes Windows reserved device names", () => {
    expect(sanitizeDisplayName("CON")).toBe("_CON");
    expect(sanitizeDisplayName("LPT1.txt")).toBe("_LPT1.txt");
  });

  it("falls back for empty names", () => {
    expect(sanitizeDisplayName("", "Untitled")).toBe("Untitled");
    expect(sanitizeDisplayName("...", "Untitled")).toBe("Untitled");
  });

  it("limits very long names while preserving the extension", () => {
    const name = `${"a".repeat(300)}.txt`;
    const sanitized = sanitizeDisplayName(name);
    expect(sanitized.endsWith(".txt")).toBe(true);
    expect(Array.from(sanitized).length).toBeLessThanOrEqual(200);
  });

  it("extracts extensions safely", () => {
    expect(getExtension("archive.tar.gz")).toBe("gz");
    expect(getExtension(".env")).toBe("");
    expect(getExtension("README")).toBe("");
    expect(getExtension("file.")).toBe("");
  });

  it("builds copy names", () => {
    expect(copyName("photo.jpg")).toBe("photo (copy).jpg");
    expect(copyName("photo.jpg", 2)).toBe("photo (copy 2).jpg");
    expect(numberedName("notes.txt", 3)).toBe("notes (3).txt");
  });

  it("creates case-insensitive sort keys", () => {
    expect(nameKey("Résumé.PDF")).toBe("résumé.pdf");
  });

  it("splits a name into stem and extension", () => {
    expect(splitName("holiday.photo.png")).toEqual({
      stem: "holiday.photo",
      extension: ".png",
    });
    expect(splitName("README")).toEqual({ stem: "README", extension: "" });
  });

  it("encodes RFC 5987 download headers without header injection", () => {
    const value = encodeContentDisposition('résumé\r\n"final".pdf', "attachment");
    expect(value).toContain("attachment;");
    expect(value).toContain("filename*=UTF-8''");
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
  });
});
