const WINDOWS_RESERVED =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const MAX_DISPLAY_NAME_LENGTH = 200;

/**
 * Produces a safe display/download name. Storage itself always uses an
 * opaque UUID and never derives a path from user-controlled names.
 */
export function sanitizeDisplayName(input: string, fallback = "Untitled"): string {
  let name = String(input ?? "")
    .normalize("NFKC")
    .replace(FORBIDDEN_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!name || name === "." || name === "..") name = fallback;
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`;
  const chars = Array.from(name);
  if (chars.length > MAX_DISPLAY_NAME_LENGTH) {
    const extension = getExtension(name);
    const suffix = extension ? `.${extension}` : "";
    const stemLimit = Math.max(1, MAX_DISPLAY_NAME_LENGTH - suffix.length);
    name = Array.from(name.slice(0, name.length - suffix.length))
      .slice(0, stemLimit)
      .join("")
      .replace(/[. ]+$/g, "") + suffix;
  }
  return name || fallback;
}

export function getExtension(filename: string): string {
  const clean = filename.trim().toLowerCase();
  const lastDot = clean.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === clean.length - 1) return "";
  return clean.slice(lastDot + 1);
}

export function nameKey(filename: string): string {
  return sanitizeDisplayName(filename, "").normalize("NFKC").toLowerCase();
}

export function splitName(filename: string): { stem: string; extension: string } {
  const extension = getExtension(filename);
  if (!extension) return { stem: filename, extension: "" };
  return {
    stem: filename.slice(0, -(extension.length + 1)),
    extension: `.${extension}`,
  };
}

export function copyName(filename: string, index = 1): string {
  const { stem, extension } = splitName(filename);
  if (index <= 1) return sanitizeDisplayName(`${stem} (copy)${extension}`);
  return sanitizeDisplayName(`${stem} (copy ${index})${extension}`);
}

export function numberedName(filename: string, index: number): string {
  const { stem, extension } = splitName(filename);
  return sanitizeDisplayName(`${stem} (${index})${extension}`);
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : decimals)} ${units[exponent]}`;
}

export function encodeContentDisposition(filename: string, disposition: "inline" | "attachment"): string {
  const safe = sanitizeDisplayName(filename);
  const asciiFallback = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeRFC5987(safe)}`;
}

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
