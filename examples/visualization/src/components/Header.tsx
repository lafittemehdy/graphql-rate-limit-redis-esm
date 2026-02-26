/**
 * Header bar — title link, npm install snippet with copy button.
 *
 * Matches the pattern from graphql-query-complexity-esm's Header.
 *
 * @module Header
 */

import { useCallback, useState } from "react";

const INSTALL_CMD = "npm i graphql-rate-limit-redis-esm";

/** Compact header with title and install snippet. */
export function Header() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <a
          className="header-title"
          href="https://github.com/lafittemehdy/graphql-rate-limit-redis-esm"
          rel="noopener noreferrer"
          target="_blank"
        >
          graphql-rate-limit-redis-esm
        </a>

        <span className="header-install">
          <span>{INSTALL_CMD}</span>
          <button
            className="header-install-copy"
            onClick={handleCopy}
            title="Copy to clipboard"
            type="button"
          >
            {copied ? (
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="14"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="14"
              >
                <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </span>
      </div>
    </header>
  );
}
