import { useEffect, useRef } from 'react';

// Phase 6: Exact 30-minute inactivity timeout
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
export const INACTIVITY_WARNING_MS = 2 * 60 * 1000; // 2 minutes before timeout warning

const STORAGE_LAST_ACTIVE_KEY = 'pharmapos_last_active_timestamp';
const AUTH_BROADCAST_CHANNEL = 'pharmapos_auth_broadcast';

interface UseSessionTimeoutOptions {
  enabled: boolean;
  onTimeout: (reason?: string) => void;
  onWarning?: (msRemaining: number) => void;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'pointerdown',
];

export function useSessionTimeout({
  enabled,
  onTimeout,
  onWarning,
}: UseSessionTimeoutOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      return;
    }

    // Initialize BroadcastChannel for cross-tab synchronization
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
        bc.onmessage = (event) => {
          if (event.data?.type === 'INACTIVITY_LOGOUT') {
            onTimeout('Session expired due to 30 minutes of inactivity. Please sign in again.');
          } else if (event.data?.type === 'USER_LOGOUT') {
            onTimeout();
          } else if (event.data?.type === 'USER_ACTIVITY') {
            // Activity in another tab updates timer
            recordActivity(false);
          }
        };
        broadcastChannelRef.current = bc;
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported in this environment', e);
    }

    const clearTimers = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };

    const triggerTimeout = () => {
      clearTimers();
      // Broadcast to other tabs
      try {
        broadcastChannelRef.current?.postMessage({ type: 'INACTIVITY_LOGOUT' });
      } catch (e) {
        // ignore broadcast failure
      }
      onTimeout('Session expired due to 30 minutes of inactivity. Please sign in again.');
    };

    const recordActivity = (broadcast = true) => {
      const now = Date.now();
      try {
        localStorage.setItem(STORAGE_LAST_ACTIVE_KEY, now.toString());
      } catch {
        // ignore
      }

      if (broadcast) {
        try {
          broadcastChannelRef.current?.postMessage({ type: 'USER_ACTIVITY', timestamp: now });
        } catch {
          // ignore
        }
      }

      clearTimers();

      // Warning timer (at 28 minutes)
      const warningDelay = INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS;
      warningRef.current = setTimeout(() => {
        if (onWarning) {
          onWarning(INACTIVITY_WARNING_MS);
        }
      }, warningDelay);

      // Force timeout timer (at 30 minutes)
      timeoutRef.current = setTimeout(() => {
        triggerTimeout();
      }, INACTIVITY_TIMEOUT_MS);
    };

    // Cross-tab storage listener as fallback
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_LAST_ACTIVE_KEY && e.newValue) {
        recordActivity(false);
      }
    };
    window.addEventListener('storage', handleStorage);

    // Periodic safety check every 15 seconds to handle sleeping tabs/devices
    checkIntervalRef.current = setInterval(() => {
      try {
        const lastActiveStr = localStorage.getItem(STORAGE_LAST_ACTIVE_KEY);
        if (lastActiveStr) {
          const lastActive = parseInt(lastActiveStr, 10);
          if (!isNaN(lastActive) && Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS) {
            triggerTimeout();
          }
        }
      } catch {
        // ignore
      }
    }, 15000);

    // Initial activity mark
    recordActivity(false);

    // Listen to real activity events
    const onUserInteraction = () => recordActivity(true);
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onUserInteraction, { passive: true }));

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const lastActiveStr = localStorage.getItem(STORAGE_LAST_ACTIVE_KEY);
        if (lastActiveStr) {
          const lastActive = parseInt(lastActiveStr, 10);
          if (!isNaN(lastActive) && Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS) {
            triggerTimeout();
            return;
          }
        }
        recordActivity(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimers();
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      window.removeEventListener('storage', handleStorage);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onUserInteraction));
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, onTimeout, onWarning]);
}

/**
 * Broadcast explicit user manual logout to all tabs
 */
export function broadcastLogout() {
  try {
    const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    bc.postMessage({ type: 'USER_LOGOUT' });
    bc.close();
  } catch {
    // ignore
  }
}
