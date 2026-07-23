// Phase 8 — the AGENTS_AUTONOMOUS gate (Invariant 10). Autonomy is gated, not
// assumed: CRON / WEBHOOK agents may only self-fire once the flag is explicitly
// enabled (which, operationally, happens only after Gate 5 — a clean Codrington
// pilot quarter + executed DPA + pen test sign-off). Until then every agent run
// is operator-triggered through the manual route, which never passes through
// this gate. The flag is a deploy-time, per-environment control.
import type { Trigger } from "./specs";

export type TriggerMode = "MANUAL" | "AUTONOMOUS";

/**
 * True only when AGENTS_AUTONOMOUS is exactly the string "true". Anything else
 * (unset, "false", "1", "TRUE", …) fails closed to disabled — a typo can never
 * accidentally enable autonomy.
 */
export function autonomousEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AGENTS_AUTONOMOUS === "true";
}

/**
 * The trigger mode an agent's schedule implies. CRON + WEBHOOK agents are meant
 * to fire autonomously; ON_DEMAND agents are operator-triggered (MANUAL).
 */
export function triggerModeFor(trigger: Trigger): TriggerMode {
  return trigger === "ON_DEMAND" ? "MANUAL" : "AUTONOMOUS";
}

export interface AutonomyDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Gate an autonomous (CRON/WEBHOOK) firing. Operator-triggered runs do NOT pass
 * through here — the manual route calls runAgent directly. An AUTONOMOUS agent
 * may self-fire only when the flag is on; otherwise it stays gated and must be
 * run manually. Fail-closed is the default answer.
 */
export function canFireAutonomously(
  trigger: Trigger,
  env: NodeJS.ProcessEnv = process.env,
): AutonomyDecision {
  if (triggerModeFor(trigger) === "MANUAL") {
    return { allowed: false, reason: "operator-triggered agent — run via the manual route" };
  }
  if (!autonomousEnabled(env)) {
    return {
      allowed: false,
      reason: "AGENTS_AUTONOMOUS is not enabled — autonomy gated until Gate 5",
    };
  }
  return { allowed: true, reason: "autonomous scheduling enabled" };
}

/**
 * The schedule label for the UI. The "· auto" suffix appears only when the agent
 * is actually firing autonomously — so operators see at a glance that nothing is
 * running unattended while the flag is off.
 */
export function scheduleLabel(
  trigger: Trigger,
  schedule: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return canFireAutonomously(trigger, env).allowed ? `${schedule} · auto` : schedule;
}
