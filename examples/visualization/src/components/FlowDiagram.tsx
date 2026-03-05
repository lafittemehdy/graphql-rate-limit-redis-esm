/**
 * Animated 4-step flow diagram: Request → Key Gen → Redis Consume → Allow/Reject.
 *
 * Each node lights up sequentially (100ms stagger) when a request is processed.
 * The final node color reflects the result status.
 *
 * @module FlowDiagram
 */

import { useEffect, useRef, useState } from "react";

import type { RequestStatus } from "../types/rate-limit";

interface FlowDiagramProps {
  lastResult: { status: RequestStatus } | null;
  trigger: number;
}

const NODES = ["Request", "Key Gen", "Redis Consume", "Allow / Reject"] as const;
const STAGGER_MS = 100;
const ACTIVE_MS = 250;

/** Animated flow diagram showing the rate-limit pipeline. */
export function FlowDiagram({ lastResult, trigger }: FlowDiagramProps) {
  const [activeNodes, setActiveNodes] = useState<Set<number>>(new Set());
  const [resultStatus, setResultStatus] = useState<RequestStatus | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (trigger === 0) return;

    /* Clear any in-flight animation */
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
    setResultStatus(null);

    /* Stagger node activations */
    NODES.forEach((_, i) => {
      const onTimer = setTimeout(() => {
        setActiveNodes((prev) => new Set([...prev, i]));

        const offTimer = setTimeout(() => {
          setActiveNodes((prev) => {
            const next = new Set(prev);
            next.delete(i);
            return next;
          });
        }, ACTIVE_MS);
        timersRef.current.push(offTimer);
      }, i * STAGGER_MS);
      timersRef.current.push(onTimer);
    });

    /* Set result status on final node */
    const resultTimer = setTimeout(
      () => {
        if (lastResult) setResultStatus(lastResult.status);
      },
      (NODES.length - 1) * STAGGER_MS,
    );
    timersRef.current.push(resultTimer);

    return () => {
      for (const t of timersRef.current) clearTimeout(t);
    };
  }, [lastResult, trigger]);

  return (
    <section aria-label="Request processing flow" className="flow-diagram">
      {NODES.map((label, i) => (
        <div className="flow-step" key={label}>
          <div
            className={`flow-node${activeNodes.has(i) ? " active" : ""}`}
            data-status={i === NODES.length - 1 && resultStatus ? resultStatus : undefined}
          >
            {label}
          </div>
          {i < NODES.length - 1 && (
            <span aria-hidden="true" className="flow-arrow">
              {"\u2192"}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
