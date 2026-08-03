// CORS for the training ingest routes — and ONLY those routes. The training
// platform is a separate app on a separate origin, and its browser calls carry
// an Authorization header, so they preflight. Everything else in the platform
// stays same-origin with no CORS surface at all.
//
// Fail-closed: TRAINING_CORS_ORIGINS unset/empty means no cross-origin caller
// is acknowledged — non-browser callers (curl, server-to-server) are unaffected
// by CORS, but browsers refuse to read the response.

type Env = Record<string, string | undefined>;

/** Parse the comma/whitespace-separated origin allowlist. */
export function parseAllowedOrigins(spec: string | undefined | null): string[] {
  if (!spec) return [];
  return spec
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Headers to attach for this request's Origin, or null when the origin is
 * absent or not allowlisted (in which case attach nothing — the browser then
 * enforces the block).
 */
export function corsHeadersFor(
  origin: string | null | undefined,
  env: Env = process.env,
): Record<string, string> | null {
  if (!origin) return null;
  const allowed = parseAllowedOrigins(env.TRAINING_CORS_ORIGINS);
  if (!allowed.includes(origin.replace(/\/+$/, ""))) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

/** Shared OPTIONS (preflight) handler for the training ingest routes. */
export function trainingPreflight(req: Request): Response {
  const headers = corsHeadersFor(req.headers.get("origin"));
  // 204 either way; without the headers the browser fails the preflight, which
  // is the fail-closed behaviour we want for unlisted origins.
  return new Response(null, { status: 204, headers: headers ?? {} });
}
