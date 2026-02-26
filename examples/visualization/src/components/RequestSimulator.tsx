/**
 * Left panel — request simulator with stepper inputs, schema preview,
 * query preview, generated key, and action buttons.
 *
 * @module RequestSimulator
 */

import { useCallback, useEffect, useRef } from "react";

import type { ErrorMode, Identity, RateLimitConfig } from "../types/rate-limit";

interface RequestSimulatorProps {
  config: RateLimitConfig;
  generatedKey: string;
  onDurationChange: (duration: number) => void;
  onIdentityChange: (identity: Identity) => void;
  onLimitChange: (limit: number) => void;
  onSendQuery: () => void;
  onServiceErrorModeChange: (mode: ErrorMode) => void;
  onToggleRedisDown: () => void;
  redisDown: boolean;
  sendPulse: "error" | "success" | null;
}

/**
 * Fires `callback` immediately on press, then auto-repeats with acceleration.
 * Timing: 400ms initial delay, then 120ms repeats, then 50ms after 6 ticks.
 */
function useHoldRepeat(callback: () => void): {
  onPointerDown: () => void;
  onPointerLeave: () => void;
  onPointerUp: () => void;
} {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticksRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    ticksRef.current = 0;
  }, []);

  const schedule = useCallback(() => {
    const delay = ticksRef.current < 6 ? 120 : 50;
    timerRef.current = setTimeout(() => {
      callback();
      ticksRef.current += 1;
      schedule();
    }, delay);
  }, [callback]);

  const start = useCallback(() => {
    stop();
    callback();
    timerRef.current = setTimeout(() => {
      callback();
      ticksRef.current = 1;
      schedule();
    }, 400);
  }, [callback, schedule, stop]);

  useEffect(() => stop, [stop]);

  return { onPointerDown: start, onPointerLeave: stop, onPointerUp: stop };
}

/** Request simulator panel with stepper inputs and action controls. */
export function RequestSimulator({
  config,
  generatedKey,
  onDurationChange,
  onIdentityChange,
  onLimitChange,
  onSendQuery,
  onServiceErrorModeChange,
  onToggleRedisDown,
  redisDown,
  sendPulse,
}: RequestSimulatorProps) {
  /* --- Limit stepper --- */
  const decrementLimit = useCallback(
    () => onLimitChange(Math.max(1, config.limit - 1)),
    [config.limit, onLimitChange],
  );
  const incrementLimit = useCallback(
    () => onLimitChange(Math.min(20, config.limit + 1)),
    [config.limit, onLimitChange],
  );
  const limitDecHold = useHoldRepeat(decrementLimit);
  const limitIncHold = useHoldRepeat(incrementLimit);

  const handleLimitInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number.parseInt(e.target.value, 10);
      if (Number.isFinite(val)) onLimitChange(Math.max(1, Math.min(20, val)));
    },
    [onLimitChange],
  );

  /* --- Duration stepper --- */
  const decrementDuration = useCallback(
    () => onDurationChange(Math.max(5, config.duration - 5)),
    [config.duration, onDurationChange],
  );
  const incrementDuration = useCallback(
    () => onDurationChange(Math.min(120, config.duration + 5)),
    [config.duration, onDurationChange],
  );
  const durationDecHold = useHoldRepeat(decrementDuration);
  const durationIncHold = useHoldRepeat(incrementDuration);

  const handleDurationInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number.parseInt(e.target.value, 10);
      if (Number.isFinite(val)) onDurationChange(Math.max(5, Math.min(120, val)));
    },
    [onDurationChange],
  );

  /* --- Identity --- */
  const handleIdentityChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => onIdentityChange(e.target.value as Identity),
    [onIdentityChange],
  );

  /* --- Send pulse class --- */
  const pulseClass = sendPulse ? ` pulse-${sendPulse}` : "";
  const durationInputId = "rate-limit-duration-input";
  const identitySelectId = "rate-limit-identity-select";
  const limitInputId = "rate-limit-limit-input";

  return (
    <section className="panel">
      <div className="panel-header">Request Simulator</div>
      <div className="panel-body">
        {/* Limit stepper */}
        <div className="control-group">
          <label htmlFor={limitInputId}>Limit (requests per window)</label>
          <div className="control-stepper">
            <button
              className="control-stepper-btn"
              onPointerDown={limitDecHold.onPointerDown}
              onPointerLeave={limitDecHold.onPointerLeave}
              onPointerUp={limitDecHold.onPointerUp}
              title="Decrease limit"
              type="button"
            >
              &minus;
            </button>
            <input
              className="control-stepper-input"
              id={limitInputId}
              max={20}
              min={1}
              onChange={handleLimitInput}
              type="number"
              value={config.limit}
            />
            <button
              className="control-stepper-btn"
              onPointerDown={limitIncHold.onPointerDown}
              onPointerLeave={limitIncHold.onPointerLeave}
              onPointerUp={limitIncHold.onPointerUp}
              title="Increase limit"
              type="button"
            >
              +
            </button>
          </div>
        </div>

        {/* Duration stepper */}
        <div className="control-group">
          <label htmlFor={durationInputId}>Duration (seconds)</label>
          <div className="control-stepper">
            <button
              className="control-stepper-btn"
              onPointerDown={durationDecHold.onPointerDown}
              onPointerLeave={durationDecHold.onPointerLeave}
              onPointerUp={durationDecHold.onPointerUp}
              title="Decrease duration"
              type="button"
            >
              &minus;
            </button>
            <input
              className="control-stepper-input"
              id={durationInputId}
              max={120}
              min={5}
              onChange={handleDurationInput}
              step={5}
              type="number"
              value={config.duration}
            />
            <button
              className="control-stepper-btn"
              onPointerDown={durationIncHold.onPointerDown}
              onPointerLeave={durationIncHold.onPointerLeave}
              onPointerUp={durationIncHold.onPointerUp}
              title="Increase duration"
              type="button"
            >
              +
            </button>
          </div>
        </div>

        {/* Identity select */}
        <div className="control-group">
          <label htmlFor={identitySelectId}>Identity</label>
          <select
            className="control-select"
            id={identitySelectId}
            onChange={handleIdentityChange}
            value={config.identity}
          >
            <option value="user">Authenticated User (user:123)</option>
            <option value="ip">IP Only (192.168.1.1)</option>
            <option value="anonymous">Anonymous</option>
          </select>
        </div>

        {/* Service error mode toggle */}
        <div className="control-group">
          <div className="control-label">Service Error Mode</div>
          <div className="toggle-group">
            <button
              className={`toggle-btn${config.serviceErrorMode === "failClosed" ? " active" : ""}`}
              onClick={() => onServiceErrorModeChange("failClosed")}
              type="button"
            >
              failClosed
            </button>
            <button
              className={`toggle-btn${config.serviceErrorMode === "failOpen" ? " active" : ""}`}
              onClick={() => onServiceErrorModeChange("failOpen")}
              type="button"
            >
              failOpen
            </button>
          </div>
        </div>

        {/* Schema preview */}
        <div className="code-block">
          <span className="keyword">type</span> <span className="type">Query</span> {"{"}
          <br />
          {"  "}login: <span className="type">String!</span>{" "}
          <span className="directive">@rateLimit</span>(limit:{" "}
          <span className="number">{config.limit}</span>, duration:{" "}
          <span className="number">{config.duration}</span>)<br />
          {"}"}
        </div>

        {/* Query preview */}
        <div className="code-block">
          <span className="keyword">query</span> {"{"} login(email:{" "}
          <span className="string">"user@example.com"</span>) {"}"}
        </div>

        {/* Generated key display */}
        <div className="key-display">
          <span className="key-label">Key:</span>
          <code className="key-value">{generatedKey}</code>
        </div>

        {/* Action buttons */}
        <button className={`btn-primary${pulseClass}`} onClick={onSendQuery} type="button">
          Send Query<kbd>Space</kbd>
        </button>
        <button
          className={`btn-danger${redisDown ? " active" : ""}`}
          onClick={onToggleRedisDown}
          type="button"
        >
          {redisDown ? "Restore Redis" : "Simulate Redis Down"}
          <kbd>R</kbd>
        </button>
      </div>
    </section>
  );
}
