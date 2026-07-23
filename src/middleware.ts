// Route protection at the edge: any request whose path is not excluded by the
// matcher below is gated by the Auth.js `authorized` callback (src/auth.ts),
// which returns false for an unauthenticated user — fail closed. Auth.js then
// redirects to the sign-in page. This is a coarse gate; per-request tenant
// isolation is still enforced downstream by RLS via withTenant().
export { auth as middleware } from "@/auth";

export const config = {
  // Run on everything except the Auth.js endpoints, Next internals, and static
  // assets. Excluding /api/auth is required or the sign-in flow deadlocks.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
