#!/usr/bin/env bash
# Provision ONE single-tenant CCS instance on Azure (fleet model — one instance
# per principal firm, docs/COMMERCIALISATION.md §3). Mirrors DEPLOY_AZURE.md
# §1–§2 as code; the database-internal steps (§3) are printed as explicit next
# steps at the end because they run from a host with repo + psql access.
#
#   ./scripts/provision-instance.sh <instance> <region>
#   e.g.  ./scripts/provision-instance.sh razlin uksouth
#
#   DRY_RUN=1 ./scripts/provision-instance.sh razlin uksouth
#     prints every az command instead of executing — run this first, always.
#
# ── VERIFICATION STATUS ──────────────────────────────────────────────────────
# This script has NEVER been executed against a real Azure subscription. It is
# syntax-checked (bash -n) and its full flow exercised in DRY_RUN mode only.
# The known-risk areas are exactly DEPLOY_AZURE.md §7: container immutability
# semantics, managed-identity-vs-account-key policy, and the owner-vs-runtime
# Postgres role split. Expect to iterate on first real use; nothing here is
# destructive without --yes-style confirmation on Azure's side.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

INSTANCE="${1:?usage: provision-instance.sh <instance> <region>   (instance: short lowercase name, e.g. razlin)}"
REGION="${2:?usage: provision-instance.sh <instance> <region>   (region: FCA-appropriate, e.g. uksouth)}"

if [[ ! "$INSTANCE" =~ ^[a-z0-9]{3,12}$ ]]; then
  echo "instance must be 3-12 lowercase alphanumerics (used in resource names)" >&2
  exit 1
fi

# ── Naming convention (one instance = one resource group) ────────────────────
RG="ccs-${INSTANCE}-rg"
KV="ccs-${INSTANCE}-kv"                # Key Vault (3-24 chars, this fits)
PG="ccs-${INSTANCE}-pg"                # PostgreSQL Flexible Server
ST="ccs${INSTANCE}st"                  # storage account (lowercase alnum only)
PLAN="ccs-${INSTANCE}-plan"
APP="ccs-${INSTANCE}-app"
CONTAINER="ccs-docs"
TAGS=(--tags "product=ccs" "instance=${INSTANCE}")

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf 'DRY-RUN  az'; printf ' %q' "$@"; printf '\n'
  else
    az "$@"
  fi
}

secret() {
  # Store a secret in Key Vault without ever echoing its value.
  local name="$1" value="$2"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "DRY-RUN  az keyvault secret set --vault-name ${KV} --name ${name} --value '<redacted>'"
  else
    az keyvault secret set --vault-name "$KV" --name "$name" --value "$value" --output none
  fi
}

echo "== CCS single-tenant instance: ${INSTANCE} (${REGION}) =="

# ── 1. Resource group + Key Vault ────────────────────────────────────────────
run group create --name "$RG" --location "$REGION" "${TAGS[@]}"
run keyvault create --name "$KV" --resource-group "$RG" --location "$REGION" "${TAGS[@]}"

# ── 2. PostgreSQL Flexible Server (admin creds straight into the vault) ──────
PG_ADMIN="ccsadmin"
PG_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
# The password must never be printed: the dry-run redacts it, and the real call
# goes to az directly rather than through run() so no echo path exists. (It is
# still an argv to az — rotate it post-provision if your threat model includes
# local process listing during the create.)
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY-RUN  az postgres flexible-server create --name ${PG} --resource-group ${RG} --location ${REGION} --admin-user ${PG_ADMIN} --admin-password '<redacted>' --sku-name Standard_B2s --tier Burstable --storage-size 64 --version 16 --database-name ccs --yes --tags product=ccs instance=${INSTANCE}"
else
  az postgres flexible-server create \
    --name "$PG" --resource-group "$RG" --location "$REGION" \
    --admin-user "$PG_ADMIN" --admin-password "$PG_PASSWORD" \
    --sku-name Standard_B2s --tier Burstable --storage-size 64 --version 16 \
    --database-name ccs --yes "${TAGS[@]}"
fi
run postgres flexible-server parameter set \
  --server-name "$PG" --resource-group "$RG" --name require_secure_transport --value on
secret "pg-admin-password" "$PG_PASSWORD"
# The RUNTIME role password (ccs_app) — created inside the DB in the next-steps
# SQL below; vaulted now so the connection strings can reference it.
CCS_APP_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
secret "ccs-app-password" "$CCS_APP_PASSWORD"

# ── 3. WORM storage: account + container + time-based immutability ───────────
run storage account create --name "$ST" --resource-group "$RG" --location "$REGION" \
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 \
  --allow-blob-public-access false "${TAGS[@]}"
run storage container create --name "$CONTAINER" --account-name "$ST" --auth-mode login
# Container-level time-based retention (WORM). 2190 days = 6 years (SYSC 9).
# RISK (§7): verify live that an overwrite AND a delete are refused before
# accepting documents; do not lock the policy until that smoke test passes.
run storage container immutability-policy create \
  --account-name "$ST" --container-name "$CONTAINER" --period 2190

# ── 4. App Service (Linux, Node 20) with a managed identity for Key Vault ────
run appservice plan create --name "$PLAN" --resource-group "$RG" --location "$REGION" \
  --is-linux --sku B1 "${TAGS[@]}"
run webapp create --name "$APP" --resource-group "$RG" --plan "$PLAN" \
  --runtime "NODE:20-lts" "${TAGS[@]}"
run webapp identity assign --name "$APP" --resource-group "$RG"

# Grant the app's managed identity read access to vault secrets.
# (RBAC-enabled vaults: use role assignment instead — adjust to your tenancy.)
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY-RUN  az keyvault set-policy --name ${KV} --secret-permissions get list --object-id <app-identity>"
else
  APP_IDENTITY="$(az webapp identity show --name "$APP" --resource-group "$RG" --query principalId -o tsv)"
  az keyvault set-policy --name "$KV" --secret-permissions get list --object-id "$APP_IDENTITY" --output none
fi

# ── 5. Secrets into the vault ────────────────────────────────────────────────
secret "auth-secret" "$(openssl rand -base64 32)"
secret "database-url" "postgresql://ccs_app:${CCS_APP_PASSWORD}@${PG}.postgres.database.azure.com:5432/ccs?schema=public&sslmode=require"
# Set these two by hand after provisioning (values you hold, not this script):
#   az keyvault secret set --vault-name ${KV} --name anthropic-api-key --value <key>
#   az keyvault secret set --vault-name ${KV} --name blob-key --value "$(az storage account keys list --account-name ${ST} --query '[0].value' -o tsv)"
# RISK (§7): the blob adapter authenticates with account key today; if policy
# mandates managed identity, swap the credential in src/lib/fp/azure-blob.ts.

# ── 6. App settings: fail-closed defaults + Key Vault references ─────────────
kvref() { echo "@Microsoft.KeyVault(SecretUri=https://${KV}.vault.azure.net/secrets/$1/)"; }
run webapp config appsettings set --name "$APP" --resource-group "$RG" --settings \
  NODE_ENV="production" \
  AUTH_URL="https://${APP}.azurewebsites.net" \
  AGENTS_AUTONOMOUS="false" \
  GATE5_CLEARED="false" \
  MODEL_TOKEN_BUDGET_MONTHLY="2000000" \
  TRAINING_CORS_ORIGINS="" \
  TRAINING_INGEST_TOKENS="" \
  AUTH_SECRET="$(kvref auth-secret)" \
  DATABASE_URL="$(kvref database-url)" \
  ANTHROPIC_API_KEY="$(kvref anthropic-api-key)" \
  BLOB_ACCOUNT="$ST" \
  BLOB_KEY="$(kvref blob-key)" \
  BLOB_CONTAINER="$CONTAINER"

# ── 7. What this script deliberately does NOT do ─────────────────────────────
cat <<NEXT

== ${INSTANCE}: Azure resources requested. Remaining steps (in order) ==

1. Create the runtime role + apply schema (from a repo checkout with psql):
     psql "postgresql://${PG_ADMIN}:<pg-admin-password from ${KV}>@${PG}.postgres.database.azure.com:5432/ccs?sslmode=require" <<'SQL'
       CREATE ROLE ccs_app LOGIN PASSWORD '<ccs-app-password from ${KV}>' NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
       GRANT CONNECT ON DATABASE ccs TO ccs_app;
       GRANT ALL ON SCHEMA public TO ccs_app;
     SQL
     DATABASE_URL=<admin url> npx prisma migrate deploy
     RLS_DATABASE_URL=<admin url> npm run db:rls        # owner applies RLS (§3)
2. Vault the two held-back secrets (anthropic-api-key, blob-key) — commands above.
3. Edit src/lib/principal.ts for this principal, build, and deploy the app
   (az webapp deploy / CI). One file per instance — that is the fleet model.
4. Entra app registration + role/arId claim mapping (DEPLOY_AZURE.md §2), then
   set AUTH_ISSUER / AUTH_CLIENT_ID / AUTH_CLIENT_SECRET as vault references.
5. Run the §4 smoke tests — ESPECIALLY the WORM overwrite/delete refusal and
   an SSO sign-in per role. Neither has ever been exercised (§7).
6. Provision per-AR training tokens (npm run token:mint -- <arId> — prints the
   raw once plus the hash entry for TRAINING_INGEST_TOKENS) and the training
   app's origin into TRAINING_CORS_ORIGINS, if used.

Fail-closed posture shipped by default: AGENTS_AUTONOMOUS=false,
GATE5_CLEARED=false, model spend capped at 2,000,000 tokens/month.
NEXT
