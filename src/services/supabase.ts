import { createClient, SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { CanonicalUserRole, CanonicalUserStatus, normalizeRole, normalizeStatus, User } from '../types';

// Strict environment variable configuration (Phase 29)
const envUrl = (import.meta.env.VITE_SUPABASE_URL || '') as string;
const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '') as string;

const STORAGE_URL_KEY = 'pharmapos_supabase_url_override';
const STORAGE_ANON_KEY = 'pharmapos_supabase_anon_key_override';

let supabaseInstance: SupabaseClient | null = null;

export const supabaseConfig = {
  getUrl(): string {
    const override = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_URL_KEY) : null;
    return envUrl || override || '';
  },
  getAnonKey(): string {
    const override = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_ANON_KEY) : null;
    return envAnonKey || override || '';
  },
  setCredentials(url: string, anonKey: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_URL_KEY, url.trim());
      localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
    }
    supabaseInstance = null;
  },
  clearCredentials(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_URL_KEY);
      localStorage.removeItem(STORAGE_ANON_KEY);
    }
    supabaseInstance = null;
  },
  isConfigured(): boolean {
    const url = this.getUrl();
    const key = this.getAnonKey();
    return Boolean(url && key && url.startsWith('https://'));
  },
};

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfig.isConfigured()) {
    return null;
  }
  if (!supabaseInstance) {
    const url = supabaseConfig.getUrl();
    const anonKey = supabaseConfig.getAnonKey();
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseInstance;
}

export const supabase = getSupabase();

/**
 * Maps a Supabase Auth user + public.profiles row to our strongly-typed User model
 */
export function mapProfileToUser(authUserData: SupabaseAuthUser, profileData?: any): User {
  const email = profileData?.email || authUserData.email || '';
  const canonicalRole: CanonicalUserRole = normalizeRole(profileData?.role);
  const canonicalStatus: CanonicalUserStatus = normalizeStatus(profileData?.status);

  return {
    id: authUserData.id,
    username: email.split('@')[0] || 'user',
    email,
    name: profileData?.full_name || authUserData.user_metadata?.full_name || email.split('@')[0] || 'User',
    role: canonicalRole === 'ADMIN' ? 'admin' : canonicalRole === 'CLINICIAN' ? 'clinician' : 'cashier',
    canonicalRole,
    status: canonicalStatus === 'ACTIVE' ? 'active' : 'inactive',
    canonicalStatus,
    createdAt: profileData?.created_at || authUserData.created_at || new Date().toISOString(),
    lastLogin: profileData?.last_login_at || new Date().toISOString(),
    phone: profileData?.phone,
    licenseNumber: profileData?.license_number,
    avatarColor: profileData?.avatar_color || (canonicalRole === 'ADMIN' ? 'bg-teal-700' : canonicalRole === 'CLINICIAN' ? 'bg-blue-600' : 'bg-emerald-600'),
  };
}

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  const client = getSupabase();
  if (!client) {
    return {
      ok: false,
      message: 'Supabase credentials are not configured. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.',
    };
  }

  try {
    const { error } = await client.from('medications').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        return {
          ok: false,
          message: 'Connected to Supabase, but the production schema has not been applied yet. Run supabase/schema.sql in the Supabase SQL Editor.',
        };
      }
      return {
        ok: false,
        message: `Database query check: ${error.message} (${error.code || 'UNKNOWN'})`,
      };
    }
    return {
      ok: true,
      message: 'Successfully connected to Supabase PostgreSQL database!',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Connection failed: ${message}`,
    };
  }
}

// ------------------------------------------------------------------
// Realtime sync (Phase 26)
// ------------------------------------------------------------------
export type RealtimeTable = 
  | 'medications' 
  | 'inventory_batches' 
  | 'prescriptions' 
  | 'prescription_items' 
  | 'test_orders' 
  | 'categories' 
  | 'sales';

let activeChannel: ReturnType<SupabaseClient['channel']> | null = null;

export function subscribeToRealtimeChanges(
  tables: RealtimeTable[],
  onChange: (table: RealtimeTable) => void
): () => void {
  const client = getSupabase();
  if (!client) {
    return () => {};
  }

  if (activeChannel) {
    try {
      client.removeChannel(activeChannel);
    } catch (e) {
      console.warn('Channel removal notice', e);
    }
    activeChannel = null;
  }

  const channelName = `pharmapos-sync-${Date.now()}`;
  let channel = client.channel(channelName);
  for (const table of tables) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => {
        onChange(table);
      }
    );
  }

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // Realtime channel established
    }
  });

  activeChannel = channel;

  return () => {
    if (activeChannel) {
      try {
        client.removeChannel(activeChannel);
      } catch (e) {
        // channel teardown
      }
      activeChannel = null;
    }
  };
}
