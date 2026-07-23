import { describe, it, expect } from "vitest";
import { fileNilReturn, Cf30Error, NIL_SECTIONS, type Cf30Deps } from "./service";
import type { Tenant } from "../tools/types";

// In-memory stubs — no DB, no network. Capture what the service persists.
function makeDeps() {
  const drafts: Array<{
    register: string;
    arId: string;
    payload: Record<string, unknown>;
    summary: string;
    createdBy: string;
  }> = [];
  const audits: Array<{ actor: string; action: string; entity: string; entityId?: string }> = [];
  const deps: Cf30Deps = {
    store: {
      async createPendingDraft(input) {
        drafts.push({
          register: input.register,
          arId: input.arId,
          payload: input.payload,
          summary: input.summary,
          createdBy: input.createdBy,
        });
        return { id: `draft_${drafts.length}`, status: "PENDING" };
      },
    },
    audit: {
      async append(e) {
        audits.push(e);
        return { id: `audit_${audits.length}` };
      },
    },
  };
  return { deps, drafts, audits };
}

const AR: Tenant = { role: "AR", arId: "ar_codrington" };

describe("fileNilReturn", () => {
  it("creates a PENDING cf30_return draft (never FINAL) with engine-derived quarter", async () => {
    const { deps, drafts } = makeDeps();
    const res = await fileNilReturn(deps, AR, {
      arId: "ar_codrington",
      referenceDate: "2026-06-30",
      declaredBy: "Rachel Bailey · Director",
    });

    expect(res.status).toBe("PENDING");
    expect(res.quarter).toBe("2026-Q2");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].register).toBe("cf30_return");
    expect(drafts[0].arId).toBe("ar_codrington");
    // NIL means zero exceptions; quarter/dueDate come from the engine.
    expect(drafts[0].payload.exceptions).toBe(0);
    expect(drafts[0].payload.quarter).toBe("2026-Q2");
    expect(drafts[0].summary).toContain(`all ${NIL_SECTIONS.length} sections NIL`);
    expect(drafts[0].summary).toContain("Rachel Bailey");
  });

  it("writes an append-only CF30 NIL FILED audit row", async () => {
    const { deps, audits } = makeDeps();
    await fileNilReturn(deps, AR, {
      arId: "ar_codrington",
      referenceDate: "2026-06-30",
      declaredBy: "Rachel Bailey · Director",
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("CF30 NIL FILED");
    expect(audits[0].entity).toBe("cf30_return");
    expect(audits[0].actor).toBe("AR:ar_codrington");
  });

  it("forbids an AR filing for another firm (403)", async () => {
    const { deps, drafts } = makeDeps();
    await expect(
      fileNilReturn(deps, AR, {
        arId: "ar_six",
        referenceDate: "2026-06-30",
        declaredBy: "Rachel Bailey · Director",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(drafts).toHaveLength(0);
  });

  it("requires a named declaration (400)", async () => {
    const { deps } = makeDeps();
    await expect(
      fileNilReturn(deps, AR, {
        arId: "ar_codrington",
        referenceDate: "2026-06-30",
        declaredBy: "   ",
      }),
    ).rejects.toBeInstanceOf(Cf30Error);
  });

  it("lets an operator file on behalf of a named firm", async () => {
    const { deps, drafts, audits } = makeDeps();
    const smf: Tenant = { role: "SMF", arId: "" };
    const res = await fileNilReturn(deps, smf, {
      arId: "ar_codrington",
      referenceDate: "2026-06-30",
      declaredBy: "N. Okafor · SMF16",
    });
    expect(res.status).toBe("PENDING");
    expect(drafts[0].arId).toBe("ar_codrington");
    expect(audits[0].actor).toBe("SMF:network");
  });
});
