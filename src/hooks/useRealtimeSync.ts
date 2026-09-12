import { useEffect, useRef } from 'react';
import { RealtimeTable, subscribeToRealtimeChanges } from '../services/supabase';
import { supabaseConfig } from '../services/supabase';

interface UseRealtimeSyncOptions {
  enabled: boolean;
  onMedicationsChanged: () => void;
  onPrescriptionsChanged: () => void;
  onTestsChanged: () => void;
}

/**
 * Subscribes to Supabase Realtime changes for the tables other devices
 * (other cashiers, the clinician's tablet, the admin's laptop) can write
 * to, and triggers the given refresh callback so this session's data
 * stays live without a manual reload. No-ops when Supabase isn't
 * configured or `enabled` is false.
 */
export function useRealtimeSync({
  enabled,
  onMedicationsChanged,
  onPrescriptionsChanged,
  onTestsChanged,
}: UseRealtimeSyncOptions) {
  // Keep latest callbacks in refs so the subscription doesn't need to be
  // torn down and rebuilt every time a parent re-renders.
  const callbacksRef = useRef({ onMedicationsChanged, onPrescriptionsChanged, onTestsChanged });
  callbacksRef.current = { onMedicationsChanged, onPrescriptionsChanged, onTestsChanged };

  useEffect(() => {
    if (!enabled || !supabaseConfig.isConfigured()) return;

    const tables: RealtimeTable[] = ['medications', 'prescriptions', 'test_orders'];
    const unsubscribe = subscribeToRealtimeChanges(tables, (table) => {
      if (table === 'medications') callbacksRef.current.onMedicationsChanged();
      if (table === 'prescriptions') callbacksRef.current.onPrescriptionsChanged();
      if (table === 'test_orders') callbacksRef.current.onTestsChanged();
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
