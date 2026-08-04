# CCS AR Oversight Platform — Commercialisation Assessment

*Written 2026-07-31 at checkpoint `v0.1.0-pilot-ready` (commit `1153013`). This
records the gap analysis between the platform as built and a product sold to
multiple Principal Firms, and the recommended path. Facts below were verified
against the codebase at that commit, not assumed.*

---

## 1. Where the platform actually is

**Built and verified by running (not by reading):**
- 13 screens; every register table has a human workflow.
- The golden rule proven end to end **with a live LLM**: agent drafts →
  sign-off queue → SMF sign-off materialises FINAL. One real run reached
  `DRAFT READY` (21,590 tokens) and produced a PENDING draft.
- 255 unit/integration tests (incl. cross-tenant RLS and sign-off
  materialisation against real Postgres) + 15 Playwright E2E; CI green on
  every push.
- Tamper-evident audit chain (implemented, verified, and honest about
  pre-chain rows).
- Committed migrations; fail-closed everywhere; withheld tools have no
  implementation anywhere.

**Architectural facts that bound commercialisation:**
- The schema has **zero occurrences of "principal"** — `arId` is the only
  isolation dimension. RLS isolates ARs *within one principal firm*.
- "Razlin" / FRN 730805 is hardcoded in **15 source files**, including the
  audited agent prompt renderer and the FP AI-review prompt.
- `AUTH_ISSUER` is a single global env var — one IdP for the whole deployment.
- Regulatory parameters are code constants flagged "confirm with RAZ at
  Gate 1": CPD 35h, three-strike ladder, 5 risk factors, escalation steps, the
  module→CPD-hours map (Codrington-specific).
- Nothing meters Anthropic spend. Observed cost: 14k–22k tokens per
  quarterly-cycle agent run. No per-tenant accounting, quotas, or circuit
  breakers.

## 2. What full multi-tenant SaaS would require

| Workstream | Content | Risk |
|---|---|---|
| Multi-principal tenancy | `Principal` entity; `principalId` on all 12 tables; every RLS policy rewritten around `app.principal_id`; session/claims carry it; cross-principal isolation test suite | **Highest** — a bug leaks one regulated firm's data to a competitor |
| Per-principal OIDC | Each principal has its own Entra/Okta tenant; Auth.js rework away from a single issuer | High — often harder than the data model |
| Token metering | Per-principal accounting, quotas, circuit breakers; usage→price mapping | Pre-revenue requirement: agent spend is the COGS line |
| White-labelling | Principal profile (name, FRN, branding) replacing the 15 hardcodes; note prompts are audit-hashed per (agent, version), so per-principal prompts change the audit identity model | Medium |
| Per-principal config | The "Gate 1" constants become tenant config | Medium |
| Product compliance | SOC 2 / ISO 27001, pen test, DPA per principal (they are controllers; CCS is processor), sub-processor disclosure (Anthropic, Azure), exit/data-portability plan reconciled with 6/7-year retention, audit rights, PI insurance | **Longest lead time; blocks enterprise sales regardless of architecture** |
| Ops maturity | Structured logging, tracing, error tracking, per-tenant monitoring/backup/restore, SLAs, status page, incident notification | Medium |

## 3. The easier way: a single-tenant fleet

**Recommendation: do not build shared multi-tenancy first.** Deploy **one
instance per principal firm** — own database, own app, own config.

Why this wins at this stage:
- **Skips the highest-risk engineering entirely.** No `principalId`, no RLS
  rewrite, no cross-principal leak surface. The existing, tested isolation
  model remains exactly as verified.
- **The isolation story gets stronger, not weaker.** "Your data is in your own
  database, full stop" is what a regulated buyer's risk committee wants to
  hear, and it's simpler to evidence in due diligence than shared-schema RLS.
- **White-labelling collapses into per-instance config.** The only engineering
  needed is extracting a *principal profile* (name, FRN, branding, regulatory
  parameters) from the 15 hardcoded sites — mechanical, low-risk, and needed in
  every path anyway.
- **Per-principal OIDC becomes trivial** — each instance has one issuer, which
  is what the code already assumes.
- Industry-standard early-B2B path: shared multi-tenancy earns its complexity
  at roughly 10–20+ tenants, when fleet ops cost starts to hurt. This market
  (UK principals with ARs needing this depth of oversight) starts as a handful
  of customers, not hundreds.

Costs of the fleet approach, stated honestly: ops overhead scales linearly
(one deploy/upgrade/backup per customer — mitigate with infra-as-code from
instance #1), and per-customer infrastructure cost sets a floor under pricing.
Both are acceptable at single-digit customer counts and revisitable later.

**What does NOT get easier in any path:** the certification track (SOC 2, pen
test, DPAs). That is the true long pole for selling to regulated firms and is
independent of architecture. Start it when the first real prospect exists.

## 4. Recommended sequence

1. **Deploy for Razlin and run the pilot quarter** (Gate 5 requires it anyway).
   This is commercial validation and produces the reference case study. Needs
   only the Azure decisions in `DEPLOY_AZURE.md` §7.
2. **Extract the principal profile** (config object replacing the 15
   hardcodes + the Gate 1 constants). Low risk, unblocks everything.
3. **Token metering + quotas** before any customer with agents enabled.
4. **First external customers as single-tenant instances**, provisioned by
   script — `scripts/provision-instance.sh` (dry-run-verified only; see the
   note at `DEPLOY_AZURE.md` §1 and the §7 risk register).
5. **Certification track** (SOC 2 / pen test / DPA templates) in parallel from
   first prospect.
6. **Revisit shared multi-tenancy only when the fleet is ~10+ instances** and
   ops cost, not engineering pride, demands it.

Alternatives if the appetite for a product business is limited:
- **License/partner**: hand the platform to an established compliance
  consultancy or RegTech that already owns SOC 2, sales and support; trade
  upside for speed and zero certification burden.
- **Internal-only**: the platform is already near its original goal; deploying
  for Razlin alone requires none of the above.

## 5. Open decisions (owner: SMF16/17)

- Pricing unit — per AR? per seat? per agent run? (determines what to meter)
- Fleet vs shared tenancy long-term (this doc recommends fleet first)
- Storage auth model (account key vs managed identity), Azure region, app host
- Whether to pursue certification now or after pilot-quarter evidence exists
