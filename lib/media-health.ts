import { spawn } from "node:child_process";
import fs from "node:fs";
import { getFfmpegPath, getFfprobePath } from "@/lib/config";

export interface BinaryHealth {
  ok: boolean;
  path: string | null;
  version: string | null;
  error?: string;
}

async function resolveBinary(
  configured: string | undefined,
  packageName: "ffmpeg-static" | "ffprobe-static"
): Promise<string | null> {
  if (configured && fs.existsSync(configured)) return configured;
  try {
    if (packageName === "ffmpeg-static") {
      const mediaModule = await import("ffmpeg-static");
      const candidate = (mediaModule.default || mediaModule) as unknown as string;
      if (candidate && fs.existsSync(candidate)) return candidate;
    } else {
      const mediaModule = await import("ffprobe-static");
      const candidate = mediaModule.default?.path || mediaModule.path;
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // Fall back to PATH.
  }
  return packageName === "ffmpeg-static" ? "ffmpeg" : "ffprobe";
}

function runVersion(executable: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(executable, ["-version"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("Version check timed out"));
      }
    }, 8_000);
    timeout.unref?.();
    child.stdout.on("data", (data: Buffer) => {
      if (stdout.length < 8_000) stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      if (stderr.length < 8_000) stderr += data.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve((stdout || stderr).split(/\r?\n/)[0]?.trim() || "available");
      else reject(new Error((stderr || `Process exited with code ${code}`).trim().slice(0, 500)));
    });
  });
}

async function checkBinary(
  configured: string | undefined,
  packageName: "ffmpeg-static" | "ffprobe-static"
): Promise<BinaryHealth> {
  let executable: string | null = null;
  try {
    executable = await resolveBinary(configured, packageName);
    if (!executable) return { ok: false, path: null, version: null, error: "Not found" };
    const version = await runVersion(executable);
    return { ok: true, path: executable, version };
  } catch (error) {
    return {
      ok: false,
      path: executable,
      version: null,
      error: error instanceof Error ? error.message.slice(0, 500) : "Unavailable",
    };
  }
}

export async function checkMediaBinaries(): Promise<{
  ffmpeg: BinaryHealth;
  ffprobe: BinaryHealth;
}> {
  const [ffmpeg, ffprobe] = await Promise.all([
    checkBinary(getFfmpegPath(), "ffmpeg-static"),
    checkBinary(getFfprobePath(), "ffprobe-static"),
  ]);
  return { ffmpeg, ffprobe };
}
