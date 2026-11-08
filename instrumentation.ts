export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const nodeRuntime = await import("./instrumentation-node");
    await nodeRuntime.register();
  }
}
