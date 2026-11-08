/**
 * Health check used by Windows service monitors and manual troubleshooting.
 * Exits 0 when the app and storage report healthy, 1 otherwise.
 */
async function main(): Promise<void> {
  const url = process.env.MYCLOUD_HEALTH_URL || "http://127.0.0.1:3000/api/health";
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    console.log(`HTTP ${response.status}`, JSON.stringify(body));
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.error(
      `Health check failed for ${url}:`,
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  }
}

void main();
