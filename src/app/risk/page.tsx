// AR risk scoring — operators only. Scoring an AR is the principal firm's
// judgement of its own oversight obligation, so an AR cannot see or set its own
// band. Totals, bands and cadences are computed server-side by the engine.
import { requireTenant } from "@/lib/session";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { RiskConsole, type RiskStandingRow } from "@/components/RiskConsole";
import { riskPrismaDeps } from "@/lib/risk/prisma-adapter";
import { riskStanding, RISK_FACTORS } from "@/lib/risk/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RiskPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="AR risk scoring is restricted to CCS compliance operators. Sign in to continue."
      />
    );
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return (
      <AccessPanel
        title="Operators only"
        body="Risk scoring is the principal firm's assessment of its appointed representatives, so it is visible to COMPLIANCE and SMF only."
      />
    );
  }

  const rows = (await riskStanding(riskPrismaDeps, tenant)) as RiskStandingRow[];

  return (
    <ConsoleShell role={tenant.role} active="/risk">
      <RiskConsole rows={rows} factors={RISK_FACTORS.map((f) => ({ key: f.key, label: f.label }))} />
    </ConsoleShell>
  );
}
