import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { getDashboardData } from "@/lib/dashboard";
import { handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePasswordReadyApiUser();
    return json(await getDashboardData(user));
  } catch (error) {
    return handleApiError(error);
  }
}
