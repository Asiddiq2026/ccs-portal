# CCS AR Oversight Platform — Operations Runbook

Operated for **Razlin Limited** (FCA-authorised principal, FRN 730805) by
Comprehensive Compliance Solutions (CCS). This runbook covers the recurring
operational procedures for the live platform. All privileged actions are
recorded in the append-only `audit_event` log; nothing in this runbook bypasses
the [ten non-negotiable invariants](../README.md).

Golden rule, always: **agents draft, humans decide, nothing leaves unsigned.**

---

## 1. Onboard a new Appointed Representative (AR)

Currently live: SIX, Drake Star, Codrington. Onboarding a new AR is a
COMPLIANCE + SMF task.

1. **Create the tenant record.** Insert the `appointed_rep` row for the new firm
   (register `appointed_rep`). This is the canonical `arId` used everywhere for
   row-level isolation. Choose a stable, lowercase `arId` (e.g. `ar_newfirm`) —
   it is immutable once data exists.
2. **Provision identity.** In the IdP (Entra ID / Okta), create the AR's group
   and map the claims the app expects:
   - `role = "AR"`
   - `arId = "<the new arId>"`
   Confirm the mapping appears on a test login before granting real users.
3. **Verify isolation before real data.** Sign in as the new AR and confirm they
   see **only** their own firm's registers, and that COMPLIANCE/SMF see the new
   firm network-wide. The `db.rls.test.ts` cross-tenant suite is the automated
   equivalent — run it against staging with `RUN_DB_TESTS=true`.
4. **Seed reference data** (risk factors, CPD roster, quarter schedule) via the
   API tool layer — never by direct SQL, so every write lands in the audit log.
5. **Announce agents stay manual.** New ARs join under the same gate as everyone
   else: agent runs are operator-triggered until `AGENTS_AUTONOMOUS` is enabled
   (see §3). Record the onboarding in the audit trail with the SMF approval ref.

**Rollback:** an AR with no submissions can be removed by deleting the
`appointed_rep` row and revoking the IdP group. Once real submissions/audit rows
exist, ARs are retired (marked inactive), not deleted — 6/7-year retention
applies.

---

## 2. Rotate secrets & keys

All secrets live in the environment / vault, never in the repo or the browser
bundle. Rotate on the standard cadence (≤ 90 days) and immediately on any
suspected exposure.

### Anthropic API key (`ANTHROPIC_API_KEY`)
1. Mint a new key in the Anthropic console.
2. Update the vaulted secret for the target environment.
3. Redeploy / restart so the server process picks up the new value (the key is
   read server-side only, in `createAnthropicClient` / `createAnthropicAgentModel`).
4. Smoke-test one FP AI review and one manual agent run.
5. Revoke the old key in the console. Record the rotation in the audit trail.

### Database credentials (`DATABASE_URL`, `ccs_app` role)
1. Set a new password on the `ccs_app` Postgres role (it is `NOBYPASSRLS` — keep
   it that way; RLS depends on the app connecting as a non-superuser).
2. Update `DATABASE_URL` in the vault and redeploy.
3. Verify RLS is still enforced: a context-less connection must match **no**
   rows.

### Auth / OIDC (`AUTH_SECRET`, `AUTH_CLIENT_SECRET`)
1. Rotate `AUTH_SECRET` (`openssl rand -base64 32`) and/or the IdP client secret.
2. Update the vault, redeploy. Rotating `AUTH_SECRET` invalidates existing
   sessions — expect users to re-authenticate.

### Blob storage (`BLOB_KEY`)
1. Rotate the storage account key; update the vault; redeploy.
2. Confirm the immutability (WORM) policy on the container is **still on** — key
   rotation must never relax it. Verify a known document's SHA-256 still matches.

**Never** disable a hook, commit a populated `.env`, or move a secret into
client-reachable config to "make rotation easier".

---

## 3. Enable autonomy (`AGENTS_AUTONOMOUS`) — Gate 5

Autonomy is **gated, not assumed**. The flag stays `false` until Gate 5 is
cleared in writing by SMF16/17:

- a clean Codrington pilot quarter (real submissions, agents still manual);
- the CCS↔Razlin DPA executed;
- the independent pen test signed off.

**Procedure (only after written clearance):**
1. Confirm all three Gate 5 conditions are recorded. Set `GATE5_CLEARED=true`
   (the monitoring snapshot flips to 5/5).
2. Set `AGENTS_AUTONOMOUS=true` in the target environment's config and redeploy.
   This is a deploy-time control — there is no in-app toggle.
3. Record the change in the audit trail with the SMF16/17 authorisation
   reference.
4. Watch the monitoring snapshot: CRON/WEBHOOK agents now carry the "· auto"
   schedule label and begin self-firing. ON_DEMAND agents remain operator-only.

**Kill switch:** set `AGENTS_AUTONOMOUS=false` and redeploy to return every agent
to manual-trigger immediately. Fail-closed behaviour and the sign-off gate are
unaffected either way — no agent can egress beyond `enqueue_for_signoff`.

---

## 4. Respond to a fail-closed alert (OPERATOR REVIEW)

An agent that hits any error, ambiguity, or rule conflict halts and produces an
`OPERATOR REVIEW` result — **no draft, no egress**. This is a normal, safe
outcome, not an outage.

1. Open `/api/monitoring` (or the console) — `failClosed.open` is the count of
   open reviews.
2. Find the `agent_run` row; its `output.findings` explain why it halted.
3. Resolve the underlying issue (bad input, missing data, genuine ambiguity).
4. Re-trigger the agent **manually** via `POST /api/agents/:id/run`. A clean
   re-run produces `DRAFT READY`; the draft lands in the sign-off queue.
5. Never hand-write a FINAL register row to "unblock" a review — that would
   bypass the single writeable path (Invariant 1).

---

## 5. Sign-off queue hygiene

Target: median queue age **< 48h** (green < 24h, amber 24–48h, red > 48h).

1. Check `/api/monitoring` `queue.breaching` daily — any item > 48h is red.
2. SMF reviews and decides (adopt / reject) via the sign-off flow. Every
   decision is audited; rejects require reviewer notes.
3. FINAL register rows materialise **only** on an audited SMF sign-off.

---

## 6. Quarterly platform review (SMF standing item)

Once per quarter, SMF16/17 review and record:

- **Agent output quality** — sample `agent_run` outputs vs. the drafts humans
  accepted/rejected; note any prompt-version changes (`promptHash`).
- **Audit completeness** — spot-check that every submission, upload, decision,
  and agent run has a corresponding append-only audit row; verify no
  UPDATE/DELETE occurred (the tables revoke it). Export the trail for the review
  file via **Go-Live Monitoring → Export audit trail (CSV)** (or
  `GET /api/audit/export?from=…&to=…`); operators only, network-scoped.
- **Access rights** — reconcile IdP group membership against active ARs and
  operators; remove leavers.
- **Deterministic engine** — confirm the CF30/risk/CPD unit tests are green and
  no arithmetic has crept out of code (Invariant 7).
- **Gate/flag status** — record current `AGENTS_AUTONOMOUS` and `GATE5_CLEARED`
  values and any changes since last quarter, with authorisation refs.

Record the review outcome in the audit trail.

---

## 7. Apply a schema migration

`prisma/schema.prisma` is the source of truth. Standard flow on the deploy host:

```bash
# Dev/staging (ccs_app owns the tables here):
npm run db:migrate            # = prisma migrate dev (generates + applies)
npm run db:rls                # re-apply RLS (migrate may drop grants/policies)

# Production — DDL + RLS require the OWNER role, not the runtime ccs_app role:
DATABASE_URL="$ADMIN_DATABASE_URL"     npx prisma migrate deploy
RLS_DATABASE_URL="$ADMIN_DATABASE_URL" npm run db:rls
```

`db:rls` honours `RLS_DATABASE_URL` (falls back to `DATABASE_URL`), so RLS can
be applied as the table owner while the app runs as the non-owner `ccs_app`.
ALWAYS re-run `db:rls` after any migrate — Prisma can drop policies/grants.

Never edit tables by hand except for the one-off below, and always finish with
`db:rls` so tenant isolation (Invariant 5) and append-only grants (Invariant 4)
are re-asserted.

### Sign-off decision path — `sign_off_item` (adds `register_id`, `notes`)

The sign-off decision path (draft → FINAL) added two **nullable** columns. A
greenfield `prisma migrate dev --name init` picks them up automatically. For an
**already-provisioned** database, apply once (both are nullable, so this is safe
online with no backfill):

```sql
ALTER TABLE "sign_off_item" ADD COLUMN IF NOT EXISTS "register_id" text;
ALTER TABLE "sign_off_item" ADD COLUMN IF NOT EXISTS "notes"       text;
```

`register_id` records the FINAL register row id written on `SIGNED_OFF`; `notes`
holds the SMF rationale (required on `RETURN`). RLS on `sign_off_item` already
covers new columns — no policy change needed, but re-run `db:rls` after any
`prisma migrate` regardless.
