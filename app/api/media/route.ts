import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { queryObject } from "@/lib/api-guard";
import { listMedia } from "@/lib/media";
import { handleApiError, json } from "@/lib/request";
import { mediaQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requirePasswordReadyApiUser();
    const parsed = mediaQuerySchema.safeParse(queryObject(request));
    if (!parsed.success) {
      return json(
        { error: "Invalid media parameters", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const query = parsed.data;
    return json(await listMedia(user.id, query.kind, query.page, query.limit));
  } catch (error) {
    return handleApiError(error);
  }
}
