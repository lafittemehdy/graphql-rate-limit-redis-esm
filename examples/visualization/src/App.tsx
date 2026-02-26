/**
 * Root application component — all state lives here.
 *
 * Layout: Header → ScenarioBar → FlowDiagram → MainGrid
 *   MainGrid: RequestSimulator | CenterPanel | ResponseLog
 *   CenterPanel: BucketGauge + StatusIndicator + CountdownTimer + RedisState
 *
 * @module App
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { BucketGauge } from "./components/BucketGauge";
import { CountdownTimer } from "./components/CountdownTimer";
import { FlowDiagram } from "./components/FlowDiagram";
import { Header } from "./components/Header";
import { RedisState } from "./components/RedisState";
import { RequestSimulator } from "./components/RequestSimulator";
import { ResponseLog } from "./components/ResponseLog";
import { ScenarioBar } from "./components/ScenarioBar";
import { useCountdown } from "./hooks/useCountdown";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useRateLimiter } from "./hooks/useRateLimiter";
import { runScenario, SCENARIOS } from "./lib/scenarios";
import { STATUS_INDICATOR } from "./lib/utils";
import type { ScenarioId, SimulationResult } from "./types/rate-limit";

/** Root application component. */
export function App() {
  const limiter = useRateLimiter();

  const [activeScenario, setActiveScenario] = useState<ScenarioId | null>(null);
  const [flowTrigger, setFlowTrigger] = useState(0);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);
  const [sendPulse, setSendPulse] = useState<"error" | "success" | null>(null);
  const [shaking, setShaking] = useState(false);

  const scenarioCancelRef = useRef<(() => void) | null>(null);

  /* Cancel pending scenario timers on unmount */
  useEffect(() => {
    return () => {
      scenarioCancelRef.current?.();
    };
  }, []);

  /* Countdown timer — expires and resets the limiter window */
  const countdown = useCountdown(
    limiter.windowEnd,
    limiter.windowStarted,
    limiter.config.duration * 1000,
    useCallback(() => {
      limiter.reset();
    }, [limiter]),
  );

  /* Clear send pulse after animation completes */
  useEffect(() => {
    if (!sendPulse) return;
    const t = setTimeout(() => setSendPulse(null), 400);
    return () => clearTimeout(t);
  }, [sendPulse]);

  /* Clear shake after animation completes */
  useEffect(() => {
    if (!shaking) return;
    const t = setTimeout(() => setShaking(false), 250);
    return () => clearTimeout(t);
  }, [shaking]);

  /* Send a query, animate the flow diagram, and trigger feedback */
  const handleSendQuery = useCallback(() => {
    const result = limiter.sendQuery();
    if (result) {
      setLastResult(result);
      setFlowTrigger((prev) => prev + 1);
      setSendPulse(
        result.status === "rejected" || result.status === "service-error" ? "error" : "success",
      );
      if (result.status === "rejected") setShaking(true);
    }
  }, [limiter]);

  /* Run a preset scenario */
  const handleScenario = useCallback(
    (id: ScenarioId) => {
      /* Cancel any in-flight scenario */
      scenarioCancelRef.current?.();

      /* Reset everything first */
      limiter.reset();
      setActiveScenario(id);
      setLastResult(null);

      if (id === "reset") {
        setActiveScenario(null);
        return;
      }

      /* Apply scenario config overrides */
      const scenario = SCENARIOS[id];
      limiter.setConfig({ duration: scenario.duration, limit: scenario.limit });

      /* Schedule scenario actions */
      scenarioCancelRef.current = runScenario(id, {
        onRedisDown: () => {
          limiter.toggleRedisDown();
        },
        onSend: () => {
          const result = limiter.sendQuery();
          if (result) {
            setLastResult(result);
            setFlowTrigger((prev) => prev + 1);
            setSendPulse(
              result.status === "rejected" || result.status === "service-error"
                ? "error"
                : "success",
            );
            if (result.status === "rejected") setShaking(true);
          }
        },
      });
    },
    [limiter],
  );

  /* Keyboard shortcuts */
  useKeyboardShortcuts({
    onClearLog: limiter.clearLog,
    onRunScenario: handleScenario,
    onSendQuery: handleSendQuery,
    onToggleRedisDown: limiter.toggleRedisDown,
  });

  /* Derive status indicator from the last result */
  const statusInfo = lastResult ? STATUS_INDICATOR[lastResult.status] : STATUS_INDICATOR.allowed;

  /* Status class for colored text */
  const statusClass = lastResult ? `status-${lastResult.status}` : "status-allowed";

  return (
    <>
      <Header />
      <ScenarioBar activeScenario={activeScenario} onSelect={handleScenario} />
      <FlowDiagram lastResult={lastResult} trigger={flowTrigger} />

      <main className="main-grid">
        {/* Left: Request Simulator */}
        <RequestSimulator
          config={limiter.config}
          generatedKey={limiter.generatedKey}
          onDurationChange={limiter.setDuration}
          onIdentityChange={limiter.setIdentity}
          onLimitChange={limiter.setLimit}
          onSendQuery={handleSendQuery}
          onServiceErrorModeChange={limiter.setServiceErrorMode}
          onToggleRedisDown={limiter.toggleRedisDown}
          redisDown={limiter.redisDown}
          sendPulse={sendPulse}
        />

        {/* Center: Rate Limit State */}
        <section className="panel">
          <div className="panel-header">Rate Limit State</div>
          <div className="panel-body panel-state-body">
            <BucketGauge limit={limiter.config.limit} used={limiter.consumed} />

            <div className={`status-indicator ${statusClass}${shaking ? " shaking" : ""}`}>
              <span className={`status-dot ${statusInfo.cls}`} />
              <span className="status-text">{statusInfo.text}</span>
            </div>

            <CountdownTimer
              isActive={countdown.isActive}
              progress={countdown.progress}
              secondsRemaining={countdown.secondsRemaining}
            />

            <RedisState
              consumed={limiter.consumed}
              duration={limiter.config.duration}
              generatedKey={limiter.generatedKey}
              limit={limiter.config.limit}
              redisDown={limiter.redisDown}
              windowEnd={limiter.windowEnd}
              windowStarted={limiter.windowStarted}
            />
          </div>
        </section>

        {/* Right: Response Log */}
        <ResponseLog
          onClear={limiter.clearLog}
          onHighlightStep={limiter.highlightStep}
          traceIndex={limiter.traceIndex}
          traceSteps={limiter.traceSteps}
        />
      </main>
    </>
  );
}
