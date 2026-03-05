/**
 * Response log — trace console with prev/next navigation
 * and expandable JSON response details.
 *
 * @module ResponseLog
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DOT_MAP, formatTime, STATUS_ICONS, STATUS_LABELS } from "../lib/utils";
import type { SimulationResult } from "../types/rate-limit";

interface ResponseLogProps {
  onClear: () => void;
  onHighlightStep: (index: number) => void;
  traceIndex: number;
  traceSteps: SimulationResult[];
}

/** Trace console with prev/next navigation and expandable log entries. */
export function ResponseLog({
  onClear,
  onHighlightStep,
  traceIndex,
  traceSteps,
}: ResponseLogProps) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  /* Auto-scroll on new entries */
  useEffect(() => {
    if (traceSteps.length > prevLengthRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLengthRef.current = traceSteps.length;
  }, [traceSteps.length]);

  const handlePrev = useCallback(() => {
    if (traceSteps.length === 0) return;
    const prev = traceIndex <= 0 ? traceSteps.length - 1 : traceIndex - 1;
    onHighlightStep(prev);
  }, [onHighlightStep, traceIndex, traceSteps.length]);

  const handleNext = useCallback(() => {
    if (traceSteps.length === 0) return;
    const next = traceIndex >= traceSteps.length - 1 ? 0 : traceIndex + 1;
    onHighlightStep(next);
  }, [onHighlightStep, traceIndex, traceSteps.length]);

  const toggleExpand = useCallback((index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  /* Determine console status dot class */
  const dotClass =
    traceIndex >= 0 && traceSteps[traceIndex] ? (DOT_MAP[traceSteps[traceIndex].status] ?? "") : "";

  return (
    <section className="panel lab-trace-section">
      <div className="console-header">
        <span aria-hidden="true" className={`status-dot ${dotClass}`} />
        <span className="console-title">Response Log</span>
        <button
          aria-label="Clear response log"
          className="console-toggle"
          onClick={onClear}
          type="button"
        >
          {"\u2715"}
        </button>
        <div className={`console-nav${traceSteps.length > 0 ? " visible" : ""}`}>
          <button
            aria-label="Previous step"
            className="console-nav-btn"
            onClick={handlePrev}
            type="button"
          >
            {"\u2039"}
          </button>
          <span className="console-counter">
            {traceSteps.length > 0 ? `${traceIndex + 1}/${traceSteps.length}` : "0/0"}
          </span>
          <button
            aria-label="Next step"
            className="console-nav-btn"
            onClick={handleNext}
            type="button"
          >
            {"\u203A"}
          </button>
        </div>
      </div>

      <div aria-live="polite" className="console-output" ref={scrollRef} role="log">
        {traceSteps.length === 0 ? (
          <div className="console-empty">Send a query to see responses here.</div>
        ) : (
          traceSteps.map((step, i) => {
            const isExpanded = expandedSet.has(i);
            const isCurrent = i === traceIndex;
            const icon = STATUS_ICONS[step.status] ?? "?";
            const label = STATUS_LABELS[step.status] ?? String(step.statusCode);
            const json = JSON.stringify(step.response, null, 2);

            return (
              // biome-ignore lint/a11y/useSemanticElements: complex expandable panel with nested block content
              <div
                aria-expanded={isExpanded}
                className={`lab-trace-step ${step.status}${isCurrent ? " is-current" : ""}${isExpanded ? " expanded" : ""}`}
                key={`${step.timestamp}:${step.status}:${step.key}:${step.statusCode}`}
                onClick={() => toggleExpand(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpand(i);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
                <div className="step-body">
                  <div className="step-fn">
                    {step.key} <span className="step-state">{label}</span>
                  </div>
                  <div className="step-id">{formatTime(step.timestamp)}</div>
                </div>
                <span className="step-icon">{icon}</span>
                <pre className="step-response">{json}</pre>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
