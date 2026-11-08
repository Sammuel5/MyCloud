/**
 * Standalone background worker. The web process starts its own worker through
 * instrumentation.ts; use this script only when you intentionally run media and
 * maintenance jobs in a separate Windows service and set
 * MYCLOUD_DISABLE_WORKER=true for the web service.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

async function main(): Promise<void> {
  if (process.env.MYCLOUD_DISABLE_WORKER === "true") {
    console.error(
      "MYCLOUD_DISABLE_WORKER=true is set. The standalone worker cannot run with the worker disabled."
    );
    process.exit(1);
  }

  const { connectDB } = await import("@/lib/db");
  const { startBackgroundWorkers } = await import("@/lib/worker");
  const { logger } = await import("@/lib/logger");

  const connection = await connectDB();
  startBackgroundWorkers();
  logger.info("Standalone MyCloud worker is running");

  const keepAlive = setInterval(() => undefined, 60 * 60 * 1000);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("Worker shutting down", { signal });
    clearInterval(keepAlive);
    await connection.disconnect().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Worker failed to start:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
