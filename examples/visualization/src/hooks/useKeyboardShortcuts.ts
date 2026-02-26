/**
 * Global keyboard shortcut hook for the rate-limit visualization.
 *
 * Maps:
 *   Space / Enter → send query
 *   1–4           → trigger scenarios
 *   C             → clear log
 *   R             → toggle Redis down
 *
 * Suppresses shortcuts when a text input is focused.
 *
 * @module hooks/useKeyboardShortcuts
 */

import { useEffect, useRef } from "react";
import { isTextInputElement, SCENARIO_KEYS } from "../lib/utils";
import type { ScenarioId } from "../types/rate-limit";

interface ShortcutActions {
  onClearLog: () => void;
  onRunScenario: (id: ScenarioId) => void;
  onSendQuery: () => void;
  onToggleRedisDown: () => void;
}

/** Registers global keyboard shortcuts. Cleans up on unmount. */
export function useKeyboardShortcuts(actions: ShortcutActions): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTextInputElement(e.target)) return;

      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          actionsRef.current.onSendQuery();
          break;

        case "1":
        case "2":
        case "3":
        case "4": {
          e.preventDefault();
          const idx = parseInt(e.key, 10) - 1;
          const scenarioKey = SCENARIO_KEYS[idx];
          if (scenarioKey) actionsRef.current.onRunScenario(scenarioKey);
          break;
        }

        case "c":
        case "C":
          e.preventDefault();
          actionsRef.current.onClearLog();
          break;

        case "r":
        case "R":
          e.preventDefault();
          actionsRef.current.onToggleRedisDown();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
