# CCS AR Oversight Platform — Azure Deployment

Reference deployment for the production platform. The design targets Azure
(Entra ID for SSO, Azure Blob for WORM storage), but the app is
infrastructure-agnostic: any Postgres + OIDC IdP + object store with immutability
works (e.g. RDS + Okta + S3 Object Lock).

> **Verification status.** The platform is exercised end to end against a real
> Postgres and a real browser, and CI runs every suite on each push
> (`.github/workflows/ci.yml`): 255 unit/integration tests incl. RLS
> cross-tenant and sign-off materialisation, 15 Playwright E2E tests, plus the
> production build. One live agent run has reached `DRAFT READY` against the
> Anthropic API.
>
> **Not yet proven anywhere — treat as deployment risk (§7):** real OIDC SSO with
> claim mapping, and real Azure Blob WORM writes. Both have only ever run against
> the dev-login provider and the in-memory blob store.

---

## Topology

```
Entra ID (OIDC) ──▶ Next.js app (App Service / Container App, Node 20)
                          │
                          ├─▶ Azure Database for PostgreSQL (Flexible Server)
                          │      app connects as ccs_app (NOBYPASSRLS) — RLS enforced
                          │
                          ├─▶ Azure Blob Storage (container ccs-docs, immutability ON)
                          │
                          └─▶ Anthropic Messages API (server-side egress only)
```

---

## 1. Provision

> **Automated option:** `scripts/provision-instance.sh <instance> <region>` runs
> steps 1–5 below as `az` commands (one single-tenant instance per principal —
> the fleet model, COMMERCIALISATION.md §3). Always run it with `DRY_RUN=1`
> first and review the printed plan. The script has **never been executed
> against a real subscription** — it is syntax-checked and dry-run-verified
> only, and the §7 risk register applies to it in full.

1. **Resource group + region** — pick an FCA-appropriate region (UK South/West).
2. **PostgreSQL Flexible Server** — create the `ccs` database. Create the
   application role:
   ```sql
   CREATE ROLE ccs_app LOGIN PASSWORD '<vaulted>' NOBYPASSRLS;
   GRANT CONNECT ON DATABASE ccs TO ccs_app;
   ```
   The app **must** connect as this non-superuser role; RLS is what enforces
   tenant isolation (Invariant 5). Never grant `BYPASSRLS` or use the admin role
   for the app connection.
3. **Blob Storage** — create the storage account and the `ccs-docs` container.
   Enable a **time-based immutability (WORM) policy** on the container so
   documents are write-once (Invariant: immutable evidence). Uploads are
   content-addressed and SHA-256 verified by the app.
4. **App host** — Azure App Service (Linux, Node 20) or a Container App. Set the
   Node runtime; the API routes declare `runtime = "nodejs"`.
5. **Key Vault** — store every secret here; reference from app settings. Nothing
   secret in the repo or the client bundle.

---

## 2. Configure (app settings / Key Vault references)

Populate from `.env.example`. Production values:

| Setting | Notes |
|---|---|
| `DATABASE_URL` | runtime app connection — the non-owner `ccs_app` role; `sslmode=require` |
| `RLS_DATABASE_URL` | **migrate/RLS only** — the table OWNER/admin connection; used by `npm run db:rls`. Not needed at app runtime |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | the canonical **https://** app URL |
| `AUTH_ISSUER` / `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET` | Entra app registration; map `role` + `arId` claims |
| `AUTH_DEV_LOGIN` | **must be unset/false in production** (hard-gated off when `NODE_ENV=production`) |
| `ANTHROPIC_API_KEY` | server-only; Key Vault reference |
| `ANTHROPIC_MODEL` | pin per environment (e.g. `claude-sonnet-4-5`) |
| `BLOB_ACCOUNT` / `BLOB_KEY` / `BLOB_CONTAINER` | container has immutability ON; **required in production** — the FP channel refuses to serve without it (fail closed) |
| `TRAINING_INGEST_TOKENS` | machine tokens for `POST /api/training/*`. Mint with `npm run token:mint -- <arId>` (prints the raw once + the registry entry). Store **SHA-256 hashes only**, as `arId:hash` entries — the raw token goes to the caller and the vault, never here. Each token is scoped to one AR: verified live 2026-08-04 — a firm's token writes its own completions (201), is refused for another firm's body (403), and unknown tokens get 401 |
| `AGENTS_AUTONOMOUS` | **`false`** until Gate 5 (see RUNBOOK §3) |
| `GATE5_CLEARED` | `false` until SMF16/17 clear Gate 5 in writing. Note the dashboard labels gates as **declared**, not verified — the signed record lives outside the platform |
| `NODE_ENV` | `production` |

### Entra ID app registration
- Redirect URI: `https://<app-url>/api/auth/callback/<provider>`.
- Emit `role` (`AR` | `COMPLIANCE` | `SMF`) and `arId` as claims (app roles or a
  claims-mapping policy). The app fails closed on a session missing `role`, and
  an `AR` session with no `arId` is rejected.

---

## 3. Migrate & seed

Run from a host with the toolchain and network access to the database.

> **Ownership matters.** `migrate deploy` (DDL) and `rls.sql` (ENABLE/FORCE RLS,
> CREATE POLICY, REVOKE) require **table ownership**. The runtime `ccs_app` role
> is intentionally a non-owner (`NOBYPASSRLS`), so it **cannot** apply these.
> Point migrations and RLS at the OWNER/admin connection via `RLS_DATABASE_URL`
> (or a one-off admin `DATABASE_URL`); the app keeps using the `ccs_app`
> `DATABASE_URL` at runtime.

```bash
npm ci                                          # installs devDeps (tsx) too
DATABASE_URL="$ADMIN_DATABASE_URL" npx prisma migrate deploy   # apply migrations (as owner)
RLS_DATABASE_URL="$ADMIN_DATABASE_URL" npm run db:rls          # enable + FORCE RLS (as owner)
npm run db:seed                                 # reference data only (non-prod / pilot)
```

`npm run db:rls` runs `prisma/rls.sql` through Prisma; it honours
`RLS_DATABASE_URL` for exactly this owner-vs-runtime split. (A no-Node host can
instead run `psql "$ADMIN_DATABASE_URL" -f prisma/rls.sql`.)

`prisma/rls.sql` is **not** optional — it enables and `FORCE`s the
`tenant_isolation` policies and revokes UPDATE/DELETE on the append-only
`audit_event` / `agent_run` tables. Verify after applying:

- a context-less connection matches **no** rows;
- an `AR` GUC context sees only its firm;
- `audit_event` / `agent_run` reject UPDATE and DELETE.

---

## 4. Verify (pre-promotion gate)

CI already gates every push and runs all of this (see `.github/workflows/ci.yml`).
Reproduce locally against a staging database:

```bash
npm ci
RUN_DB_TESTS=true npm run test   # 255 tests: unit + RLS cross-tenant + sign-off materialisation
npm run build                    # production build + type-check; grep output for secrets → none
npm run test:e2e                 # 15 Playwright tests (access control, sign-off loop, isolation)
```

> **E2E does not test the production build, by design.** The suite signs in
> through the dev-login form, and that provider is hard-gated off when
> `NODE_ENV=production` (`src/auth.ts`). So Playwright runs against `next dev`.
> Do **not** relax that gate to make E2E run against production — the gate is the
> point. `npm run build` is the production gate; the SSO smoke test below is what
> validates production auth.

Manual smoke on staging (this is where the two unproven areas get exercised):
- **SSO:** sign in as each role via Entra; confirm `role` + `arId` claims arrive
  and tenant isolation holds in the UI. An `AR` session missing `arId` must be
  rejected. *(Never yet run — see §7.)*
- **WORM:** submit an FP + attach a document; confirm the Azure write, the
  SHA-256 manifest, and that re-uploading identical bytes returns the same
  immutable URL rather than a second object. Then confirm the container policy
  actually refuses an overwrite/delete attempt. *(Never yet run — see §7.)*
- Store a training certificate (`POST /api/training/certificates`) and confirm it
  lands in WORM and is referenceable as evidence.
- Log a data breach; confirm the 72h Art 33 deadline is engine-derived and the
  clock bands correctly. Only an SMF may report or close it.
- Propose a CPD update and a risk assessment; confirm each lands PENDING and the
  register does **not** move until an SMF signs off — then that it does.
- Suspend an AR via `/ars`; confirm the appointed_rep row is **updated in place**
  (one row, FRN preserved), not duplicated.
- Run one FP AI review and one agent (`POST /api/agents/:id/run`), server-side;
  the key must never appear in the browser bundle. Force an error and confirm it
  fails closed to OPERATOR REVIEW with no draft.
- Confirm a withheld tool (e.g. `send_email`) is rejected 403 + TOOL DENIED.
- **Audit chain:** open `/infra` and confirm the audit panel reports
  *"Chain intact"*. Rows written before chaining existed are reported as
  unverifiable rather than passing — expect a non-zero "pre-chain" count on a
  database that predates it, and zero on a fresh one.
- Hit `GET /api/monitoring` as an operator; confirm the snapshot and the
  audit-trail CSV export.

---

## 5. Go-live sequence

1. Deploy with `AGENTS_AUTONOMOUS=false`, `GATE5_CLEARED=false`.
2. Onboard the pilot AR (Codrington) — RUNBOOK §1.
3. Run the pilot quarter with agents **manual**. Execute the DPA; complete the
   pen test.
4. SMF16/17 clear Gate 5 in writing → set `GATE5_CLEARED=true`, then
   `AGENTS_AUTONOMOUS=true`, redeploy, audit the change (RUNBOOK §3).
5. Onboard SIX and Drake Star; monitoring live; SMF quarterly review standing.

---

## 6. Operational notes

- **Scaling:** the app is stateless; scale out horizontally. Prisma uses a
  connection singleton — size the Postgres connection pool for the instance
  count.
- **Backups:** enable PITR on the Flexible Server. Audit/agent-run retention is
  6/7 years — ensure backup retention and any archival tier meet that. On top
  of PITR, take logical dumps with `scripts/db-backup.sh` (custom-format
  pg_dump + SHA-256 manifest) and — this is the part that matters — rehearse
  the restore with `scripts/db-restore-drill.sh`: it restores a dump into a
  scratch database, walks the full audit chain there (`verify:audit`), compares
  the chain tip against the source, and spot-checks that RLS still fails closed
  in the restored copy. Record the printed tip hash outside the database (the
  quarterly SMF review pack) — a doctored future restore cannot reproduce it.
  The drill has been rehearsed against a local PostgreSQL 16.4 cluster
  (2026-08-04, PASS); run it against the real Flexible Server as part of §4.
- **Rotation:** secrets rotate ≤ 90 days — RUNBOOK §2.
- **Monitoring:** alert on `failClosed.open > 0` and on any queue item breaching
  48h. Fail-closed alerts are reviewed, never auto-resolved.

---

## 7. Deployment risk register

Everything below is implemented and unit-tested, but has **never executed against
the real service**. These are the parts most likely to fail first, so budget
staging time for them rather than discovering them at go-live.

| Area | What is unproven | How it fails | First check |
|---|---|---|---|
| **OIDC SSO** | Claim mapping. The app requires `role` (`AR`\|`COMPLIANCE`\|`SMF`) and, for an AR, `arId`. Only the dev-login provider has ever produced a session | Fails **closed**: a session without `role` is rejected, so a claims misconfiguration looks like "nobody can sign in" rather than a silent privilege bug | Sign in as each role and inspect the resolved tenant before wiring real users |
| **Azure Blob WORM** | Real uploads. Only the in-memory store has run. `resolveBlobStore` throws in production when `BLOB_*` is unset, so the FP channel refuses to serve rather than accepting documents it cannot durably keep | Fails **closed** at boot/first upload | Upload, then attempt an overwrite and a delete — both must be refused by the container policy, not just by the app |
| **Managed identity vs. account key** | The adapter authenticates with `BLOB_ACCOUNT` + `BLOB_KEY`. If policy requires managed identity, the adapter needs a credential swap (single file: `src/lib/fp/azure-blob.ts`) | Auth failure on first write | Confirm the storage auth model before provisioning |
| **Postgres role split** | Migrations/RLS need table **ownership**; the runtime `ccs_app` role deliberately lacks it. Locally both were the same role | `migrate deploy` or `db:rls` fails permission-denied as the runtime role | Apply with `RLS_DATABASE_URL` (owner) and confirm the four RLS properties in §3 |
| **Agent runtime scheduling** | Agents have only ever run via manual `POST`. CRON/WEBHOOK triggers and the Azure Functions/worker host are unexercised | A scheduled agent silently never fires | Keep `AGENTS_AUTONOMOUS=false`; trigger manually through the pilot quarter |
| **Connection pooling at scale** | Prisma uses a client singleton; horizontal scale-out multiplies connections | Pool exhaustion under load | Size the Flexible Server pool against instance count; consider pgBouncer |
| **Retention** | 6/7-year retention is asserted in the UI and enforced only by *absence of deletion* (no UPDATE/DELETE grant on append-only tables). No archival tier is configured | Backup retention shorter than the regulatory period | Set PITR + archive retention to meet 6/7 years explicitly |

**Fail-closed is the pattern throughout**, which is the useful property here: a
misconfiguration in SSO or WORM stops the platform rather than letting it operate
without isolation or durable evidence. Expect deployment problems to present as
"it refuses to start / refuses to serve", and read that as the design working.
