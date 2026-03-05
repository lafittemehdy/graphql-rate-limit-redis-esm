/**
 * Mini Redis state visualization showing key, consumption, TTL, and connection status.
 *
 * @module RedisState
 */

interface RedisStateProps {
  consumed: number;
  duration: number;
  generatedKey: string;
  limit: number;
  redisDown: boolean;
  windowEnd: number;
  windowStarted: boolean;
}

/** Redis state mini-display with connection status. */
export function RedisState({
  consumed,
  duration,
  generatedKey,
  limit,
  redisDown,
  windowEnd,
  windowStarted,
}: RedisStateProps) {
  const ttl = windowStarted ? Math.max(0, Math.ceil((windowEnd - Date.now()) / 1000)) : duration;

  return (
    <div className="redis-state">
      <div className="panel-subheader">Redis State</div>

      {redisDown ? (
        <div className="redis-offline">Connection refused</div>
      ) : (
        <>
          <div className="redis-row">
            <span className="redis-key">{generatedKey}</span>
            <span className="redis-value">
              {consumed} / {limit}
            </span>
          </div>
          <div className="redis-row">
            <span className="redis-key">TTL</span>
            <span className="redis-value">{ttl}s</span>
          </div>
        </>
      )}

      <output aria-live="polite" className="redis-status">
        <span
          aria-hidden="true"
          className={`status-dot ${redisDown ? "status-error" : "status-ok"}`}
        />
        <span className="redis-status-text">{redisDown ? "Disconnected" : "Connected"}</span>
      </output>
    </div>
  );
}
