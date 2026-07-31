import { describe, it, expect } from "vitest";
import { PRINCIPAL, principalLegalWithFrn, principalFooterLine } from "./principal";
import { renderSystemPrompt } from "./agents/io";
import { AGENT_SPECS } from "./agents/specs";
import { escalationLadder } from "./engine";
import { buildReviewPrompt } from "./fp/ai-review";

describe("principal profile — sanity", () => {
  it("has a complete identity", () => {
    expect(PRINCIPAL.shortName).toBeTruthy();
    expect(PRINCIPAL.legalName).toBeTruthy();
    expect(PRINCIPAL.consoleName).toBeTruthy();
    expect(PRINCIPAL.frn).toMatch(/^\d{6}$/);
    expect(PRINCIPAL.complianceTeam).toBeTruthy();
    expect(PRINCIPAL.complianceEmail).toContain("@");
  });

  it("module hours sum to exactly the required CPD hours", () => {
    // Completing the full training programme should be exactly compliant —
    // an inconsistent map would silently under- or over-credit everyone.
    const total = Object.values(PRINCIPAL.cpd.moduleHours).reduce((a, b) => a + b, 0);
    expect(total).toBe(PRINCIPAL.cpd.requiredHours);
    expect(PRINCIPAL.cpd.requiredHours).toBeGreaterThan(0);
  });
});

describe("principal profile — audited-prompt pinning", () => {
  // Agent prompts are hash-audited per (agent, version). These assertions pin
  // the EXACT pre-extraction wording for the pilot principal, so the profile
  // refactor provably did not change any audited prompt byte. If the profile
  // values change, these tests fail — which is correct: that IS a prompt
  // change, and agent versions should be reviewed when it happens.
  it("renderSystemPrompt is byte-identical to the pre-extraction text", () => {
    const spec = AGENT_SPECS.find((s) => s.id === "agent-quarterly-cycle")!;
    const prompt = renderSystemPrompt(spec);
    expect(prompt.startsWith(
      "You are agent-quarterly-cycle (prompt v3), a headless compliance agent for the CCS AR Oversight Platform operated for Razlin Limited (FRN 730805), an FCA-authorised principal firm.",
    )).toBe(true);
  });

  it("the FP AI-review prompt carries the exact pre-extraction principal wording", () => {
    const prompt = buildReviewPrompt({
      id: "x", arId: "ar_six", ref: "FP-0001", type: "TEASER", title: "T",
      audience: "Professional", cobs: [], status: "PENDING",
      submittedBy: "s", reviewedBy: null, reviewerNotes: null,
    });
    expect(prompt).toContain(
      "on behalf of your client, Razlin Limited (FRN 730805), the FCA-authorised principal firm",
    );
    expect(prompt).toContain("an appointed representative of Razlin,");
    expect(prompt).toContain("with Razlin as approver");
  });

  it("the engine escalation ladder still names the compliance team verbatim", () => {
    const ladder = escalationLadder("2026-04-16");
    expect(ladder[0].action).toBe(
      "Reminder to AR · escalate to Razlin Compliance if unacknowledged",
    );
  });

  it("helpers render the canonical regulatory strings", () => {
    expect(principalLegalWithFrn()).toBe("Razlin Limited (FRN 730805)");
    expect(principalFooterLine()).toBe(
      "Razlin Limited · Authorised and regulated by the Financial Conduct Authority · FRN 730805",
    );
  });
});
