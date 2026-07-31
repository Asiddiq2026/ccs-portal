// The principal-firm profile — THE single file to edit when deploying this
// platform for a different principal (single-tenant fleet model, see
// docs/COMMERCIALISATION.md §3). Everything principal-specific that was
// previously hardcoded across ~15 files lives here: identity, user-facing
// copy fragments, the compliance contact, and the regulatory parameters that
// were flagged "confirm at Gate 1".
//
// CLIENT-SAFE: this module is imported by client components, so it must never
// contain secrets or read server-only environment variables.
//
// AUDIT NOTE: the agent system prompts and the FP AI-review prompt interpolate
// these values, and agent prompts are hash-audited per (agent, version). For
// the pilot principal the rendered text is byte-identical to the pre-extraction
// hardcoded prompts (pinned by src/lib/principal.test.ts), so historical
// prompt hashes remain valid. A DIFFERENT principal produces different prompt
// hashes — correct behaviour, since the hash identifies exactly what the agent
// was told, but worth knowing when comparing audit logs across instances.
//
// Visual theme tokens (the `razlin-*` colour names in tailwind.config.ts) are
// internal identifiers, not user-visible branding, and are out of scope here.

export interface PrincipalProfile {
  /** Conversational short name used in UI copy — "Awaiting Razlin", etc. */
  shortName: string;
  /** Registered legal name, as it appears in regulatory wording. */
  legalName: string;
  /** Compact form for the console header chrome. */
  consoleName: string;
  /** FCA Firm Reference Number. */
  frn: string;
  /** Name of the regulator in footer wording. */
  regulator: string;
  /** Label for the principal's compliance team (escalations, portal contact). */
  complianceTeam: string;
  /** Contact address shown to ARs in the portal sidebar. */
  complianceEmail: string;
  /** Regulatory parameters previously hardcoded ("confirm at Gate 1"). */
  cpd: {
    /** Required CPD hours per certification year. */
    requiredHours: number;
    /**
     * Credited hours per training-platform module. Modules and weights are
     * agreed with the principal; the full programme should sum to
     * `requiredHours` so completing it is exactly compliant.
     */
    moduleHours: Record<string, number>;
  };
}

/** The active principal for this instance. */
export const PRINCIPAL: PrincipalProfile = {
  shortName: "Razlin",
  legalName: "Razlin Limited",
  consoleName: "Razlin Ltd",
  frn: "730805",
  regulator: "Financial Conduct Authority",
  complianceTeam: "Razlin Compliance",
  complianceEmail: "compliance@razlin.co.uk",
  cpd: {
    requiredHours: 35,
    moduleHours: { m1: 4, m2: 4, m3: 5, m4: 5, m5: 4, m6: 5, m7: 4, m8: 4 },
  },
};

/** "Razlin Limited (FRN 730805)" — the form used in prompts and metadata. */
export function principalLegalWithFrn(): string {
  return `${PRINCIPAL.legalName} (FRN ${PRINCIPAL.frn})`;
}

/** The FCA footer line shown on the AR-facing portal. */
export function principalFooterLine(): string {
  return `${PRINCIPAL.legalName} · Authorised and regulated by the ${PRINCIPAL.regulator} · FRN ${PRINCIPAL.frn}`;
}
