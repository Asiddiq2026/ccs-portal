// Auth.js catch-all route: sign-in, callback, session, sign-out endpoints.
// The handlers come straight from the NextAuth config in src/auth.ts.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
