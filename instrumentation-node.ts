/**
 * Node-only startup. Kept in a separate module so the Edge instrumentation
 * compilation never pulls in filesystem or child-process code.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startBackgroundWorkers } = await import("@/lib/worker");
  startBackgroundWorkers();
}
