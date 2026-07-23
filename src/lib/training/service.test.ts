import { describe, it, expect } from "vitest";
import {
  recordCompletions,
  cpdStatus,
  TrainingError,
  type TrainingDeps,
  type TrainingCompletionRow,
} from "./service";
import { creditedCpdHours } from "../engine";
import type { Tenant } from "../tools/types";

// In-memory stubs — no DB, no network. Capture what the service persists.
function makeDeps() {
  const rows: TrainingCompletionRow[] = [];
  const audits: Array<{ actor: string; action: string; entity: string; entityId?: string }> = [];
  const deps: TrainingDeps = {
    store: {
      async appendCompletion(row) {
        rows.push(row);
        return { id: `tc_${rows.length}` };
      },
      async listCompletions(filter) {
        return rows
          .filter((r) => r.arId === filter.arId && (!filter.person || r.person === filter.person))
          .map((r) => ({ person: r.person, moduleId: r.moduleId, passed: r.passed }));
      },
    },
    audit: {
      async append(e) {
        audits.push(e);
        return { id: `a_${audits.length}` };
      },
    },
  };
  return { deps, rows, audits };
}

const OPERATOR: Tenant = { role: "COMPLIANCE", arId: "" };
const AR_CODRINGTON: Tenant = { role: "AR", arId: "ar_codrington" };

function completion(over: Partial<Record<string, unknown>> = {}) {
  return {
    person: "Nicholas James Cant",
    moduleId: "m4",
    moduleTitle: "AML & Financial Crime",
    quarter: "Q2",
    score: 4,
    outOf: 4,
    pct: 100,
    passed: true,
    completedAt: "2026-05-02T09:00:00.000Z",
    ...over,
  };
}

describe("recordCompletions — append-only ingest", () => {
  it("writes one training_completion per item and a single batch audit (never person_cpd)", async () => {
    const { deps, rows, audits } = makeDeps();
    const res = await recordCompletions(deps, OPERATOR, {
      arId: "ar_codrington",
      completions: [completion(), completion({ moduleId: "m3", moduleTitle: "Fin Prom" })],
    });

    expect(res.recorded).toBe(2);
    expect(res.ids).toHaveLength(2);
    expect(rows.every((r) => r.arId === "ar_codrington")).toBe(true);
    expect(rows.every((r) => r.source === "training_platform")).toBe(true);
    // Exactly one audit event for the batch, and it targets the evidence table.
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("TRAINING COMPLETIONS RECORDED");
    expect(audits[0].entity).toBe("training_completion");
    expect(audits.some((a) => a.entity === "person_cpd")).toBe(false);
  });

  it("lets an AR record for its own firm", async () => {
    const { deps, rows } = makeDeps();
    await recordCompletions(deps, AR_CODRINGTON, {
      arId: "ar_codrington",
      completions: [completion()],
    });
    expect(rows).toHaveLength(1);
  });

  it("forbids an AR recording for another firm (403), writing nothing", async () => {
    const { deps, rows, audits } = makeDeps();
    await expect(
      recordCompletions(deps, AR_CODRINGTON, {
        arId: "ar_six",
        completions: [completion()],
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(rows).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("rejects a malformed batch (400) before any write (fail closed)", async () => {
    const { deps, rows } = makeDeps();
    await expect(
      recordCompletions(deps, OPERATOR, { arId: "ar_codrington", completions: [] }),
    ).rejects.toBeInstanceOf(TrainingError);
    await expect(
      recordCompletions(deps, OPERATOR, {
        arId: "ar_codrington",
        completions: [completion({ pct: 150 })], // out of range
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(rows).toHaveLength(0);
  });
});

describe("cpdStatus — deterministic roll-up", () => {
  it("credits only passed, distinct modules and derives the strike level", async () => {
    const { deps } = makeDeps();
    await recordCompletions(deps, OPERATOR, {
      arId: "ar_codrington",
      completions: [
        completion({ moduleId: "m1", passed: true }),
        completion({ moduleId: "m2", passed: true }),
        completion({ moduleId: "m2", passed: true }), // retake — counts once
        completion({ moduleId: "m3", passed: false }), // failed — no credit
      ],
    });

    // m1 (4) + m2 (4) = 8 credited hours.
    const status = await cpdStatus(deps, OPERATOR, {
      arId: "ar_codrington",
      person: "Nicholas James Cant",
      monthsLeft: 0,
    });
    expect(status.cpdHours).toBe(8);
    expect(status.required).toBe(35);
    // 8h < 35h at year end → three strikes.
    expect(status.strikes).toBe(3);
  });
});

describe("creditedCpdHours — engine", () => {
  it("sums the full programme to exactly the 35h requirement", () => {
    const all = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"].map((moduleId) => ({
      moduleId,
      passed: true,
    }));
    expect(creditedCpdHours(all)).toBe(35);
  });

  it("ignores failed and unknown modules", () => {
    expect(
      creditedCpdHours([
        { moduleId: "m1", passed: false },
        { moduleId: "m99", passed: true },
      ]),
    ).toBe(0);
  });
});
