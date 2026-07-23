import { describe, it, expect } from "vitest";
import {
  decideSignOff,
  SignOffError,
  type SignOffDeps,
  type SignOffDraft,
  type SignOffStore,
} from "./service";
import type { Tenant } from "../tools/types";

// An in-memory store that mirrors the atomic contract of the Prisma adapter:
// signOff materialises a FINAL row + flips status; return flips + records notes;
// both guard on the item still being PENDING.
function makeDeps(seed: SignOffDraft[]) {
  const items = new Map(seed.map((d) => [d.id, { ...d }]));
  const finals: { register: string; data: Record<string, unknown>; id: string }[] = [];
  const audited: { actor: string; action: string; entity: string; entityId?: string }[] = [];
  let n = 0;

  const store: SignOffStore = {
    get: async (id) => {
      const it = items.get(id);
      return it ? { ...it } : null;
    },
    signOff: async ({ id, register, data, decidedBy, notes }) => {
      const it = items.get(id);
      if (!it || it.status !== "PENDING") throw new SignOffError(409, "draft is no longer PENDING");
      const registerId = `${register}-${++n}`;
      finals.push({ register, data, id: registerId });
      it.status = "SIGNED_OFF";
      Object.assign(it, { decidedBy, notes });
      return { registerId };
    },
    return: async ({ id, decidedBy, notes }) => {
      const it = items.get(id);
      if (!it || it.status !== "PENDING") throw new SignOffError(409, "draft is no longer PENDING");
      it.status = "RETURNED";
      Object.assign(it, { decidedBy, notes });
    },
    approveArtifact: async ({ id, decidedBy, notes }) => {
      const it = items.get(id);
      if (!it || it.status !== "PENDING") throw new SignOffError(409, "draft is no longer PENDING");
      it.status = "SIGNED_OFF";
      Object.assign(it, { decidedBy, notes });
    },
  };

  const deps: SignOffDeps = {
    store,
    audit: {
      append: async (e) => {
        audited.push({ ...e });
        return { id: `a${++n}` };
      },
    },
  };
  return { deps, items, finals, audited };
}

const SMF: Tenant = { role: "SMF", arId: "" };
const COMPLIANCE: Tenant = { role: "COMPLIANCE", arId: "ar_six" };
const AR: Tenant = { role: "AR", arId: "ar_six" };

function cf30Draft(over: Partial<SignOffDraft> = {}): SignOffDraft {
  return {
    id: "d1",
    arId: "ar_six",
    register: "cf30_return",
    summary: "Q1 CF30 chase",
    status: "PENDING",
    payload: { arId: "ar_six", quarter: "2026-Q1", dueDate: "2026-04-16", exceptions: 0 },
    ...over,
  };
}

describe("decideSignOff — the FINAL-materialisation gate", () => {
  it("SIGN_OFF materialises a FINAL row and audits both the decision and the write", async () => {
    const { deps, items, finals, audited } = makeDeps([cf30Draft()]);

    const result = await decideSignOff(deps, SMF, { draftId: "d1", decision: "SIGN_OFF" });

    expect(result).toMatchObject({
      decision: "SIGN_OFF",
      status: "SIGNED_OFF",
      register: "cf30_return",
    });
    expect(result.registerId).toBeDefined();
    expect(items.get("d1")!.status).toBe("SIGNED_OFF");

    // The materialised row is coerced + forced FINAL (never trusts the draft).
    expect(finals).toHaveLength(1);
    expect(finals[0].data.status).toBe("FINAL");
    expect(finals[0].data.dueDate).toBeInstanceOf(Date);

    expect(audited.some((a) => a.action === "SIGNED OFF" && a.entity === "sign_off_item")).toBe(true);
    expect(
      audited.some((a) => a.action === "REGISTER WRITE (FINAL)" && a.entity === "cf30_return"),
    ).toBe(true);
  });

  it("only SMF may sign off (AR and COMPLIANCE are 403)", async () => {
    for (const who of [AR, COMPLIANCE]) {
      const { deps, finals } = makeDeps([cf30Draft()]);
      await expect(
        decideSignOff(deps, who, { draftId: "d1", decision: "SIGN_OFF" }),
      ).rejects.toMatchObject({ status: 403 });
      expect(finals).toHaveLength(0); // no FINAL row on a forbidden call
    }
  });

  it("RETURN requires a rationale and writes NO register row", async () => {
    const { deps, items, finals, audited } = makeDeps([cf30Draft()]);

    await expect(
      decideSignOff(deps, SMF, { draftId: "d1", decision: "RETURN" }),
    ).rejects.toMatchObject({ status: 400 }); // no notes

    const result = await decideSignOff(deps, SMF, {
      draftId: "d1",
      decision: "RETURN",
      notes: "Quarter label does not match the reporting period.",
    });
    expect(result.status).toBe("RETURNED");
    expect(items.get("d1")!.status).toBe("RETURNED");
    expect(finals).toHaveLength(0);
    expect(audited.some((a) => a.action === "SIGN-OFF RETURNED")).toBe(true);
  });

  it("a payload that fails its register schema fails closed (422, no FINAL row)", async () => {
    // Missing quarter + non-date dueDate — cannot become a cf30_return row.
    const bad = cf30Draft({ payload: { arId: "ar_six", dueDate: "not-a-date" } });
    const { deps, finals, items } = makeDeps([bad]);

    await expect(
      decideSignOff(deps, SMF, { draftId: "d1", decision: "SIGN_OFF" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(finals).toHaveLength(0);
    expect(items.get("d1")!.status).toBe("PENDING"); // untouched
  });

  it("financial_promotion is not materialisable via the generic queue (422)", async () => {
    const fp = cf30Draft({ register: "financial_promotion", payload: { arId: "ar_six" } });
    const { deps, finals } = makeDeps([fp]);
    await expect(
      decideSignOff(deps, SMF, { draftId: "d1", decision: "SIGN_OFF" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(finals).toHaveLength(0);
  });

  it("404 for an unknown draft; 409 for one already decided", async () => {
    const { deps } = makeDeps([cf30Draft({ status: "SIGNED_OFF" })]);
    await expect(
      decideSignOff(deps, SMF, { draftId: "nope", decision: "SIGN_OFF" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      decideSignOff(deps, SMF, { draftId: "d1", decision: "SIGN_OFF" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("approves a review_pack ARTIFACT without writing any FINAL register row", async () => {
    const pack = cf30Draft({
      register: "review_pack",
      summary: "Oversight prep pack — SIX",
      payload: {
        arId: "ar_six",
        kind: "oversight_prep",
        generatedAt: "2026-07-20T00:00:00.000Z",
        sections: [{ heading: "Open financial promotions", lines: ["FP-0007 PENDING"] }],
      },
    });
    const { deps, items, finals, audited } = makeDeps([pack]);

    const result = await decideSignOff(deps, SMF, { draftId: "d1", decision: "SIGN_OFF" });

    expect(result).toMatchObject({ decision: "SIGN_OFF", status: "SIGNED_OFF", register: "review_pack" });
    expect(result.registerId).toBeUndefined(); // no materialisation
    expect(finals).toHaveLength(0); // NO FINAL register row
    expect(items.get("d1")!.status).toBe("SIGNED_OFF");
    expect(audited.some((a) => a.action === "ARTIFACT APPROVED" && a.entity === "review_pack")).toBe(true);
    expect(audited.some((a) => a.action === "REGISTER WRITE (FINAL)")).toBe(false);
  });

  it("a malformed artifact payload fails closed (422, still PENDING)", async () => {
    const bad = cf30Draft({
      register: "evidence_pack",
      payload: { arId: "ar_six", purpose: "Q2 review", generatedAt: "2026-07-20", docs: [] },
    });
    const { deps, finals, items } = makeDeps([bad]);
    await expect(
      decideSignOff(deps, SMF, { draftId: "d1", decision: "SIGN_OFF" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(finals).toHaveLength(0);
    expect(items.get("d1")!.status).toBe("PENDING");
  });

  it("materialises a risk_score draft (register without a PENDING/FINAL column)", async () => {
    const risk = cf30Draft({
      register: "risk_score",
      payload: {
        arId: "ar_six",
        factors: [3, 2, 3, 2, 2],
        total: 12,
        band: "RED",
        cadence: "Quarterly + ad-hoc",
        computedAt: "2026-07-01T00:00:00.000Z",
      },
    });
    const { deps, finals } = makeDeps([risk]);
    const result = await decideSignOff(deps, SMF, { draftId: "d1", decision: "SIGN_OFF" });
    expect(result.status).toBe("SIGNED_OFF");
    expect(finals[0].register).toBe("risk_score");
    expect(finals[0].data.band).toBe("RED");
    expect(finals[0].data.computedAt).toBeInstanceOf(Date);
  });
});
