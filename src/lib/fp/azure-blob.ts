// Production WORM BlobStore backed by Azure Blob Storage.
//
// This module is the ONLY place the Azure SDK is imported, and it is loaded
// lazily by `resolveBlobStore` (src/lib/fp/blob.ts) only when the account is
// configured — so dev/test builds never pull the SDK into a bundle.
//
// WORM (write-once, read-many) is achieved two ways that reinforce each other:
//   1. Content addressing — the blob key IS the SHA-256 of the bytes, so
//      identical content always maps to the same object and differing content
//      can never collide onto an existing key.
//   2. Create-only writes — `ifNoneMatch: "*"` makes the upload a create, never
//      an overwrite. A repeat of identical content returns the existing object
//      instead of rewriting it. The container's immutability policy (time-based
//      retention / legal hold, configured out-of-band per docs/DEPLOY_AZURE.md)
//      is the durable backstop that blocks overwrite/delete regardless.
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { sha256 } from "./storage";
import type { BlobStore, StoredBlob, UploadInput } from "./storage";

export interface AzureBlobConfig {
  account: string;
  accountKey: string;
  container: string;
}

/** Duck-typed HTTP status from an Azure SDK RestError (avoids importing the type). */
function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const s = (err as { statusCode?: unknown }).statusCode;
    if (typeof s === "number") return s;
  }
  return undefined;
}

/**
 * Builds an Azure-backed BlobStore. Constructing the client performs no network
 * I/O; the first request happens on `put`. Callers should reach this only via
 * `resolveBlobStore`, which validates configuration and fails closed.
 */
export function createAzureBlobStore(cfg: AzureBlobConfig): BlobStore {
  const credential = new StorageSharedKeyCredential(cfg.account, cfg.accountKey);
  const service = new BlobServiceClient(
    `https://${cfg.account}.blob.core.windows.net`,
    credential,
  );
  const container = service.getContainerClient(cfg.container);

  return {
    async put({ contentType, bytes }: UploadInput): Promise<StoredBlob> {
      const hash = sha256(bytes);
      const blob = container.getBlockBlobClient(hash);
      const body = Buffer.from(bytes);
      try {
        await blob.uploadData(body, {
          conditions: { ifNoneMatch: "*" },
          blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined,
        });
        return { blobUrl: blob.url, sha256: hash, size: body.byteLength };
      } catch (err) {
        // 409 BlobAlreadyExists / 412 condition-not-met → WORM hit. The bytes
        // are identical by construction (key === content hash), so treat the
        // existing object as authoritative rather than overwriting it.
        const status = statusOf(err);
        if (status === 409 || status === 412) {
          const props = await blob.getProperties();
          return { blobUrl: blob.url, sha256: hash, size: props.contentLength ?? body.byteLength };
        }
        throw err;
      }
    },
  };
}
