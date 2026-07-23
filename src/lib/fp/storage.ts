import { createHash } from "node:crypto";

// WORM document storage abstraction for the Financial Promotions channel.
// The service depends only on this interface, so it is unit-testable without
// Azure. The production adapter (Azure Blob with an immutability policy, or S3 +
// Object Lock) lands with Phase 8 deploy config; the in-memory adapter below is
// for tests and local dev.

/** SHA-256 of the given bytes, lowercase hex. Server-side, deterministic. */
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface UploadInput {
  /** Original filename (used only for the manifest; not the blob key). */
  name: string;
  contentType?: string;
  bytes: Uint8Array;
}

export interface StoredBlob {
  /** Durable, immutable URL of the stored object. */
  blobUrl: string;
  /** Content hash — the blob is addressed by it (WORM: write once). */
  sha256: string;
  size: number;
}

export interface BlobStore {
  /**
   * Writes the object under an immutability policy and returns its manifest.
   * MUST be idempotent on content hash: re-putting identical bytes returns the
   * same immutable URL rather than overwriting (write-once semantics).
   */
  put(input: UploadInput): Promise<StoredBlob>;
}

/**
 * In-memory, content-addressed BlobStore for tests and local dev. Hashes the
 * bytes, refuses to mutate an existing object with the same hash (WORM), and
 * hands back a stable `mem://` URL. Not for production.
 */
export function createInMemoryBlobStore(container = "ccs-docs"): BlobStore & {
  size(): number;
} {
  const objects = new Map<string, Uint8Array>();
  return {
    async put({ bytes }) {
      const hash = sha256(bytes);
      const existing = objects.get(hash);
      if (existing) {
        // WORM: identical content is fine; differing content under the same
        // hash is impossible, so nothing is ever overwritten.
        return { blobUrl: `mem://${container}/${hash}`, sha256: hash, size: existing.length };
      }
      objects.set(hash, bytes);
      return { blobUrl: `mem://${container}/${hash}`, sha256: hash, size: bytes.length };
    },
    size() {
      return objects.size;
    },
  };
}
