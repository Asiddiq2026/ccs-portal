import { z } from "zod";
import type { Tool } from "./types";

/**
 * draft_template — COMPUTE. Renders a regulatory *notification draft* from a
 * fixed, deterministic template. It is used by agent-notification-drafter to
 * turn a flagged event into review-ready prose for the sign-off queue.
 *
 * It is deliberately pure (Invariant 7 — no free-form arithmetic; the ICO 72h
 * deadline is computed in code, not by the model) and has NO side effects: it
 * touches no DB, no network, no storage. The draft is not persisted here — the
 * agent must call write_register_entry to create a PENDING draft and
 * enqueue_for_signoff to route it. Every rendered draft carries doNotSend:true:
 * this tool can never send or file a notification (Invariant 2 — send_email /
 * file_regulatory remain withheld). The SMF is the sole egress.
 */

const KINDS = {
  SUP15: {
    label: "SUP 15 — Notification to the FCA",
    recipient: "Financial Conduct Authority",
    basis:
      "SUP 15.3 (matters having a serious regulatory impact) read with the principal's responsibility for its Appointed Representatives (SUP 12).",
  },
  PRINCIPLE11: {
    label: "Principle 11 — Disclosure to the regulator",
    recipient: "Financial Conduct Authority",
    basis:
      "PRIN 2.1.1R Principle 11 — a firm must deal with its regulators in an open and cooperative way and disclose anything of which the FCA would reasonably expect notice.",
  },
  ICO_ART33: {
    label: "GDPR Article 33 — Personal data breach notification",
    recipient: "Information Commissioner's Office (ICO)",
    basis:
      "UK GDPR Article 33 — notification of a personal data breach to the supervisory authority without undue delay and, where feasible, no later than 72 hours after becoming aware of it.",
  },
} as const;

type TemplateKind = keyof typeof KINDS;

/** UK GDPR Art 33 clock: 72 hours from awareness. Computed in code, not the model. */
function art33Deadline(awareAtIso: string): string {
  const t = Date.parse(awareAtIso);
  if (Number.isNaN(t)) return "UNKNOWN — awareAt not a valid date; SMF to confirm the 72h clock.";
  return new Date(t + 72 * 60 * 60 * 1000).toISOString();
}

export const draftTemplate: Tool = {
  name: "draft_template",
  kind: "COMPUTE",
  input: z.object({
    kind: z.enum(["SUP15", "PRINCIPLE11", "ICO_ART33"]),
    /** The firm the notification concerns (arId or firm name). */
    firm: z.string().min(1),
    /** One-line subject of the notification. */
    subject: z.string().min(1),
    /** The material facts, as established by the caller (never invented here). */
    facts: z.string().min(1),
    /** When the firm became aware — ISO date. Required to compute the Art 33 clock. */
    awareAt: z.string().optional(),
    /** Optional internal reference for traceability. */
    reference: z.string().optional(),
  }),
  output: z.object({
    kind: z.enum(["SUP15", "PRINCIPLE11", "ICO_ART33"]),
    recipient: z.string(),
    title: z.string(),
    body: z.string(),
    deadline: z.string().optional(),
    references: z.array(z.string()),
    /** Structural guarantee: a draft, never a transmission. */
    doNotSend: z.literal(true),
  }),
  async run(input) {
    const kind = input.kind as TemplateKind;
    const meta = KINDS[kind];
    const ref = input.reference?.trim();
    const deadline = kind === "ICO_ART33" && input.awareAt ? art33Deadline(input.awareAt) : undefined;

    const lines = [
      `DRAFT — DO NOT SEND. For SMF review and sign-off only.`,
      ``,
      `To: ${meta.recipient}`,
      `Re: ${input.subject}`,
      `Firm concerned: ${input.firm}`,
      ref ? `Internal reference: ${ref}` : null,
      input.awareAt ? `Date of awareness: ${input.awareAt}` : null,
      deadline ? `Statutory deadline (72h): ${deadline}` : null,
      ``,
      `Regulatory basis: ${meta.basis}`,
      ``,
      `Facts as established:`,
      input.facts,
      ``,
      `This draft was prepared by the CCS oversight agent runtime. It has not`,
      `been sent or filed. No notification leaves the platform without an`,
      `audited SMF sign-off.`,
    ].filter((l): l is string => l !== null);

    return {
      kind,
      recipient: meta.recipient,
      title: `${meta.label}: ${input.subject}`,
      body: lines.join("\n"),
      deadline,
      references: [meta.basis],
      doNotSend: true as const,
    };
  },
};
