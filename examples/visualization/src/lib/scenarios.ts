/**
 * Preset scenario definitions and execution helpers.
 *
 * Each scenario resets state, overrides config values, then
 * fires a scripted sequence of actions via setTimeout chains.
 *
 * @module lib/scenarios
 */

import type { ScenarioId } from "../types/rate-limit";

/** Describes a single action in a scenario timeline. */
interface ScenarioAction {
  delay: number;
  type: "redisDown" | "send";
}

/** Full scenario definition. */
interface ScenarioDefinition {
  actions: ScenarioAction[] | ((limit: number) => ScenarioAction[]);
  duration: number;
  limit: number;
}

/** Generates the burst attack action sequence based on the limit. */
function burstActions(limit: number): ScenarioAction[] {
  const actions: ScenarioAction[] = [];
  const total = limit + 3;
  for (let i = 0; i < total; i++) {
    actions.push({ delay: i * 150, type: "send" });
  }
  return actions;
}

/** Scenario definitions keyed by ID. */
export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  burst: {
    actions: burstActions,
    duration: 10,
    limit: 5,
  },
  normal: {
    actions: [
      { delay: 0, type: "send" },
      { delay: 300, type: "send" },
      { delay: 600, type: "send" },
    ],
    duration: 30,
    limit: 5,
  },
  outage: {
    actions: [
      { delay: 0, type: "send" },
      { delay: 200, type: "send" },
      { delay: 500, type: "redisDown" },
      { delay: 700, type: "send" },
      { delay: 900, type: "send" },
    ],
    duration: 30,
    limit: 5,
  },
  reset: {
    actions: [],
    duration: 60,
    limit: 5,
  },
};

/**
 * Schedules scenario actions via setTimeout.
 * Returns a cleanup function that cancels all pending timers.
 */
export function runScenario(
  scenarioId: ScenarioId,
  callbacks: {
    onRedisDown: () => void;
    onSend: () => void;
  },
): () => void {
  const scenario = SCENARIOS[scenarioId];
  const actions =
    typeof scenario.actions === "function" ? scenario.actions(scenario.limit) : scenario.actions;

  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const action of actions) {
    const timer = setTimeout(() => {
      if (action.type === "send") callbacks.onSend();
      else if (action.type === "redisDown") callbacks.onRedisDown();
    }, action.delay);
    timers.push(timer);
  }

  return () => {
    for (const t of timers) clearTimeout(t);
  };
}
