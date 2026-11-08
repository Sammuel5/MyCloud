import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getStoragePath,
  resolveWithinRoot,
  storageRelativeFromAbsolute,
  UnsafeStoragePathError,
} from "@/lib/storage";

const root = path.resolve("C:\\MyCloudTestStorage");

describe("storage path containment", () => {
  it("resolves server-generated relative paths beneath the root", () => {
    expect(resolveWithinRoot(root, "files/owner/2026/01/id.blob")).toBe(
      path.resolve(root, "files", "owner", "2026", "01", "id.blob")
    );
  });

  it.each([
    "../outside.txt",
    "files/../../outside.txt",
    "files/./x",
    "/etc/passwd",
    "C:\\Windows\\System32",
    "\\\\server\\share\\file",
    "",
  ])("rejects unsafe relative path %s", (value) => {
    expect(() => resolveWithinRoot(root, value)).toThrow(UnsafeStoragePathError);
  });

  it("rejects null bytes", () => {
    expect(() => resolveWithinRoot(root, "files/a\0b")).toThrow(UnsafeStoragePathError);
  });

  it("converts an absolute path back to a storage-relative path", () => {
    const absolute = path.join(root, "thumbnails", "owner", "a.webp");
    expect(storageRelativeFromAbsolute(root, absolute)).toBe("thumbnails/owner/a.webp");
  });

  it("refuses to relativize a path outside the root", () => {
    expect(() =>
      storageRelativeFromAbsolute(root, path.resolve("C:\\Other\\file.blob"))
    ).toThrow(UnsafeStoragePathError);
  });

  it("uses MYCLOUD_STORAGE_PATH for getStoragePath", () => {
    expect(getStoragePath("files/test.blob")).toBe(
      path.join(process.env.MYCLOUD_STORAGE_PATH!, "files", "test.blob")
    );
  });
});
