import { describe, it, expect } from "vitest";
import {
  autonomousEnabled,
  triggerModeFor,
  canFireAutonomously,
  scheduleLabel,
} from "./autonomous";

describe("autonomous gate (Invariant 10)", () => {
  it("autonomousEnabled is true ONLY for the exact string 'true'", () => {
    expect(autonomousEnabled({ AGENTS_AUTONOMOUS: "true" } as NodeJS.ProcessEnv)).toBe(true);
    for (const v of ["false", "1", "TRUE", "yes", "", undefined]) {
      expect(autonomousEnabled({ AGENTS_AUTONOMOUS: v } as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it("maps schedule triggers to modes", () => {
    expect(triggerModeFor("CRON")).toBe("AUTONOMOUS");
    expect(triggerModeFor("WEBHOOK")).toBe("AUTONOMOUS");
    expect(triggerModeFor("ON_DEMAND")).toBe("MANUAL");
  });

  it("gates CRON/WEBHOOK firing behind the flag; ON_DEMAND is always manual", () => {
    const off = { AGENTS_AUTONOMOUS: "false" } as NodeJS.ProcessEnv;
    const on = { AGENTS_AUTONOMOUS: "true" } as NodeJS.ProcessEnv;

    // Flag off — nothing self-fires.
    expect(canFireAutonomously("CRON", off).allowed).toBe(false);
    expect(canFireAutonomously("WEBHOOK", off).allowed).toBe(false);

    // Flag on — CRON/WEBHOOK may self-fire.
    expect(canFireAutonomously("CRON", on).allowed).toBe(true);
    expect(canFireAutonomously("WEBHOOK", on).allowed).toBe(true);

    // ON_DEMAND is operator-triggered regardless of the flag.
    expect(canFireAutonomously("ON_DEMAND", off).allowed).toBe(false);
    expect(canFireAutonomously("ON_DEMAND", on).allowed).toBe(false);
  });

  it("appends '· auto' to the schedule label only when actually autonomous", () => {
    const off = { AGENTS_AUTONOMOUS: "false" } as NodeJS.ProcessEnv;
    const on = { AGENTS_AUTONOMOUS: "true" } as NodeJS.ProcessEnv;
    expect(scheduleLabel("CRON", "Daily · 06:00", off)).toBe("Daily · 06:00");
    expect(scheduleLabel("CRON", "Daily · 06:00", on)).toBe("Daily · 06:00 · auto");
    expect(scheduleLabel("ON_DEMAND", "Operator-triggered", on)).toBe("Operator-triggered");
  });
});
