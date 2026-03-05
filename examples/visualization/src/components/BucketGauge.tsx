/**
 * Visual bucket gauge showing rate-limit consumption.
 *
 * Displays a fill bar (green → gold → red) and individual slot dots
 * representing each consumed request.
 *
 * @module BucketGauge
 */

import { useMemo } from "react";

interface BucketGaugeProps {
  limit: number;
  used: number;
}

/** Determines the fill color based on consumption percentage. */
function fillColor(pct: number): string {
  if (pct < 60) return "var(--success)";
  if (pct < 90) return "var(--accent)";
  return "var(--error)";
}

/** Visual bucket gauge with fill bar and slot dots. */
export function BucketGauge({ limit, used }: BucketGaugeProps) {
  const capped = Math.min(used, limit);
  const pct = limit > 0 ? (capped / limit) * 100 : 0;

  const slots = useMemo(() => {
    const items = [];
    for (let i = 0; i < limit; i++) {
      items.push(
        <div className={`bucket-slot ${i < capped ? "filled" : "empty"}`} key={i}>
          <div className="bucket-slot-dot" />
        </div>,
      );
    }
    return items;
  }, [capped, limit]);

  return (
    <div className="bucket-container">
      <div
        aria-label={`Rate limit quota: ${capped} of ${limit} used`}
        aria-valuemax={limit}
        aria-valuemin={0}
        aria-valuenow={capped}
        className="bucket"
        role="progressbar"
      >
        <div className="bucket-fill" style={{ background: fillColor(pct), height: `${pct}%` }} />
        <div aria-hidden="true" className="bucket-slots">
          {slots}
        </div>
      </div>
      <div className="bucket-label">
        <span className="highlight">{capped}</span> / <span className="highlight">{limit}</span>{" "}
        requests used
      </div>
    </div>
  );
}
