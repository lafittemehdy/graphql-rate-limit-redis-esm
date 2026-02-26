/**
 * Central rate-limiter state hook.
 *
 * Replaces the mutable `state` object from the vanilla implementation.
 * Uses `useState` for values that trigger re-renders and `useRef` for
 * timing values read synchronously inside `simulateRequest`.
 *
 * @module hooks/useRateLimiter
 */

import { useCallback, useRef, useState } from "react";

import { generateKey, simulateRequest } from "../lib/simulation-engine";
import type { ErrorMode, Identity, RateLimitConfig, SimulationResult } from "../types/rate-limit";

const DEFAULT_CONFIG: RateLimitConfig = {
  duration: 60,
  identity: "user",
  limit: 5,
  serviceErrorMode: "failClosed",
};

/** Return type for the useRateLimiter hook. */
export interface RateLimiterAPI {
  clearLog: () => void;
  config: RateLimitConfig;
  consumed: number;
  generatedKey: string;
  highlightStep: (index: number) => void;
  redisDown: boolean;
  reset: () => void;
  sendQuery: () => SimulationResult | null;
  setConfig: (patch: Partial<RateLimitConfig>) => void;
  setDuration: (duration: number) => void;
  setIdentity: (identity: Identity) => void;
  setLimit: (limit: number) => void;
  setServiceErrorMode: (mode: ErrorMode) => void;
  toggleRedisDown: () => void;
  traceIndex: number;
  traceSteps: SimulationResult[];
  windowEnd: number;
  windowStarted: boolean;
}

/** Central state management hook for the rate-limit simulation. */
export function useRateLimiter(): RateLimiterAPI {
  const [config, setConfigState] = useState<RateLimitConfig>(DEFAULT_CONFIG);
  const [consumed, setConsumed] = useState(0);
  const [redisDown, setRedisDown] = useState(false);
  const [traceIndex, setTraceIndex] = useState(-1);
  const [traceSteps, setTraceSteps] = useState<SimulationResult[]>([]);
  const [windowEnd, setWindowEnd] = useState(0);
  const [windowStarted, setWindowStarted] = useState(false);

  /* Mutable refs for synchronous reads inside simulateRequest */
  const limiterRef = useRef({
    consumed: 0,
    redisDown: false,
    windowEnd: 0,
    windowStarted: false,
  });

  const configRef = useRef(config);
  const sendingRef = useRef(false);

  /* Keep refs in sync with state */
  configRef.current = config;

  const syncLimiterState = useCallback(() => {
    const l = limiterRef.current;
    setConsumed(l.consumed);
    setRedisDown(l.redisDown);
    setWindowEnd(l.windowEnd);
    setWindowStarted(l.windowStarted);
  }, []);

  const setConfig = useCallback((patch: Partial<RateLimitConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      configRef.current = next;
      return next;
    });
  }, []);

  const setDuration = useCallback((duration: number) => setConfig({ duration }), [setConfig]);

  const setIdentity = useCallback((identity: Identity) => setConfig({ identity }), [setConfig]);

  const setLimit = useCallback((limit: number) => setConfig({ limit }), [setConfig]);

  const setServiceErrorMode = useCallback(
    (serviceErrorMode: ErrorMode) => setConfig({ serviceErrorMode }),
    [setConfig],
  );

  const toggleRedisDown = useCallback(() => {
    limiterRef.current.redisDown = !limiterRef.current.redisDown;
    syncLimiterState();
  }, [syncLimiterState]);

  const clearLog = useCallback(() => {
    setTraceSteps([]);
    setTraceIndex(-1);
  }, []);

  const highlightStep = useCallback((index: number) => {
    setTraceSteps((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      setTraceIndex(index);
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    limiterRef.current = {
      consumed: 0,
      redisDown: false,
      windowEnd: 0,
      windowStarted: false,
    };
    syncLimiterState();
    clearLog();
  }, [clearLog, syncLimiterState]);

  const sendQuery = useCallback((): SimulationResult | null => {
    if (sendingRef.current) return null;
    sendingRef.current = true;

    const result = simulateRequest(configRef.current, limiterRef.current);
    syncLimiterState();

    setTraceSteps((prev) => {
      const next = [...prev, result];
      setTraceIndex(next.length - 1);
      return next;
    });

    setTimeout(() => {
      sendingRef.current = false;
    }, 50);

    return result;
  }, [syncLimiterState]);

  const generatedKey = generateKey(config.identity);

  return {
    clearLog,
    config,
    consumed,
    generatedKey,
    highlightStep,
    redisDown,
    reset,
    sendQuery,
    setConfig,
    setDuration,
    setIdentity,
    setLimit,
    setServiceErrorMode,
    toggleRedisDown,
    traceIndex,
    traceSteps,
    windowEnd,
    windowStarted,
  };
}
