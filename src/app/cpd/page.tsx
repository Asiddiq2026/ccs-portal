// CPD & certification standing. An AR sees its own people; operators see the
// network. Credited hours are derived server-side from training_completion
// evidence by the deterministic engine, so the browser never computes them.
import { requireTenant } from "@/lib/session";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { CpdConsole, type CpdRow, type CertPack } from "@/components/CpdConsole";
import { cpdPrismaDeps } from "@/lib/cpd/prisma-adapter";
import { cpdStanding } from "@/lib/cpd/service";
import { prismaCertificateStore } from "@/lib/training/certificate-prisma-adapter";

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

  // Operators also get the stored-certificate evidence per firm, so they can
  // gather it into a PENDING evidence_pack deterministically (gather_docs via
  // the tool gateway — no LLM run needed).
  let certPacks: CertPack[] = [];
  if (tenant.role === "COMPLIANCE" || tenant.role === "SMF") {
    const firms = [...new Set(rows.map((r) => r.arId))];
    certPacks = (
      await Promise.all(
        firms.map(async (arId) => ({
          arId,
          docs: await prismaCertificateStore.listForEvidence({ arId }, tenant),
        })),
      )
    ).filter((p) => p.docs.length > 0);
  }

  return (
    <ConsoleShell role={tenant.role} active="/cpd">
      <CpdConsole role={tenant.role} rows={rows} certPacks={certPacks} />
    </ConsoleShell>
  );
}
