/**
 * Horizontal row of scenario preset buttons with active description.
 *
 * Pattern mirrors graphql-query-complexity-esm's PresetBar.
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

/** Scenario preset buttons with description text below. */
export function ScenarioBar({ activeScenario, onSelect }: ScenarioBarProps) {
  const handleClick = useCallback((id: ScenarioId) => () => onSelect(id), [onSelect]);

  const description = activeScenario ? (SCENARIO_DESCRIPTIONS[activeScenario] ?? "") : "";

  return (
    <nav className="scenario-bar" aria-label="Scenario presets">
      <div className="scenario-bar-buttons">
        {SCENARIO_KEYS.map((key) => (
          <button
            className={`scenario-btn${activeScenario === key ? " active" : ""}`}
            key={key}
            onClick={handleClick(key)}
            type="button"
          >
            {SCENARIO_LABELS[key]}
          </button>
        ))}
      </div>
      <div className={`scenario-bar-description${description ? " visible" : ""}`}>
        {description}
      </div>
    </nav>
  );
}
