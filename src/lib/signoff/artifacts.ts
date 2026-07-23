// Non-register sign-off ARTIFACTS. A prep/evidence pack is a read-only
// compilation of already-signed data — not a new regulated fact. So approving
// one does NOT write a FINAL register row (unlike the REGISTER_SCHEMAS in
// register-schemas.ts): it is an operator acknowledgement that the pack is
// complete and ready for the meeting / submission.
//
// Storage reuses the existing SignOffItem.register string column (no schema
// migration): an artifact draft carries one of these reserved values there and
// its frozen contents in the payload JSON. `isMaterialisable()` already returns
// false for these, so an artifact can never smuggle a FINAL register write; the
// decide service routes it to the approve-only branch instead.
import { z } from "zod";

// review_pack — oversight-meeting prep pack (agent-pre-meeting-prep).
const reviewPackPayload = z
  .object({
    arId: z.string().min(1),
    kind: z.literal("oversight_prep"),
    generatedAt: z.string().min(1),
    meetingDate: z.string().optional(),
    sections: z
      .array(
        z.object({
          heading: z.string().min(1),
          lines: z.array(z.string()),
        }),
      )
      .min(1),
  })
  .strip();

// evidence_pack — a manifest of already-stored WORM documents (agent-evidence-packer).
const evidencePackPayload = z
  .object({
    arId: z.string().min(1),
    purpose: z.string().min(1),
    generatedAt: z.string().min(1),
    docs: z
      .array(
        z.object({
          name: z.string().min(1),
          sha256: z.string().min(1),
          blobUrl: z.string().optional(),
          size: z.coerce.number().int().nonnegative().optional(),
        }),
      )
      .min(1),
  })
  .strip();

export const ARTIFACT_SCHEMAS = {
  review_pack: reviewPackPayload,
  evidence_pack: evidencePackPayload,
} as const;

export type ArtifactType = keyof typeof ARTIFACT_SCHEMAS;

export const ARTIFACT_TYPES = Object.keys(ARTIFACT_SCHEMAS) as ArtifactType[];

export function isArtifact(register: string): register is ArtifactType {
  return register in ARTIFACT_SCHEMAS;
}

export interface ValidatedArtifact {
  ok: boolean;
  data?: Record<string, unknown>;
  issues?: string[];
}

/** Validate an artifact payload before approval. Fail-closed on a malformed pack. */
export function validateArtifactPayload(register: string, payload: unknown): ValidatedArtifact {
  if (!isArtifact(register)) {
    return { ok: false, issues: [`"${register}" is not a sign-off artifact type`] };
  }
  const parsed = ARTIFACT_SCHEMAS[register].safeParse(payload);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}
