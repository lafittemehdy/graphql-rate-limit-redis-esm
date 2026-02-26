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
      <div className="countdown-bar-track">
        <div className="countdown-bar" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="countdown-text">
        Window resets in <span>{secondsRemaining}</span>s
      </div>
    </div>
  );
}
