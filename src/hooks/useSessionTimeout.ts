import { useEffect, useRef } from 'react';

interface UseSessionTimeoutOptions {
  /** Idle time (ms) before the session is force-logged-out. */
  timeoutMs: number;
  /** Time (ms) before timeout at which onWarning fires, e.g. to show a toast. Optional. */
  warningMs?: number;
  /** Whether the timer should be running at all (e.g. only while a user is logged in). */
  enabled: boolean;
  onTimeout: () => void;
  onWarning?: (msRemaining: number) => void;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown',
  'mousemove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
];

/**
 * Tracks user activity (mouse, keyboard, touch, scroll) and calls
 * `onTimeout` once `timeoutMs` has elapsed with no activity. Resets
 * automatically on any activity. Used to enforce a security session
 * timeout that logs the user out of the till/dispensary automatically.
 */
export function useSessionTimeout({
  timeoutMs,
  warningMs,
  enabled,
  onTimeout,
  onWarning,
}: UseSessionTimeoutOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      return;
    }

    const clearTimers = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };

    const resetTimer = () => {
      clearTimers();
      warnedRef.current = false;

      if (warningMs && warningMs < timeoutMs && onWarning) {
        warningRef.current = setTimeout(() => {
          warnedRef.current = true;
          onWarning(timeoutMs - warningMs);
        }, timeoutMs - warningMs);
      }

      timeoutRef.current = setTimeout(() => {
        onTimeout();
      }, timeoutMs);
    };

    resetTimer();

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    document.addEventListener('visibilitychange', resetTimer);

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
      document.removeEventListener('visibilitychange', resetTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeoutMs, warningMs]);
}
