/**
 * Creates the initial administrator account. No password is stored in source
 * code or environment files; the password is entered interactively.
 *
 * Run with: npm run setup:admin
 * Add --force to skip the confirmation when an administrator already exists.
 */
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

const force = process.argv.includes("--force");

function fail(message: string): never {
  console.error(`\n[ERROR] ${message}\n`);
  process.exit(1);
}

function promptHidden(label: string): Promise<string> {
  if (!input.isTTY) {
    const rl = readline.createInterface({ input, output });
    return rl.question(label).finally(() => rl.close());
  }

  return new Promise((resolve, reject) => {
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    let settled = false;

    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0003") {
          finish(new Error("Cancelled"));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    };

    input.on("data", onData);
  });
}

async function ask(rl: readline.Interface, question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

async function main(): Promise<void> {
  const { emailSchema, passwordSchema } = await import("@/lib/validation");
  const { connectDB } = await import("@/lib/db");
  const { getAuthSecret, getMongoUri, getStorageRoot } = await import("@/lib/config");
  const { User } = await import("@/models/User");
  const { auditEvent } = await import("@/lib/audit");
  const bcrypt = (await import("bcryptjs")).default;
  const { default: mongoose } = await import("mongoose");

  try {
    getAuthSecret();
    getMongoUri();
    getStorageRoot();
  } catch (error) {
    fail(error instanceof Error ? error.message : "Environment is not configured");
  }

  console.log("Create a MyCloud administrator\n-------------------------------");
  console.log("The password is entered without echoing and is hashed with bcrypt.\n");

  await connectDB();

  const [adminCount, totalUsers] = await Promise.all([
    User.countDocuments({ role: "admin", active: true }),
    User.countDocuments({}),
  ]);

  const rl = readline.createInterface({ input, output });
  let name: string;
  let email: string;
  try {
    if (adminCount > 0 && !force) {
      console.log(`There are already ${adminCount} active administrator account(s).`);
      const answer = await ask(rl, "Create another administrator? [y/N] ");
      if (!/^y(es)?$/i.test(answer)) {
        console.log("Cancelled.");
        await mongoose.disconnect().catch(() => undefined);
        return;
      }
    }

    name = await ask(rl, "Display name: ");
    email = await ask(rl, "Email address: ");
  } finally {
    rl.close();
  }

  if (!name || name.length > 100) fail("Display name must be between 1 and 100 characters.");
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) fail(parsedEmail.error.issues[0]?.message || "Invalid email address.");

  let password: string;
  let confirmation: string;
  try {
    password = await promptHidden("Password (12+ chars, upper/lower/number/symbol): ");
    confirmation = await promptHidden("Confirm password: ");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Cancelled");
  }

  if (password !== confirmation) fail("Passwords do not match.");
  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) {
    fail(parsedPassword.error.issues.map((issue) => issue.message).join(" "));
  }

  const existing = await User.exists({ email: parsedEmail.data });
  if (existing) fail("An account already uses that email address.");

  const passwordHash = await bcrypt.hash(parsedPassword.data, 12);
  const user = await User.create({
    name,
    email: parsedEmail.data,
    passwordHash,
    role: "admin",
    active: true,
    mustChangePassword: false,
    storageQuotaBytes: 0,
    sessionVersion: 1,
    createdBy: null,
  });

  await auditEvent({
    actorId: user._id.toString(),
    actorEmail: user.email,
    action: "admin.bootstrap",
    targetType: "user",
    targetId: user._id.toString(),
    severity: "security",
    metadata: { totalUsersBefore: totalUsers },
  });

  console.log(`\nAdministrator created: ${user.email}`);
  console.log("Sign in at /login. Keep the password safe; it cannot be recovered.");
  await mongoose.disconnect().catch(() => undefined);
}

main().catch((error) => {
  console.error("\nCould not create administrator:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
