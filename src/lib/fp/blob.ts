// BlobStore selection for the Financial Promotions channel.
//
// This module is deliberately SDK-free: it parses/validates configuration and
// decides which adapter to use, dynamically importing the Azure SDK adapter
// ONLY when the account is configured. That keeps the SDK out of dev/test
// bundles and lets these helpers be unit-tested without installing it.
import type { AzureBlobConfig } from "./azure-blob";
import { createInMemoryBlobStore } from "./storage";
import type { BlobStore } from "./storage";

type Env = Record<string, string | undefined>;

const DEFAULT_CONTAINER = "ccs-docs";

/** True when both Azure Blob credentials are present. */
export function isBlobConfigured(env: Env = process.env): boolean {
  return Boolean(env.BLOB_ACCOUNT?.trim() && env.BLOB_KEY?.trim());
}

/**
 * Reads Azure Blob config from env, failing closed if a required piece is
 * missing. `BLOB_CONTAINER` defaults to `ccs-docs` (the immutability-enabled
 * container from docs/DEPLOY_AZURE.md).
 */
export function azureBlobConfigFromEnv(env: Env = process.env): AzureBlobConfig {
  const account = env.BLOB_ACCOUNT?.trim();
  const accountKey = env.BLOB_KEY?.trim();
  const container = env.BLOB_CONTAINER?.trim() || DEFAULT_CONTAINER;
  if (!account || !accountKey) {
    throw new Error("Azure Blob storage is not configured (set BLOB_ACCOUNT and BLOB_KEY).");
  }
  return { account, accountKey, container };
}

/**
 * Resolves the BlobStore for the current environment.
 *   - Configured (BLOB_ACCOUNT + BLOB_KEY) → the durable Azure WORM adapter.
 *   - Not configured in production        → throws (Invariant 9, fail closed):
 *     we never silently accept documents into a volatile in-memory store where
 *     they would be lost, since the FP channel's WORM manifest must be durable.
 *   - Not configured in dev/test          → in-memory adapter (local only).
 */
export async function resolveBlobStore(env: Env = process.env): Promise<BlobStore> {
  if (isBlobConfigured(env)) {
    const { createAzureBlobStore } = await import("./azure-blob");
    return createAzureBlobStore(azureBlobConfigFromEnv(env));
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to serve the FP channel without WORM storage: set BLOB_ACCOUNT / BLOB_KEY (Invariant 9, fail closed).",
    );
  }
  return createInMemoryBlobStore(env.BLOB_CONTAINER?.trim() || DEFAULT_CONTAINER);
}
