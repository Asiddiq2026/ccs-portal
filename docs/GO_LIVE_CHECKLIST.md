# CCS AR Oversight Platform — Go-Live Checklist

The single sequenced pre-flight from a code-complete build to production, with
owners and pass criteria. Detail lives in `DEPLOY_AZURE.md` (deploy steps) and
`RUNBOOK.md` (operations); this is the ordered runsheet that ties them together.
Tick each box; record the sign-off line at the foot of each phase in the audit
trail. Do not advance a phase until its criteria are met — **fail closed**.

Legend — owner roles: **Ops** (platform/infra), **SMF** (SMF16/17 accountable
sign-off), **Compliance** (day-to-day operator).

---

## Phase A — Infrastructure provisioned  ·  owner: Ops

- [ ] Resource group in an FCA-appropriate region (UK South/West). *(DEPLOY §1)*
- [ ] PostgreSQL Flexible Server + `ccs` database created.
- [ ] Runtime role `ccs_app` created `LOGIN … NOBYPASSRLS` (no `BYPASSRLS`, not admin).
- [ ] A **separate owner/admin role** owns the schema (distinct from `ccs_app`).
- [ ] Blob storage account + `ccs-docs` container with a **time-based immutability
      (WORM) policy** enabled. *(DEPLOY §1.3)*
- [ ] App host (App Service / Container App, Node ≥ 20) provisioned.
- [ ] Key Vault created; every secret stored there, referenced by app settings.

**Pass:** all resources exist; no secret lives outside Key Vault.
Sign-off (Ops): __________  date: ______

---

## Phase B — Identity (Entra ID / OIDC)  ·  owner: Ops + Compliance

- [ ] App registration created; redirect URI
      `https://<app-url>/api/auth/callback/<provider>`.
- [ ] Claims mapping emits **`role`** (`AR` | `COMPLIANCE` | `SMF`) and **`arId`**.
- [ ] Directory groups → app roles mapped; each pilot user assigned.
- [ ] `AUTH_ISSUER` / `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET` / `AUTH_SECRET` /
      `AUTH_URL` set from Key Vault.
- [ ] `AUTH_DEV_LOGIN` unset/false (also hard-gated off when `NODE_ENV=production`).
- [ ] Verified: an SSO login with **no `role`** is rejected; an `AR` login with
      **no `arId`** is rejected (fail closed). *(session.ts)*

**Pass:** each role signs in via SSO; malformed sessions are refused.
Sign-off (Compliance): __________  date: ______

---

## Phase C — Data layer: migrate + RLS  ·  owner: Ops

> DDL and RLS need **table ownership**; run them as the owner via
> `RLS_DATABASE_URL`/admin `DATABASE_URL`, never the runtime `ccs_app`. *(DEPLOY §3)*

- [ ] `npm ci` on a toolchain host.
- [ ] `DATABASE_URL="$ADMIN_DATABASE_URL" npx prisma migrate deploy`.
- [ ] `RLS_DATABASE_URL="$ADMIN_DATABASE_URL" npm run db:rls`.
- [ ] Reference data seeded only where appropriate (pilot/non-prod).
- [ ] **Verify RLS** *(DEPLOY §3)*:
  - [ ] a context-less connection matches **no** rows;
  - [ ] an `AR` GUC context sees only its own firm;
  - [ ] `audit_event` / `agent_run` reject UPDATE and DELETE.

**Pass:** `RUN_DB_TESTS=true npm run test` RLS suite green against this DB.
Sign-off (Ops): __________  date: ______

---

## Phase D — Application config & verification  ·  owner: Ops + Compliance

- [ ] All app settings populated *(DEPLOY §2 table)*; `NODE_ENV=production`.
- [ ] `BLOB_ACCOUNT` / `BLOB_KEY` / `BLOB_CONTAINER` set — FP channel **fails
      closed** without them.
- [ ] `ANTHROPIC_API_KEY` (server-only) + pinned `ANTHROPIC_MODEL`.
- [ ] `AGENTS_AUTONOMOUS=false`, `GATE5_CLEARED=false`.
- [ ] `npm run test` green; `RUN_DB_TESTS=true npm run test` green.
- [ ] `npm run build` succeeds; build output grepped for secrets → **none**.
- [ ] Staging smoke *(DEPLOY §4)*: role isolation in UI; FP submit → WORM write +
      SHA-256 + audit; one server-side AI review (key never in browser); manual
      agent run → sign-off queue; forced error → OPERATOR REVIEW; withheld tool
      → 403 + TOOL DENIED; `GET /api/monitoring` snapshot correct.

**Pass:** all suites green, build clean, every smoke step observed.
Sign-off (Compliance + Ops): __________  date: ______

---

## Phase E — Controlled launch (agents MANUAL)  ·  owner: SMF

- [ ] Deploy to production with `AGENTS_AUTONOMOUS=false`, `GATE5_CLEARED=false`.
- [ ] Onboard the pilot AR (Codrington). *(RUNBOOK §1)*
- [ ] Monitoring alerts armed: `failClosed.open > 0` and any queue item > 48h.
      *(DEPLOY §6)*
- [ ] Run the pilot quarter with agents **manual**; SMF signs off every draft.

**Pass:** pilot quarter completed; queue median < 48h; zero unresolved
fail-closed items.
Sign-off (SMF): __________  date: ______

---

## Gate 5 — Autonomy authorisation  ·  owner: SMF (accountable)

All four must be cleared **in writing** before any autonomy:

- [ ] Clean pilot quarter (evidence: monitoring history + audit trail).
- [ ] Data Protection Agreement executed.
- [ ] Penetration test completed; findings remediated/accepted.
- [ ] SMF16/17 written authorisation recorded in the audit trail.

Then, and only then *(RUNBOOK §3)*:

- [ ] Set `GATE5_CLEARED=true` → redeploy; confirm monitoring shows **5/5 gates**.
- [ ] Set `AGENTS_AUTONOMOUS=true` → redeploy; audit the change with the
      authorisation reference.
- [ ] Confirm agent egress remains structurally 0 (drafts still route to
      sign-off; SMF remains the sole authority).

**Pass:** Gate 5 evidence filed; flags flipped and audited.
Sign-off (SMF): __________  date: ______

---

## Phase F — Full rollout  ·  owner: Ops + SMF

- [ ] Onboard SIX and Drake Star. *(RUNBOOK §1)*
- [ ] Quarterly SMF review scheduled as a standing item. *(RUNBOOK §6)*
- [ ] Secret rotation calendar set (≤ 90 days). *(RUNBOOK §2)*
- [ ] Backup/PITR retention meets 6/7-year audit retention. *(DEPLOY §6)*

**Pass:** all ARs live; recurring governance scheduled.
Sign-off (SMF): __________  date: ______
