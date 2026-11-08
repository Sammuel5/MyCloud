import path from "node:path";

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function getStorageRoot(): string {
  const raw = process.env.MYCLOUD_STORAGE_PATH;
  if (!raw || !raw.trim()) {
    throw new Error("MYCLOUD_STORAGE_PATH is not configured");
  }
  if (!path.isAbsolute(raw)) {
    throw new Error("MYCLOUD_STORAGE_PATH must be an absolute path (for example D:\\MyCloudStorage)");
  }
  const resolved = path.resolve(raw);
  if (path.dirname(resolved) === resolved) {
    throw new Error("MYCLOUD_STORAGE_PATH must be a dedicated folder, not a filesystem root");
  }
  return resolved;
}

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  return uri;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

export function getAppName(): string {
  return process.env.MYCLOUD_APP_NAME?.trim() || "MyCloud";
}

export function getAppUrl(): string | undefined {
  const value = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    throw new Error("AUTH_URL must be a valid absolute URL");
  }
}

export function getSessionMaxAgeSeconds(): number {
  return readInt("MYCLOUD_SESSION_DAYS", 7, 1, 30) * 24 * 60 * 60;
}

export function getMaxUploadBytes(): number {
  return readInt("MYCLOUD_MAX_UPLOAD_BYTES", 20 * 1024 ** 3, 1024, 1024 ** 4);
}

export function getChunkSizeBytes(): number {
  return readInt("MYCLOUD_CHUNK_SIZE_BYTES", 32 * 1024 * 1024, 256 * 1024, 64 * 1024 * 1024);
}

export function getDefaultQuotaBytes(): number {
  return readInt("MYCLOUD_DEFAULT_QUOTA_BYTES", 0, 0, Number.MAX_SAFE_INTEGER);
}

export function getTempUploadHours(): number {
  return readInt("MYCLOUD_TEMP_UPLOAD_HOURS", 24, 1, 7 * 24);
}

export function getTrashRetentionFallbackDays(): number {
  return readInt("MYCLOUD_TRASH_RETENTION_DAYS", 30, 1, 3650);
}

export function getLogLevel(): string {
  return process.env.MYCLOUD_LOG_LEVEL || "info";
}

export function trustForwardedHeaders(): boolean {
  return process.env.MYCLOUD_TRUST_FORWARDED_HEADERS !== "false";
}

export function getFfmpegPath(): string | undefined {
  return process.env.MYCLOUD_FFMPEG_PATH?.trim() || undefined;
}

export function getFfprobePath(): string | undefined {
  return process.env.MYCLOUD_FFPROBE_PATH?.trim() || undefined;
}

export function publicOriginFromHeaders(headers: Headers): string {
  const configured = getAppUrl();
  if (trustForwardedHeaders()) {
    const forwardedHost = headers.get("x-forwarded-host");
    const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedHost && forwardedProto) {
      return `${forwardedProto}://${forwardedHost}`;
    }
  }
  if (configured) return configured;
  const host = headers.get("host");
  if (!host) return "http://localhost:3000";
  return `http://${host}`;
}
