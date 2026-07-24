import { describe, it, expect } from "vitest";
import {
  storeCertificate,
  CertificateError,
  type CertificateStore,
  type CertManifest,
  type CertAudit,
} from "./certificate";
import { createInMemoryBlobStore } from "../fp/storage";
import type { Tenant } from "../tools/types";

// A minimal valid PDF payload (must start with the %PDF magic bytes).
const pdf = (marker: string) => Buffer.from(`%PDF-1.4\n${marker}\n%%EOF`).toString("base64");

function makeDeps() {
  const blob = createInMemoryBlobStore("ccs-docs");
  const manifests: CertManifest[] = [];
  const audits: CertAudit[] = [];
  const store: CertificateStore = {
    async record({ manifest, audit }) {
      manifests.push(manifest);
      audits.push(audit);
      return { id: `cert_${manifests.length}` };
    },
    async listForEvidence(filter) {
      return manifests
        .filter((m) => m.arId === filter.arId && (!filter.person || m.person === filter.person))
        .map((m) => ({ name: m.name, sha256: m.sha256, blobUrl: m.blobUrl, size: m.size }));
    },
  };
  return { deps: { blob, store }, blob, manifests, audits, store };
}

const OPERATOR: Tenant = { role: "COMPLIANCE", arId: "" };
const AR_CODRINGTON: Tenant = { role: "AR", arId: "ar_codrington" };

function certInput(over: Record<string, unknown> = {}) {
  return {
    arId: "ar_codrington",
    person: "Rob Tull",
    moduleId: "m6",
    certificateId: "CERT-1",
    filename: "cert.pdf",
    contentBase64: pdf("cert one"),
    ...over,
  };
}

describe("storeCertificate — WORM ingest", () => {
  it("stores a PDF in the blob store and records the manifest + audit", async () => {
    const { deps, blob, manifests, audits } = makeDeps();
    const res = await storeCertificate(deps, OPERATOR, certInput());

    expect(res.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.blobUrl).toContain(res.sha256); // content-addressed
    expect(res.size).toBeGreaterThan(0);
    expect(blob.size()).toBe(1);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({ arId: "ar_codrington", certificateId: "CERT-1", sha256: res.sha256 });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("CERTIFICATE STORED");
    expect(audits[0].entity).toBe("training_certificate");
  });

  it("is WORM idempotent — identical bytes reuse the same immutable object", async () => {
    const { deps, blob } = makeDeps();
    const a = await storeCertificate(deps, OPERATOR, certInput());
    const b = await storeCertificate(deps, OPERATOR, certInput({ certificateId: "CERT-2" }));
    expect(a.sha256).toBe(b.sha256);
    expect(a.blobUrl).toBe(b.blobUrl);
    expect(blob.size()).toBe(1); // one object, not two
  });

  it("lets an AR store for its own firm; forbids another firm (403)", async () => {
    const { deps, manifests } = makeDeps();
    await storeCertificate(deps, AR_CODRINGTON, certInput());
    expect(manifests).toHaveLength(1);

    await expect(
      storeCertificate(deps, AR_CODRINGTON, certInput({ arId: "ar_six" })),
    ).rejects.toMatchObject({ status: 403 });
    expect(manifests).toHaveLength(1); // nothing stored for the other firm
  });

  it("rejects non-PDF content, invalid base64, and empty payloads (fail closed)", async () => {
    const { deps, blob } = makeDeps();
    await expect(
      storeCertificate(deps, OPERATOR, certInput({ contentBase64: Buffer.from("hello").toString("base64") })),
    ).rejects.toMatchObject({ status: 400 }); // valid base64 but not a PDF
    await expect(
      storeCertificate(deps, OPERATOR, certInput({ contentBase64: "!!!not base64!!!" })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      storeCertificate(deps, OPERATOR, certInput({ filename: "" })),
    ).rejects.toBeInstanceOf(CertificateError);
    expect(blob.size()).toBe(0); // nothing was written
  });
});

describe("cert → evidence wiring", () => {
  it("stored certificates surface as gather_docs-shaped evidence docs", async () => {
    const { deps, store } = makeDeps();
    await storeCertificate(deps, OPERATOR, certInput({ certificateId: "CERT-A", contentBase64: pdf("a") }));
    await storeCertificate(deps, OPERATOR, certInput({ certificateId: "CERT-B", contentBase64: pdf("b") }));

    const docs = await store.listForEvidence({ arId: "ar_codrington", person: "Rob Tull" }, OPERATOR);
    expect(docs).toHaveLength(2);
    for (const d of docs) {
      expect(d).toHaveProperty("name");
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(d.blobUrl).toContain(d.sha256);
      expect(d.size).toBeGreaterThan(0);
    }
  });
});
