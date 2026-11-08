import { afterEach, describe, expect, it } from "vitest";
import {
  canPreviewFile,
  categoryForMime,
  getAllowedExtensions,
  isDangerousExtension,
  isDangerousMime,
  isExtensionAllowed,
  isInlineSafeMime,
  isMimeCompatibleWithExtension,
  safeMimeForServing,
} from "@/lib/mime";

const originalAllowlist = process.env.MYCLOUD_ALLOWED_EXTENSIONS;

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.MYCLOUD_ALLOWED_EXTENSIONS;
  else process.env.MYCLOUD_ALLOWED_EXTENSIONS = originalAllowlist;
});

describe("upload MIME and extension policy", () => {
  it("detects dangerous upload extensions", () => {
    expect(isDangerousExtension("exe")).toBe(true);
    expect(isDangerousExtension(".HTML")).toBe(true);
    expect(isDangerousExtension("pdf")).toBe(false);
  });

  it("never allows dangerous extensions even when explicitly configured", () => {
    process.env.MYCLOUD_ALLOWED_EXTENSIONS = "pdf,exe,svg,jpg";
    const allowed = getAllowedExtensions();
    expect(allowed.has("pdf")).toBe(true);
    expect(allowed.has("jpg")).toBe(true);
    expect(allowed.has("exe")).toBe(false);
    expect(allowed.has("svg")).toBe(false);
    expect(isExtensionAllowed("exe")).toBe(false);
  });

  it("categorizes MIME types", () => {
    expect(categoryForMime("image/jpeg")).toBe("image");
    expect(categoryForMime("video/mp4")).toBe("video");
    expect(categoryForMime("audio/mpeg")).toBe("audio");
    expect(categoryForMime("application/pdf")).toBe("document");
    expect(categoryForMime("application/zip")).toBe("archive");
    expect(categoryForMime("application/octet-stream")).toBe("other");
  });

  it("only inlines content that is safe to render", () => {
    expect(isInlineSafeMime("image/png")).toBe(true);
    expect(isInlineSafeMime("application/pdf")).toBe(true);
    expect(isInlineSafeMime("text/plain")).toBe(true);
    expect(isInlineSafeMime("image/svg+xml")).toBe(false);
    expect(isInlineSafeMime("text/html")).toBe(false);
  });

  it("sanitizes unsafe or malformed served MIME types", () => {
    expect(safeMimeForServing("text/html")).toBe("application/octet-stream");
    expect(safeMimeForServing("application/javascript")).toBe("application/octet-stream");
    expect(safeMimeForServing("bad mime\r\n")).toBe("application/octet-stream");
    expect(safeMimeForServing("image/png")).toBe("image/png");
  });

  it("detects dangerous MIME families", () => {
    expect(isDangerousMime("image/svg+xml")).toBe(true);
    expect(isDangerousMime("application/x-msdownload")).toBe(true);
    expect(isDangerousMime("application/pdf")).toBe(false);
  });

  it("matches detected containers to declared extensions", () => {
    expect(isMimeCompatibleWithExtension("png", "image/png", "image/png")).toBe(true);
    expect(isMimeCompatibleWithExtension("png", "text/html", "image/png")).toBe(false);
    expect(
      isMimeCompatibleWithExtension(
        "docx",
        "application/zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
    expect(isMimeCompatibleWithExtension("exe", "application/x-msdownload", "x")).toBe(false);
  });

  it("offers previews for safe media and plain text formats", () => {
    expect(canPreviewFile("image/png", "png")).toBe(true);
    expect(canPreviewFile("application/pdf", "pdf")).toBe(true);
    expect(canPreviewFile("application/json", "json")).toBe(true);
    expect(canPreviewFile("application/octet-stream", "bin")).toBe(false);
  });
});
