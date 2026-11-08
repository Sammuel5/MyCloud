import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/models/User";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      authSessionHash: string;
      sessionVersion: number;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    authSessionHash?: string;
    sessionVersion?: number;
    mustChangePassword?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: UserRole;
    authSessionHash?: string;
    sessionVersion?: number;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    authSessionHash?: string;
    sessionVersion?: number;
    mustChangePassword?: boolean;
  }
}
