/**
 * First-run system check.
 *
 * Validates environment configuration, creates the storage layout, connects to
 * MongoDB, creates collections/indexes and initializes server settings.
 *
 * Run with: npm run setup
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

function fail(message: string): never {
  console.error(`\n[ERROR] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("MyCloud setup\n-------------");

  if (Number(process.versions.node.split(".")[0]) < 20) {
    fail(`Node.js 20.11 or newer is required (found ${process.version}).`);
  }

  const { getAuthSecret, getMongoUri, getStorageRoot } = await import("@/lib/config");
  let storageRoot: string;
  try {
    getAuthSecret();
    getMongoUri();
    storageRoot = getStorageRoot();
  } catch (error) {
    fail(error instanceof Error ? error.message : "Invalid environment configuration");
  }

  console.log(`Storage path: ${storageRoot}`);
  console.log("Checking MongoDB and creating indexes…");

  const { default: mongoose } = await import("mongoose");
  const { connectDB } = await import("@/lib/db");
  const { ensureStorageLayout } = await import("@/lib/storage");
  const { getSystemSettings } = await import("@/lib/settings");
  const { checkMediaBinaries } = await import("@/lib/media-health");
  const { User } = await import("@/models/User");
  const { File } = await import("@/models/File");
  const { Folder } = await import("@/models/Folder");
  const { Share } = await import("@/models/Share");
  const { ShareLink } = await import("@/models/ShareLink");
  const { Star } = await import("@/models/Star");
  const { UploadSession } = await import("@/models/UploadSession");
  const { UserSession } = await import("@/models/UserSession");
  const { Job } = await import("@/models/Job");
  const { AuditLog } = await import("@/models/AuditLog");
  const { RateLimitBucket } = await import("@/models/RateLimitBucket");
  const { SystemSetting } = await import("@/models/SystemSetting");

  try {
    await ensureStorageLayout();
    await connectDB();
    await getSystemSettings();

    const models = [
      User,
      File,
      Folder,
      Share,
      ShareLink,
      Star,
      UploadSession,
      UserSession,
      Job,
      AuditLog,
      RateLimitBucket,
      SystemSetting,
    ];
    for (const model of models) {
      await model.syncIndexes();
    }

    const [admins, users] = await Promise.all([
      User.countDocuments({ role: "admin", active: true }),
      User.countDocuments({}),
    ]);

    console.log("Storage layout: OK");
    console.log("MongoDB: connected, indexes synchronized");
    console.log(`Accounts: ${users} total, ${admins} active administrator(s)`);

    const binaries = await checkMediaBinaries();
    if (binaries.ffmpeg.ok) {
      console.log(`FFmpeg: ${binaries.ffmpeg.version || "available"}`);
    } else {
      console.warn("FFmpeg: unavailable — video thumbnails will be skipped");
    }
    if (binaries.ffprobe.ok) {
      console.log(`FFprobe: ${binaries.ffprobe.version || "available"}`);
    } else {
      console.warn("FFprobe: unavailable — video metadata will be skipped");
    }

    if (admins === 0) {
      console.log("\nNo administrator exists yet. Create one with:\n  npm run setup:admin");
    } else {
      console.log("\nSetup complete. Start the app with: npm run build && npm start");
    }
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("\nSetup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
