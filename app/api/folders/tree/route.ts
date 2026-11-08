import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { queryObject } from "@/lib/api-guard";
import { getFolderPickerTree } from "@/lib/folders";
import { handleApiError, json } from "@/lib/request";
import { folderTreeQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requirePasswordReadyApiUser();
    const parsed = folderTreeQuerySchema.safeParse(queryObject(request));
    if (!parsed.success) {
      return json(
        { error: "Invalid tree parameters", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const folders = await getFolderPickerTree(user.id, parsed.data.exclude);
    return json({ folders });
  } catch (error) {
    return handleApiError(error);
  }
}
