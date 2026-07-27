// CPD & certification standing. An AR sees its own people; operators see the
// network. Credited hours are derived server-side from training_completion
// evidence by the deterministic engine, so the browser never computes them.
import { requireTenant } from "@/lib/session";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { CpdConsole, type CpdRow } from "@/components/CpdConsole";
import { cpdPrismaDeps } from "@/lib/cpd/prisma-adapter";
import { cpdStanding } from "@/lib/cpd/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CpdPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="CPD records are restricted to authenticated users. Sign in to continue."
      />
    );
  }

  const filter = tenant.role === "AR" ? { arId: tenant.arId } : {};
  const rows = (await cpdStanding(cpdPrismaDeps, tenant, filter)) as CpdRow[];

  return (
    <ConsoleShell role={tenant.role} active="/cpd">
      <CpdConsole role={tenant.role} rows={rows} />
    </ConsoleShell>
  );
}
