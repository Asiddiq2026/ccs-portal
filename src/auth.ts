import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import type { TenantRole } from "@/lib/db";

// Fixed dev users so tenancy can be exercised locally without a real IdP.
// AR is scoped to one firm; COMPLIANCE/SMF are network-scoped.
const DEV_USERS: Record<string, { id: string; name: string; role: TenantRole; arId: string }> = {
  ar: { id: "u-ar", name: "SIX AR user", role: "AR", arId: "ar_six" },
  compliance: { id: "u-comp", name: "Razlin Compliance", role: "COMPLIANCE", arId: "" },
  smf: { id: "u-smf", name: "SMF16/17", role: "SMF", arId: "" },
};

const providers: Provider[] = [];

// Enterprise SSO — generic OIDC, swappable Entra ID <-> Okta purely via env.
// `role` and `arId` are expected as mapped claims on the IdP token.
if (process.env.AUTH_ISSUER) {
  providers.push({
    id: "oidc",
    name: "SSO",
    type: "oidc",
    issuer: process.env.AUTH_ISSUER,
    clientId: process.env.AUTH_CLIENT_ID,
    clientSecret: process.env.AUTH_CLIENT_SECRET,
    profile(profile: Record<string, unknown>) {
      return {
        id: String(profile.sub),
        name: profile.name as string | undefined,
        email: profile.email as string | undefined,
        role: (profile.role ?? profile["extension_role"]) as TenantRole,
        arId: (profile.arId ?? profile["extension_arId"] ?? "") as string,
      };
    },
  });
}

// Dev-only local login (never in production).
if (process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { user: { label: "User (ar | compliance | smf)", type: "text" } },
      authorize(creds) {
        return DEV_USERS[String(creds?.user)] ?? null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    // Carry role + arId from the provider profile onto the JWT...
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: TenantRole }).role;
        token.arId = (user as { arId?: string }).arId ?? "";
      }
      return token;
    },
    // ...and expose them on the session for server components / helpers.
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as TenantRole;
        session.user.arId = (token.arId as string) ?? "";
      }
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
