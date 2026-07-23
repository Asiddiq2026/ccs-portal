import type { TenantRole } from "@/lib/db";

// Augment Auth.js types so `role` + `arId` are first-class on the session/JWT.
declare module "next-auth" {
  interface Session {
    user: {
      role: TenantRole;
      arId: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    role?: TenantRole;
    arId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: TenantRole;
    arId?: string;
  }
}
