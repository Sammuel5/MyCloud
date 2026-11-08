import { databaseHealth } from "@/lib/db";
import { storageHealth } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [database, storage] = await Promise.all([
    databaseHealth().catch(() => ({ ok: false })),
    storageHealth().catch(() => ({ ok: false, writable: false })),
  ]);
  const healthy = database.ok && storage.ok && storage.writable;
  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      database: database.ok ? "ok" : "unavailable",
      storage: storage.ok && storage.writable ? "ok" : "unavailable",
      time: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
