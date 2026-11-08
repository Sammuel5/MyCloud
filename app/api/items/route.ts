import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { queryObject } from "@/lib/api-guard";
import { handleApiError, json } from "@/lib/request";
import { itemsQuerySchema } from "@/lib/validation";
import { listItems } from "@/lib/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requirePasswordReadyApiUser();
    const parsed = itemsQuerySchema.safeParse(queryObject(request));
    if (!parsed.success) {
      return json(
        {
          error: "Invalid listing parameters",
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }
    const query = parsed.data;
    const result = await listItems({
      userId: user.id,
      quotaBytes: user.storageQuotaBytes,
      scope: query.scope,
      parentId: query.parentId || null,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      order: query.order,
      category: query.category,
      q: query.q,
    });
    return json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
