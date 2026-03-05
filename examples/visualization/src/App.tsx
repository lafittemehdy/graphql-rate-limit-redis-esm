/**
 * Root application component — all state lives here.
 *
 * Layout: Header → ScenarioBar → FlowDiagram → MainGrid
 *   MainGrid: RequestSimulator | CenterPanel | ResponseLog
 *   CenterPanel: BucketGauge + StatusIndicator + CountdownTimer + RedisState
 *
 * First-visit animation ("The Flood") auto-fires a burst of requests:
 * the bucket fills slot by slot, the flow diagram lights up with each
 * request, and when the quota is exhausted the final request is
 * REJECTED with a dramatic shake.
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
import { WelcomePrompt } from "./components/WelcomePrompt";
import { useCountdown } from "./hooks/useCountdown";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useRateLimiter } from "./hooks/useRateLimiter";
import { runScenario, SCENARIOS } from "./lib/scenarios";
import { isIntroDisabled, STATUS_INDICATOR } from "./lib/utils";
import type { ScenarioId, SimulationResult } from "./types/rate-limit";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Intro flood animation config. */
const INTRO_LIMIT = 5;
const INTRO_DURATION = 10;
const INTRO_REQUEST_INTERVAL = 350;
const INTRO_TOTAL_REQUESTS = INTRO_LIMIT + 2;

/** Root application component. */
export function App() {
  const limiter = useRateLimiter();

  const [activeScenario, setActiveScenario] = useState<ScenarioId | null>(null);
  const [flowTrigger, setFlowTrigger] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);
  const [sendPulse, setSendPulse] = useState<"error" | "success" | null>(null);
  const [shaking, setShaking] = useState(false);
  const [showWelcome, setShowWelcome] = useState(!isIntroDisabled());

  const animCancelsRef = useRef<(() => void)[]>([]);
  const limiterRef = useRef(limiter);
  limiterRef.current = limiter;
  const scenarioCancelRef = useRef<(() => void) | null>(null);
  const skippedRef = useRef(false);

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

  // --- Finish / skip helpers ---

  const finishAnimation = useCallback(() => {
    for (const cancel of animCancelsRef.current) cancel();
    animCancelsRef.current = [];
    setIsAnimating(false);
  }, []);

  const skipAnimation = useCallback(() => {
    if (!isAnimating || skippedRef.current) return;
    skippedRef.current = true;
    finishAnimation();
  }, [isAnimating, finishAnimation]);

  // --- The Flood: animation sequence ---

  useEffect(() => {
    if (!isAnimating) return;
    skippedRef.current = false;

    const cancels: (() => void)[] = [];
    animCancelsRef.current = cancels;

    /** Schedule a callback after `ms` (cancellable). */
    function after(ms: number, fn: () => void): void {
      const t = setTimeout(() => {
        if (!skippedRef.current) fn();
      }, ms);
      cancels.push(() => clearTimeout(t));
    }

    // Reduced motion: show final state instantly
    if (REDUCED_MOTION) {
      after(300, finishAnimation);
      return;
    }

    // Configure the limiter for the intro (use ref to avoid re-trigger)
    const lim = limiterRef.current;
    lim.reset();
    lim.setConfig({ duration: INTRO_DURATION, limit: INTRO_LIMIT });
    setLastResult(null);
    setActiveScenario(null);

    let elapsed = 600; // 600ms of stillness

    // Phase 1: The Flood — fire requests one by one
    for (let i = 0; i < INTRO_TOTAL_REQUESTS; i++) {
      const requestTime = elapsed;
      after(requestTime, () => {
        const result = limiterRef.current.sendQuery();
        if (result) {
          setLastResult(result);
          setFlowTrigger((prev) => prev + 1);
          setSendPulse(
            result.status === "rejected" || result.status === "service-error" ? "error" : "success",
          );
          if (result.status === "rejected") setShaking(true);
        }
      });
      elapsed += INTRO_REQUEST_INTERVAL;
    }

    // Phase 2: Hold — let the rejected state sit
    elapsed += 800;

    // Phase 3: Done
    after(elapsed, finishAnimation);

    return () => {
      for (const c of cancels) c();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnimating, finishAnimation]);

  // --- Skip animation on any click or keypress ---

  useEffect(() => {
    if (!isAnimating) return;

    const handler = () => skipAnimation();

    const t = setTimeout(() => {
      document.addEventListener("click", handler);
      document.addEventListener("keydown", handler);
    }, 200);

    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [isAnimating, skipAnimation]);

  // --- Welcome prompt handlers ---

  const handleWelcomePlay = useCallback(() => {
    setShowWelcome(false);
    setIsAnimating(true);
  }, []);

  const handleWelcomeSkip = useCallback(() => {
    setShowWelcome(false);
  }, []);

  const handleReplay = useCallback(() => {
    if (isAnimating) return;
    limiter.reset();
    setLastResult(null);
    setIsAnimating(true);
  }, [isAnimating, limiter]);

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
      {showWelcome && <WelcomePrompt onPlay={handleWelcomePlay} onSkip={handleWelcomeSkip} />}
      <Header onReplay={handleReplay} />
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
