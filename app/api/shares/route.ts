import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { createUserShare } from "@/lib/shares";
import { handleApiError, json, readJson } from "@/lib/request";
import { shareSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireMutationUser(request);
    const input = await readJson(request, shareSchema);
    const share = await createUserShare({
      ownerId: user.id,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      email: input.email,
      role: input.role,
    });
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "share.created",
      targetType: input.resourceType,
      targetId: input.resourceId,
      metadata: { sharedWith: input.email, role: input.role },
    });
    return json({ share }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
