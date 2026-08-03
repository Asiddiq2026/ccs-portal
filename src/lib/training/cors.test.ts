import { describe, it, expect } from "vitest";
import { parseAllowedOrigins, corsHeadersFor } from "./cors";

describe("parseAllowedOrigins", () => {
  it("splits on commas/whitespace and strips trailing slashes", () => {
    expect(parseAllowedOrigins("http://localhost:4173, https://training.example.com/")).toEqual([
      "http://localhost:4173",
      "https://training.example.com",
    ]);
  });

  it("is empty (fail closed) for unset/blank config", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
    expect(parseAllowedOrigins("  ,  ")).toEqual([]);
  });
});

describe("corsHeadersFor", () => {
  const env = { TRAINING_CORS_ORIGINS: "http://localhost:4173" };

  it("returns headers echoing an allowlisted origin", () => {
    const h = corsHeadersFor("http://localhost:4173", env)!;
    expect(h["access-control-allow-origin"]).toBe("http://localhost:4173");
    expect(h["access-control-allow-methods"]).toContain("POST");
    expect(h["access-control-allow-headers"]).toContain("authorization");
    expect(h.vary).toBe("Origin");
  });

  it("never wildcards — the origin is echoed, not *", () => {
    const h = corsHeadersFor("http://localhost:4173", env)!;
    expect(Object.values(h)).not.toContain("*");
  });

  it("returns null for an unlisted origin, no origin, or empty config", () => {
    expect(corsHeadersFor("http://evil.example.com", env)).toBeNull();
    expect(corsHeadersFor(null, env)).toBeNull();
    expect(corsHeadersFor("http://localhost:4173", {})).toBeNull();
  });

  it("treats a trailing slash on the request origin as equivalent", () => {
    expect(corsHeadersFor("http://localhost:4173/", env)).not.toBeNull();
  });
});
