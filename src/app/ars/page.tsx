// AR roster (SUP 12) — operators only. The register of firms the principal is
// responsible for, with the oversight load attached to each and the lawful
// status transitions available. Changes are proposed for SMF sign-off.
import { requireTenant } from "@/lib/session";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { ArRosterConsole, type ArRosterRow } from "@/components/ArRosterConsole";
import { arPrismaDeps } from "@/lib/ar/prisma-adapter";
import { arRoster, TRANSITION_NOTE } from "@/lib/ar/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ArsPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="The AR register is restricted to CCS compliance operators. Sign in to continue."
      />
    );
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return (
      <AccessPanel
        title="Operators only"
        body="The appointed-representative register is maintained by the principal firm, so it is visible to COMPLIANCE and SMF only."
      />
    );
  }

  const rows = (await arRoster(arPrismaDeps, tenant)) as ArRosterRow[];

  return (
    <ConsoleShell role={tenant.role} active="/ars">
      <ArRosterConsole rows={rows} transitionNotes={TRANSITION_NOTE} />
    </ConsoleShell>
  );
}
