/**
 * Shared utility constants and helpers for the rate-limit visualization.
 *
 * @module lib/utils
 */

import type { RequestStatus } from "../types/rate-limit";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration (ms) to show the "Copied!" feedback before resetting. */
export const COPY_FEEDBACK_MS = 1500;

// ---------------------------------------------------------------------------
// Status mappings
// ---------------------------------------------------------------------------

/** Maps a request status to its display icon character. */
export const STATUS_ICONS: Record<RequestStatus, string> = {
  allowed: "\u2713",
  bypassed: "\u21B7",
  rejected: "\u2717",
  "service-error": "\u26A0",
};

/** Maps a request status to its human-readable label. */
export const STATUS_LABELS: Record<RequestStatus, string> = {
  allowed: "200 OK",
  bypassed: "BYPASS",
  rejected: "429",
  "service-error": "503",
};

/** Maps a request status to its status indicator display. */
export const STATUS_INDICATOR: Record<RequestStatus, { cls: string; text: string }> = {
  allowed: { cls: "status-ok", text: "Accepting requests" },
  bypassed: { cls: "status-bypassed", text: "Bypassed (failOpen)" },
  rejected: { cls: "status-limited", text: "Rate limited" },
  "service-error": { cls: "status-error", text: "Service unavailable" },
};

/** Maps a request status to the console dot class. */
export const DOT_MAP: Record<RequestStatus, string> = {
  allowed: "active",
  bypassed: "active",
  rejected: "blocked",
  "service-error": "blocked",
};

/** Scenario keys in button display order (also keyboard shortcut 1–4 order). */
export const SCENARIO_KEYS = ["normal", "burst", "outage", "reset"] as const;

/** Scenario descriptions shown below the active button. */
export const SCENARIO_DESCRIPTIONS: Record<string, string> = {
  burst: "Rapid-fire requests that quickly exhaust the quota",
  normal: "Sends requests at a steady pace within the limit",
  outage: "Simulates Redis connection failure mid-stream",
  reset: "",
};

/** Scenario display labels. */
export const SCENARIO_LABELS: Record<string, string> = {
  burst: "Burst Attack",
  normal: "Normal Usage",
  outage: "Redis Outage",
  reset: "Reset",
};

/**
 * Returns true if the given element is an interactive text input.
 * Used to suppress keyboard shortcuts when the user is typing.
 */
export function isTextInputElement(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "SELECT" ||
    el.tagName === "TEXTAREA"
  );
}

/** Formats a timestamp as a locale time string (HH:MM:SS). */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

// ---------------------------------------------------------------------------
// Intro state persistence
// ---------------------------------------------------------------------------

const INTRO_DISABLED_KEY = "grl-intro-disabled";

/** Check whether the user has permanently disabled the intro prompt. */
export function isIntroDisabled(): boolean {
  try {
    return localStorage.getItem(INTRO_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Permanently disable the intro prompt on future reloads. */
export function disableIntro(): void {
  try {
    localStorage.setItem(INTRO_DISABLED_KEY, "1");
  } catch {
    // Ignore storage errors
  }
}
