/**
 * Horizontal row of scenario preset buttons with inline description.
 *
 * Uses the same `preset-bar` / `preset-btn` / `preset-description`
 * class names as the depth and complexity demos for visual consistency
 * across the graphql security suite.
 *
 * @module ScenarioBar
 */

import { useCallback } from "react";
import { SCENARIO_DESCRIPTIONS, SCENARIO_KEYS, SCENARIO_LABELS } from "../lib/utils";
import type { ScenarioId } from "../types/rate-limit";

interface ScenarioBarProps {
  activeScenario: ScenarioId | null;
  onSelect: (id: ScenarioId) => void;
}

/** Scenario preset buttons with inline description text. */
export function ScenarioBar({ activeScenario, onSelect }: ScenarioBarProps) {
  const handleClick = useCallback((id: ScenarioId) => () => onSelect(id), [onSelect]);

  const description = activeScenario ? (SCENARIO_DESCRIPTIONS[activeScenario] ?? "") : "";

  return (
    <nav className="preset-bar" aria-label="Scenario presets">
      {SCENARIO_KEYS.map((key) => (
        <button
          aria-current={activeScenario === key ? "true" : undefined}
          className={`preset-btn${activeScenario === key ? " active" : ""}`}
          key={key}
          onClick={handleClick(key)}
          title={SCENARIO_DESCRIPTIONS[key] ?? ""}
          type="button"
        >
          {SCENARIO_LABELS[key]}
        </button>
      ))}
      {description && (
        <output aria-live="polite" className="preset-description">
          {description}
        </output>
      )}
    </nav>
  );
}
