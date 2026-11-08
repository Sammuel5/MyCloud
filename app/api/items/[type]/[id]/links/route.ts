import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { createPublicShareLink } from "@/lib/shares";
import { ApiError, handleApiError, json, readJson } from "@/lib/request";
import { publicLinkSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requireMutationUser(request);
    if (params.type !== "file" && params.type !== "folder") {
      throw new ApiError(404, "Unknown item type", "NOT_FOUND");
    }
    const input = await readJson(request, publicLinkSchema);
    if (input.resourceType !== params.type || input.resourceId !== params.id) {
      throw new ApiError(400, "Share target mismatch", "INVALID_RESOURCE");
    }
    const link = await createPublicShareLink({
      ownerId: user.id,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      password: input.password,
      expiresInDays: input.expiresInDays,
      allowDownload: input.allowDownload,
    });
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "share.link.created",
      targetType: params.type,
      targetId: params.id,
      metadata: {
        linkId: link.id,
        hasPassword: Boolean(input.password),
        expiresAt: link.expiresAt,
      },
    });
    return json({ link }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
