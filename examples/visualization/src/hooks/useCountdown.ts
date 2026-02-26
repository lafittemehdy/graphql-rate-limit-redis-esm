/**
 * Countdown timer hook for the rate-limit window reset.
 *
 * Ticks at 250ms intervals and returns the remaining seconds
 * and progress percentage. Fires `onExpire` when the window ends.
 *
 * @module hooks/useCountdown
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface CountdownState {
  isActive: boolean;
  progress: number;
  secondsRemaining: number;
}

/**
 * Tracks a countdown from `windowEnd` with `durationMs` total length.
 * Calls `onExpire` when the window expires.
 */
export function useCountdown(
  windowEnd: number,
  windowStarted: boolean,
  durationMs: number,
  onExpire: () => void,
): CountdownState {
  const [state, setState] = useState<CountdownState>({
    isActive: false,
    progress: 0,
    secondsRemaining: 0,
  });

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const tick = useCallback(() => {
    if (!windowStarted || windowEnd <= 0) {
      setState({ isActive: false, progress: 0, secondsRemaining: 0 });
      return false;
    }

    const remaining = Math.max(0, windowEnd - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const progress = durationMs > 0 ? remaining / durationMs : 0;

    if (remaining <= 0) {
      setState({ isActive: false, progress: 0, secondsRemaining: 0 });
      onExpireRef.current();
      return false;
    }

    setState({ isActive: true, progress, secondsRemaining: seconds });
    return true;
  }, [durationMs, windowEnd, windowStarted]);

  useEffect(() => {
    if (!windowStarted || windowEnd <= 0) {
      setState({ isActive: false, progress: 0, secondsRemaining: 0 });
      return;
    }

    /* Initial tick */
    const shouldContinue = tick();
    if (!shouldContinue) return;

    const interval = setInterval(() => {
      const cont = tick();
      if (!cont) clearInterval(interval);
    }, 250);

    return () => clearInterval(interval);
  }, [tick, windowEnd, windowStarted]);

  return state;
}
