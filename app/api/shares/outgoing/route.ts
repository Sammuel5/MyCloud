import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { getOutgoingShares } from "@/lib/shares";
import { handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePasswordReadyApiUser();
    return json({ shares: await getOutgoingShares(user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}
