import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { revokePublicShareLink } from "@/lib/shares";
import { handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { linkId: string } }
) {
  try {
    const user = await requireMutationUser(request);
    await revokePublicShareLink(user.id, params.linkId);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "share.link.revoked",
      targetType: "share_link",
      targetId: params.linkId,
      severity: "info",
    });
    return json({ revoked: true });
  } catch (error) {
    return handleApiError(error);
  }
}
