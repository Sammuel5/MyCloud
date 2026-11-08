import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getAuthSecret, getSessionMaxAgeSeconds } from "@/lib/config";
import { connectDB } from "@/lib/db";
import { getSystemSettings } from "@/lib/settings";
import { createAuthSession, revokeAuthSession } from "@/lib/auth-sessions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { auditEvent } from "@/lib/audit";
import { hashIpAddress } from "@/lib/crypto";
import { requestIp, userAgent } from "@/lib/request";
import { loginSchema } from "@/lib/validation";
import { User } from "@/models/User";
import { logger } from "@/lib/logger";

// A fixed bcrypt hash keeps failed unknown-user logins indistinguishable in
// timing from a wrong password for an existing account.
const DUMMY_PASSWORD_HASH =
  "$2b$12$7d5WrQMJV7amODGwxxlIg.pZhwYdUNWNkWt5uc0b3cVIx1YBQdUZK";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: getAuthSecret(),
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: getSessionMaxAgeSeconds(),
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const ip = requestIp(request) || "unknown";
        const ipHash = hashIpAddress(ip);
        const ua = userAgent(request);

        const ipLimit = await consumeRateLimit("login-ip", ip, 30, 15 * 60);
        const accountLimit = await consumeRateLimit(
          "login-account",
          parsed.data.email,
          8,
          15 * 60
        );
        if (!ipLimit.allowed || !accountLimit.allowed) {
          await auditEvent({
            action: "auth.login.rate_limited",
            actorEmail: parsed.data.email,
            severity: "security",
            ipHash,
            userAgent: ua,
          });
          return null;
        }

        await connectDB();
        await getSystemSettings();

        const user = await User.findOne({ email: parsed.data.email })
          .select("+passwordHash")
          .lean();

        const passwordValid = await bcrypt.compare(
          parsed.data.password,
          user?.passwordHash || DUMMY_PASSWORD_HASH
        );

        if (!user || !passwordValid || !user.active) {
          await auditEvent({
            actorId: user?._id,
            actorEmail: parsed.data.email,
            action: "auth.login.failed",
            severity: "security",
            ipHash,
            userAgent: ua,
          });
          return null;
        }

        if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
          await auditEvent({
            actorId: user._id,
            actorEmail: user.email,
            action: "auth.login.locked",
            severity: "security",
            ipHash,
            userAgent: ua,
          });
          return null;
        }

        const created = await createAuthSession(user._id, request);
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              lastLoginAt: new Date(),
              failedLoginCount: 0,
              lockedUntil: null,
            },
          }
        );

        await auditEvent({
          actorId: user._id,
          actorEmail: user.email,
          action: "auth.login.success",
          severity: "info",
          ipHash,
          userAgent: ua,
        });
        logger.info("User signed in", { userId: user._id.toString() });

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          authSessionHash: created.sidHash,
          sessionVersion: user.sessionVersion,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.authSessionHash = user.authSessionHash;
        token.sessionVersion = user.sessionVersion;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = token.role || "user";
        session.user.authSessionHash = token.authSessionHash || "";
        session.user.sessionVersion = token.sessionVersion || 0;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && message.token?.authSessionHash) {
        await revokeAuthSession(message.token.authSessionHash);
      }
    },
  },
});
