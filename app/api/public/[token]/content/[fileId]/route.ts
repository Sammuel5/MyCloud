import type { NextRequest } from "next/server";
import { requireUnlockedPublicLink } from "@/lib/public-access";
import { recordPublicLinkAccess, validatePublicFile } from "@/lib/shares";
import { fileContentResponse } from "@/lib/content-response";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  handleApiError,
  requestIp,
  userAgent,
} from "@/lib/request";
import { hashIpAddress } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(
  request: NextRequest,
  params: { token: string; fileId: string }
): Promise<Response> {
  const resolved = await requireUnlockedPublicLink(request, params.token);
  const ip = requestIp(request) || "unknown";
  const limit = await consumeRateLimit(
    "public-file",
    `${resolved.link._id}:${ip}`,
    300,
    15 * 60
  );
  if (!limit.allowed) {
    throw new ApiError(429, "Too many requests. Try again later.", "RATE_LIMITED");
  }
  const file = await validatePublicFile(resolved.link, params.fileId);
  const isDownload = new URL(request.url).searchParams.get("download") === "1";
  if (isDownload && !resolved.link.allowDownload) {
    throw new ApiError(403, "Downloads are disabled for this share", "DOWNLOAD_DISABLED");
  }
  await recordPublicLinkAccess(
    resolved.link._id.toString(),
    hashIpAddress(ip),
    userAgent(request),
    isDownload ? "download" : "view"
  );
  return fileContentResponse(request, file, {
    allowDownload: resolved.link.allowDownload,
    previewOnly: true,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string; fileId: string } }
) {
  try {
    return await handle(request, params);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: { token: string; fileId: string } }
) {
  try {
    return await handle(request, params);
  } catch (error) {
    return handleApiError(error);
  }
}
