import { describe, it, expect } from "vitest";
import {
  hashToken,
  parseTokenRegistry,
  resolveServiceToken,
  serviceTokenTenant,
  TRAINING_INGEST_CAPABILITY,
} from "./service-token";

const RAW = "super-secret-codrington-ingest-token";
const HASH = hashToken(RAW);

describe("hashToken", () => {
  it("is deterministic and 64-hex, trimming whitespace", () => {
    expect(HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(`  ${RAW}  `)).toBe(HASH);
  });
});

describe("parseTokenRegistry", () => {
  it("parses arId:hash entries and ignores malformed ones", () => {
    const reg = parseTokenRegistry(`ar_codrington:${HASH}, garbage, ar_six:nothex`);
    expect(reg.size).toBe(1);
    expect(reg.get(HASH)).toEqual({ arId: "ar_codrington", capability: TRAINING_INGEST_CAPABILITY });
  });

  it("returns an empty registry for missing/empty config (fail closed)", () => {
    expect(parseTokenRegistry(undefined).size).toBe(0);
    expect(parseTokenRegistry("").size).toBe(0);
  });
});

describe("resolveServiceToken", () => {
  const reg = parseTokenRegistry(`ar_codrington:${HASH}`);

  it("resolves a valid bearer token to its scoped AR", () => {
    expect(resolveServiceToken(`Bearer ${RAW}`, reg)).toEqual({ arId: "ar_codrington" });
    expect(resolveServiceToken(`bearer ${RAW}`, reg)).toEqual({ arId: "ar_codrington" });
  });

  it("fails closed on an unknown token, wrong scheme, or missing header", () => {
    expect(resolveServiceToken(`Bearer wrong-token`, reg)).toBeNull();
    expect(resolveServiceToken(`Basic ${RAW}`, reg)).toBeNull();
    expect(resolveServiceToken(RAW, reg)).toBeNull();
    expect(resolveServiceToken(null, reg)).toBeNull();
    expect(resolveServiceToken(`Bearer ${RAW}`, new Map())).toBeNull();
  });
});

describe("serviceTokenTenant", () => {
  const reg = parseTokenRegistry(`ar_codrington:${HASH}`);

  it("maps a valid token to an AR-scoped tenant (narrowest scope)", () => {
    expect(serviceTokenTenant(`Bearer ${RAW}`, reg)).toEqual({ role: "AR", arId: "ar_codrington" });
  });

  it("returns null for an invalid token", () => {
    expect(serviceTokenTenant(`Bearer nope`, reg)).toBeNull();
  });
});
