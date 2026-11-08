export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "other";

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  "3gp": "video/3gpp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  epub: "application/epub+zip",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
  tar: "application/x-tar",
  gz: "application/gzip",
  tgz: "application/gzip",
  bz2: "application/x-bzip2",
  xz: "application/x-xz",
};

export const DEFAULT_ALLOWED_EXTENSIONS = Object.freeze(Object.keys(EXTENSION_MIME));

const DANGEROUS_EXTENSIONS = new Set([
  "ade", "adp", "apk", "app", "appx", "bat", "bin", "cab", "cmd", "com",
  "cpl", "dll", "dmg", "exe", "gadget", "hta", "htm", "html", "inf", "ins",
  "iso", "jar", "js", "jse", "jsx", "lnk", "mde", "msc", "msi", "msp",
  "mst", "mjs", "cjs", "ps1", "ps2", "reg", "scr", "sct", "sh", "svg",
  "swf", "tsx", "vb", "vbe", "vbs", "wasm", "wsf", "wsh", "xhtml", "xml",
]);

export function getAllowedExtensions(): Set<string> {
  const raw = process.env.MYCLOUD_ALLOWED_EXTENSIONS?.trim();
  if (!raw) return new Set(DEFAULT_ALLOWED_EXTENSIONS);
  const configured = raw
    .split(",")
    .map((value) => value.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
  return new Set(configured.filter((extension) => !DANGEROUS_EXTENSIONS.has(extension)));
}

export function mimeForExtension(extension: string): string | undefined {
  return EXTENSION_MIME[extension.toLowerCase()];
}

export function isDangerousExtension(extension: string): boolean {
  return DANGEROUS_EXTENSIONS.has(extension.toLowerCase().replace(/^\./, ""));
}

export function isExtensionAllowed(extension: string): boolean {
  return getAllowedExtensions().has(extension.toLowerCase()) && !isDangerousExtension(extension);
}

export function categoryForMime(mimeType: string): FileCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType.includes("word") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType.includes("officedocument") ||
    mimeType.includes("opendocument") ||
    mimeType === "application/rtf" ||
    mimeType === "application/json" ||
    mimeType === "application/epub+zip"
  ) {
    return "document";
  }
  if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip") ||
    mimeType.includes("x-bzip") ||
    mimeType.includes("x-xz") ||
    mimeType === "application/vnd.rar"
  ) {
    return "archive";
  }
  return "other";
}

export function extensionCategory(extension: string): FileCategory | undefined {
  const mime = mimeForExtension(extension);
  return mime ? categoryForMime(mime) : undefined;
}

export function isInlineSafeMime(mimeType: string): boolean {
  return (
    (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/") ||
    mimeType === "application/pdf" ||
    mimeType === "text/plain"
  );
}

export function canPreviewFile(mimeType: string, extension: string): boolean {
  if (isInlineSafeMime(mimeType)) return true;
  return ["json", "csv", "md"].includes(extension.toLowerCase());
}

export function categoryMatchesFilter(category: FileCategory, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "documents") return category === "document";
  if (filter === "images") return category === "image";
  if (filter === "videos") return category === "video";
  if (filter === "audio") return category === "audio";
  if (filter === "archives") return category === "archive";
  if (filter === "other") return category === "other";
  return false;
}

/**
 * Ensures the detected container is compatible with the declared extension.
 * The browser is never trusted to decide which MIME type is served.
 */
export function isMimeCompatibleWithExtension(
  extension: string,
  detectedMime: string,
  claimedMime: string
): boolean {
  const ext = extension.toLowerCase();
  const expected = EXTENSION_MIME[ext];
  if (!expected) return false;

  if (isDangerousExtension(ext)) return false;

  if (["docx", "xlsx", "pptx", "odt", "ods", "odp", "epub"].includes(ext)) {
    return (
      detectedMime === "application/zip" ||
      detectedMime === expected ||
      detectedMime === "application/x-zip-compressed"
    );
  }
  if (ext === "zip" || ext === "7z" || ext === "rar" || ext === "gz" || ext === "tgz") {
    return detectedMime === expected;
  }
  if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
    return (
      detectedMime === "application/octet-stream" ||
      detectedMime.startsWith("text/") ||
      detectedMime === "application/json" ||
      detectedMime === expected ||
      claimedMime.startsWith("text/") ||
      claimedMime === "application/json"
    );
  }
  if (ext === "mov") {
    return detectedMime === "video/quicktime" || detectedMime === "video/mp4";
  }
  if (ext === "m4v" || ext === "mp4") {
    return detectedMime === "video/mp4" || detectedMime === "video/quicktime";
  }
  if (ext === "heic" || ext === "heif") {
    return detectedMime === "image/heif" || detectedMime === "image/heic";
  }
  if (ext === "tif" || ext === "tiff") return detectedMime === "image/tiff";
  return detectedMime === expected || detectedMime === claimedMime;
}

export function safeMimeForServing(mimeType: string): string {
  if (!mimeType || /[\r\n]/.test(mimeType)) return "application/octet-stream";
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mimeType)) {
    return "application/octet-stream";
  }
  if (isDangerousMime(mimeType)) return "application/octet-stream";
  return mimeType;
}

export function isDangerousMime(mimeType: string): boolean {
  const value = mimeType.toLowerCase();
  return (
    value === "image/svg+xml" ||
    value === "text/html" ||
    value === "application/xhtml+xml" ||
    value.includes("javascript") ||
    value.includes("x-shockwave-flash") ||
    value.includes("x-msdownload") ||
    value.includes("x-executable")
  );
}
