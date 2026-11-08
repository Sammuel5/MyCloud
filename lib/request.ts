import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from "zod";
import { trustForwardedHeaders } from "@/lib/config";
import { logger } from "@/lib/logger";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "REQUEST_FAILED", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(): never {
  throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
}

export function forbidden(message = "You do not have permission to do that"): never {
  throw new ApiError(403, message, "FORBIDDEN");
}

export function notFound(message = "Item not found"): never {
  throw new ApiError(404, message, "NOT_FOUND");
}

export function requestIp(request: NextRequest | Request): string | null {
  const headers = request.headers;
  if (trustForwardedHeaders()) {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  }
  const realIp = headers.get("x-real-ip");
  return realIp?.trim() || null;
}

export function userAgent(request: NextRequest | Request): string {
  return (request.headers.get("user-agent") || "unknown").slice(0, 500);
}

export function hostForRequest(request: NextRequest | Request): string | null {
  if (trustForwardedHeaders()) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost) return forwardedHost.split(",")[0]?.trim() || null;
  }
  return request.headers.get("host");
}

/**
 * Explicit same-origin protection for every cookie-authenticated mutation.
 * Auth.js has its own CSRF protection for its endpoints.
 */
export function assertSameOrigin(request: NextRequest | Request): void {
  const origin = request.headers.get("origin");
  const expectedHost = hostForRequest(request);
  if (!origin || !expectedHost) {
    throw new ApiError(403, "Request origin could not be verified", "CSRF_REJECTED");
  }
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError(403, "Invalid request origin", "CSRF_REJECTED");
  }
  if (originUrl.host.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new ApiError(403, "Cross-origin request rejected", "CSRF_REJECTED");
  }
  if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") {
    throw new ApiError(403, "Invalid request origin", "CSRF_REJECTED");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new ApiError(403, "Cross-site request rejected", "CSRF_REJECTED");
  }
}

export async function readJson<S extends ZodTypeAny>(
  request: Request,
  schema: S
): Promise<ZodInfer<S>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Expected application/json", "UNSUPPORTED_MEDIA_TYPE");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body", "INVALID_JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parsed.error.flatten());
  }
  return parsed.data;
}

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers || {}),
    },
  });
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return json(
      { error: error.message, code: error.code, details: error.details ?? undefined },
      { status: error.status }
    );
  }
  if (error instanceof ZodError) {
    return json(
      { error: "Validation failed", code: "VALIDATION_ERROR", details: error.flatten() },
      { status: 400 }
    );
  }

  const errno = error as { code?: string | number; name?: string };
  if (errno?.code === "ENOSPC") {
    return json(
      { error: "The storage volume is full. Free space and try again.", code: "STORAGE_FULL" },
      { status: 507 }
    );
  }
  if (errno?.code === 11000) {
    return json(
      { error: "That name or sharing entry already exists.", code: "CONFLICT" },
      { status: 409 }
    );
  }
  if (errno?.name === "CastError") {
    return json({ error: "Invalid identifier", code: "INVALID_ID" }, { status: 400 });
  }
  if (errno?.name === "MongooseServerSelectionError" || errno?.name === "MongoNetworkError") {
    logger.error("Database unavailable while handling API request", { error });
    return json(
      { error: "The database is temporarily unavailable.", code: "DATABASE_UNAVAILABLE" },
      { status: 503 }
    );
  }

  logger.error("Unhandled API error", { error });
  return json(
    { error: "An unexpected server error occurred.", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}

export function assertMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new ApiError(405, "Method not allowed", "METHOD_NOT_ALLOWED");
  }
}
