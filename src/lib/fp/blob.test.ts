import { describe, it, expect } from "vitest";
import { isBlobConfigured, azureBlobConfigFromEnv, resolveBlobStore } from "./blob";

// These tests exercise only the SDK-free config/selection logic. The Azure
// adapter itself is loaded lazily and is not imported here, so the suite runs
// without @azure/storage-blob installed.

describe("isBlobConfigured", () => {
  it("is true only when both account and key are present", () => {
    expect(isBlobConfigured({ BLOB_ACCOUNT: "acct", BLOB_KEY: "k" })).toBe(true);
    expect(isBlobConfigured({ BLOB_ACCOUNT: "acct" })).toBe(false);
    expect(isBlobConfigured({ BLOB_KEY: "k" })).toBe(false);
    expect(isBlobConfigured({})).toBe(false);
  });

  it("treats whitespace-only values as unset", () => {
    expect(isBlobConfigured({ BLOB_ACCOUNT: "  ", BLOB_KEY: "  " })).toBe(false);
  });
});

describe("azureBlobConfigFromEnv", () => {
  it("parses account/key and defaults the container to ccs-docs", () => {
    expect(azureBlobConfigFromEnv({ BLOB_ACCOUNT: "acct", BLOB_KEY: "k" })).toEqual({
      account: "acct",
      accountKey: "k",
      container: "ccs-docs",
    });
  });

  it("honours an explicit container", () => {
    const cfg = azureBlobConfigFromEnv({
      BLOB_ACCOUNT: "acct",
      BLOB_KEY: "k",
      BLOB_CONTAINER: "worm-prod",
    });
    expect(cfg.container).toBe("worm-prod");
  });

  it("fails closed when a credential is missing", () => {
    expect(() => azureBlobConfigFromEnv({ BLOB_ACCOUNT: "acct" })).toThrow();
    expect(() => azureBlobConfigFromEnv({})).toThrow();
  });
});

describe("resolveBlobStore", () => {
  it("returns an in-memory store in dev/test when unconfigured", async () => {
    const store = await resolveBlobStore({ NODE_ENV: "test" });
    const enc = new TextEncoder();
    const r = await store.put({ name: "a.pdf", bytes: enc.encode("hello") });
    expect(r.blobUrl.startsWith("mem://")).toBe(true);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to fall back to in-memory in production (fail closed)", async () => {
    await expect(resolveBlobStore({ NODE_ENV: "production" })).rejects.toThrow(/WORM/);
  });
});
