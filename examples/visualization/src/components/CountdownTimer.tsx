/**
 * Countdown timer showing the rate-limit window reset progress.
 *
 * @module CountdownTimer
 */

interface CountdownTimerProps {
  isActive: boolean;
  progress: number;
  secondsRemaining: number;
}

/** Progress bar + seconds display for the sliding window countdown. */
export function CountdownTimer({ isActive, progress, secondsRemaining }: CountdownTimerProps) {
  return (
    <div className={`countdown-container${isActive ? "" : " hidden"}`}>
      <div
        aria-label={`Window reset progress: ${Math.round(progress * 100)}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress * 100)}
        className="countdown-bar-track"
        role="progressbar"
      >
        <div className="countdown-bar" style={{ width: `${progress * 100}%` }} />
      </div>
      <div aria-live="polite" className="countdown-text" role="timer">
        Window resets in <span>{secondsRemaining}</span>s
      </div>
    </div>
  );
}
