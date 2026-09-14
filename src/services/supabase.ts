import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ClinicalTest, Consultation, Patient, Prescription, User, UserRole } from '../types';

// Environment variable extraction supporting Vite client and runtime injection
const envUrl = (import.meta.env.VITE_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '') ||
  '') as string;

const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : '') ||
  '') as string;

let supabaseInstance: SupabaseClient | null = null;

export const supabaseConfig = {
  getUrl(): string {
    return envUrl || localStorage.getItem('pharmapos_supabase_url') || '';
  },
  getAnonKey(): string {
    return envAnonKey || localStorage.getItem('pharmapos_supabase_anon_key') || '';
  },
  isConfigured(): boolean {
    const url = this.getUrl();
    const key = this.getAnonKey();
    return Boolean(url && key && url.startsWith('https://'));
  },
  setCredentials(url: string, anonKey: string) {
    if (url) localStorage.setItem('pharmapos_supabase_url', url.trim());
    if (anonKey) localStorage.setItem('pharmapos_supabase_anon_key', anonKey.trim());
    supabaseInstance = null; // reset client to re-instantiate
  },
  clearCredentials() {
    localStorage.removeItem('pharmapos_supabase_url');
    localStorage.removeItem('pharmapos_supabase_anon_key');
    supabaseInstance = null;
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
      },
    });
  }
  return supabaseInstance;
}

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  const client = getSupabase();
  if (!client) {
    return {
      ok: false,
      message: 'Supabase credentials are not configured yet. Please provide SUPABASE_URL and SUPABASE_ANON_KEY.',
    };
  }

  try {
    const { error } = await client.from('medications').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        return {
          ok: false,
          message: 'Connected to Supabase, but the tables have not been created yet. Please execute supabase/schema.sql in the SQL Editor.',
        };
      }
      return {
        ok: false,
        message: `Supabase query error: ${error.message} (${error.code || 'UNKNOWN'})`,
      };
    }
    return {
      ok: true,
      message: 'Successfully connected to Supabase database!',
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
// Realtime sync
// ------------------------------------------------------------------
// Tables that other clients (admin/clinician/cashier on other devices)
// can change and that should trigger a live refresh in this session.
export type RealtimeTable = 'medications' | 'prescriptions' | 'tests' | 'sale_transactions';

let activeChannel: ReturnType<SupabaseClient['channel']> | null = null;

/**
 * Subscribes to Postgres change events (INSERT/UPDATE/DELETE) on the given
 * tables via a single Supabase Realtime channel, invoking `onChange` with
 * the affected table name whenever a change arrives. Returns an unsubscribe
 * function. Safe to call even when Supabase isn't configured (no-ops).
 */
export function subscribeToRealtimeChanges(
  tables: RealtimeTable[],
  onChange: (table: RealtimeTable) => void
): () => void {
  const client = getSupabase();
  if (!client) {
    return () => {};
  }

  // Tear down any previous channel before creating a new one
  if (activeChannel) {
    client.removeChannel(activeChannel);
    activeChannel = null;
  }

  let channel = client.channel('pharmapos-realtime-sync');
  for (const table of tables) {
    channel = channel.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table },
      () => onChange(table)
    );
  }
  channel.subscribe();
  activeChannel = channel;

  return () => {
    if (activeChannel) {
      client.removeChannel(activeChannel);
      activeChannel = null;
    }
  };
}

// ------------------------------------------------------------------
// Authentication (real Supabase Auth - NOT a local/demo mechanism)
// ------------------------------------------------------------------
// Credentials are verified server-side by Supabase Auth (GoTrue). The
// `pharmacy_users` table only holds the profile/role for an already
// -authenticated account; it never stores or checks a password.

interface AuthResult {
  ok: boolean;
  user?: User;
  error?: string;
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email || undefined,
    name: row.name,
    role: row.role as UserRole,
    status: row.status,
    createdAt: row.created_at,
    lastLogin: row.last_login || undefined,
    phone: row.phone || undefined,
    licenseNumber: row.license_number || undefined,
    avatarColor: row.avatar_color || 'bg-teal-700',
  };
}

/**
 * Returns true when Supabase is configured and no administrator account
 * exists yet, meaning the app should show the first-run "create
 * administrator" bootstrap form instead of the normal sign-in form.
 */
export async function checkBootstrapAvailable(): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  try {
    const { count, error } = await client
      .from('pharmacy_users')
      .select('id', { count: 'exact', head: true });
    if (error) return false;
    return (count || 0) === 0;
  } catch {
    return false;
  }
}

/**
 * Signs in with Supabase Auth. `identifier` may be an email address or a
 * username; usernames are resolved to an email via the pharmacy_users
 * table before authenticating. Returns a generic error message on any
 * failure so the sign-in form never reveals whether a username exists.
 */
export async function signInWithSupabase(identifier: string, password: string): Promise<AuthResult> {
  const client = getSupabase();
  if (!client) {
    return { ok: false, error: 'Supabase is not configured yet. Please configure database credentials in Settings.' };
  }

  const GENERIC_ERROR = 'Invalid credentials or user not authorized.';
  let email = identifier.trim();

  if (!email.includes('@')) {
    const { data: profileByUsername } = await client
      .from('pharmacy_users')
      .select('email')
      .ilike('username', identifier.trim())
      .maybeSingle();
    if (!profileByUsername?.email) {
      return { ok: false, error: GENERIC_ERROR };
    }
    email = profileByUsername.email;
  }

  const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError || !authData?.user) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const { data: profile, error: profileError } = await client
    .from('pharmacy_users')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await client.auth.signOut();
    return { ok: false, error: 'Account not fully set up. Please contact your administrator.' };
  }

  if (profile.status === 'inactive') {
    await client.auth.signOut();
    return { ok: false, error: 'This account has been deactivated. Please contact an Administrator.' };
  }

  // Best-effort last-login stamp; failure here shouldn't block sign-in.
  client
    .from('pharmacy_users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', authData.user.id)
    .then(() => {});

  return { ok: true, user: rowToUser({ ...profile, last_login: new Date().toISOString() }) };
}

/**
 * Creates the first Administrator account for a brand-new pharmacy
 * instance. Only succeeds when no pharmacy_users rows exist yet (checked
 * here and enforced again by the database RLS policy).
 */
export async function signUpInitialAdmin(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  license?: string;
}): Promise<AuthResult> {
  const client = getSupabase();
  if (!client) {
    return { ok: false, error: 'Supabase is not configured yet. Please configure database credentials in Settings.' };
  }

  const bootstrapAvailable = await checkBootstrapAvailable();
  if (!bootstrapAvailable) {
    return { ok: false, error: 'An administrator account already exists. Please sign in instead.' };
  }

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email: data.email.trim(),
    password: data.password,
  });

  if (signUpError || !signUpData?.user) {
    return { ok: false, error: signUpError?.message || 'Failed to create the administrator account.' };
  }

  const username = data.email.trim().split('@')[0].toLowerCase();
  const profileRow = {
    id: signUpData.user.id,
    username,
    name: data.name.trim(),
    role: 'admin' as UserRole,
    status: 'active' as const,
    email: data.email.trim(),
    phone: data.phone?.trim() || null,
    license_number: data.license?.trim() || null,
    avatar_color: 'bg-teal-700',
    last_login: new Date().toISOString(),
  };

  const { error: insertError } = await client.from('pharmacy_users').insert(profileRow);
  if (insertError) {
    return { ok: false, error: `Account created but profile setup failed: ${insertError.message}` };
  }

  // If email confirmation is required by the Supabase project's auth
  // settings, `signUp` won't return an active session yet.
  if (!signUpData.session) {
    return {
      ok: false,
      error:
        'Administrator account created. Please check your email to confirm your address, then sign in (or disable email confirmations in Supabase Auth settings for instant setup).',
    };
  }

  return { ok: true, user: rowToUser(profileRow) };
}

export async function signOutSupabase(): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  await client.auth.signOut();
}

// ------------------------------------------------------------------
// Admin user management (routes through the admin-manage-user Edge
// Function - see supabase/functions/admin-manage-user/index.ts - so the
// service-role key never reaches the browser). UserManagementView.tsx
// still manages users locally today; wiring it to these helpers is the
// next step, not yet done in this pass.
// ------------------------------------------------------------------

async function callAdminManageUser(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const client = getSupabase();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };
  const { data, error } = await client.functions.invoke('admin-manage-user', { body });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, userId: data?.userId };
}

export function adminCreateUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  license?: string;
}) {
  return callAdminManageUser({ action: 'create', ...input });
}

export function adminSetUserStatus(userId: string, status: 'active' | 'inactive') {
  return callAdminManageUser({ action: 'setStatus', userId, status });
}

export function adminResetPassword(userId: string, newPassword: string) {
  return callAdminManageUser({ action: 'resetPassword', userId, newPassword });
}

export function adminDeleteUser(userId: string) {
  return callAdminManageUser({ action: 'delete', userId });
}

/** Full staff roster from Supabase - the authoritative list once configured. */
export async function fetchAllUsersFromSupabase(): Promise<User[] | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.from('pharmacy_users').select('*').order('created_at', { ascending: true });
  if (error || !data) return null;
  return data.map(rowToUser);
}

/**
 * Updates a user's profile fields (name/email/phone/license/role/status).
 * Protected by RLS (admin-only writes, or a user updating their own row),
 * so this does not need the service-role Edge Function.
 */
export async function updateUserProfileInSupabase(
  userId: string,
  updates: Partial<{ name: string; email: string; phone: string; licenseNumber: string; role: UserRole; status: 'active' | 'inactive' }>
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabase();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.email !== undefined) row.email = updates.email;
  if (updates.phone !== undefined) row.phone = updates.phone;
  if (updates.licenseNumber !== undefined) row.license_number = updates.licenseNumber;
  if (updates.role !== undefined) row.role = updates.role;
  if (updates.status !== undefined) row.status = updates.status;
  const { error } = await client.from('pharmacy_users').update(row).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Lets the currently signed-in user change their own password. Verifies
 * the current password first (by re-authenticating with it) before
 * applying the new one via Supabase Auth - this is a real credential
 * change, not a local-storage field update.
 */
export async function changeOwnPassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabase();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const { error: verifyError } = await client.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) {
    return { ok: false, error: 'Current password entered is incorrect.' };
  }

  const { error: updateError } = await client.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { ok: false, error: updateError.message };
  }
  return { ok: true };
}

/**
 * Fetches the pharmacy_users profile for an already-authenticated Supabase
 * Auth user id. Returns null if no profile row exists or the account is
 * inactive (callers should treat both as "not signed in").
 */
export async function getUserProfile(authUserId: string): Promise<User | null> {
  const client = getSupabase();
  if (!client) return null;
  try {
    const { data, error } = await client.from('pharmacy_users').select('*').eq('id', authUserId).maybeSingle();
    if (error || !data || data.status === 'inactive') return null;
    return rowToUser(data);
  } catch (e) {
    console.error('Failed to load user profile', e);
    return null;
  }
}

/**
 * Subscribes to Supabase Auth session changes (sign-in, sign-out, token
 * refresh across tabs). Call once; returns an unsubscribe function.
 */
export function onAuthStateChange(callback: (userId: string | null) => void): () => void {
  const client = getSupabase();
  if (!client) return () => {};
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    callback(session?.user?.id || null);
  });
  return () => subscription.unsubscribe();
}

// ------------------------------------------------------------------
// Clinical workflow (patients / consultations / clinical tests)
// ------------------------------------------------------------------
// Backs the (currently unreleased - see project notes) ClinicalWorkflowView.
// Kept in its own `clinical_tests` table rather than reusing `tests`
// because the two features model "a test" differently (see schema.sql)
// and must not be conflated.

function patientToRow(p: Patient) {
  return {
    id: p.id,
    full_name: p.fullName,
    dob: p.dob,
    gender: p.gender,
    phone: p.phone,
    email: p.email || null,
    address: p.address || null,
    allergies: p.allergies || [],
    insurance_provider: p.insuranceProvider || null,
    insurance_policy_number: p.insurancePolicyNumber || null,
  };
}

export async function upsertPatientToSupabase(patient: Patient): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const { error } = await client.from('patients').upsert(patientToRow(patient));
  if (error) {
    console.error('Cloud sync failed (patient upsert)', error);
    return false;
  }
  return true;
}

export async function insertConsultationToSupabase(consultation: Consultation): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const { error } = await client.from('consultations').insert({
    id: consultation.id,
    patient_id: consultation.patientId,
    patient_name: consultation.patientName,
    clinician_id: consultation.clinicianId,
    clinician_name: consultation.clinicianName,
    date: consultation.date,
    symptoms: consultation.symptoms,
    diagnosis: consultation.diagnosis,
    notes: consultation.notes || null,
    vitals: consultation.vitals || {},
  });
  if (error) {
    console.error('Cloud sync failed (consultation insert)', error);
    return false;
  }
  return true;
}

export async function upsertClinicalTestToSupabase(test: ClinicalTest): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const { error } = await client.from('clinical_tests').upsert({
    id: test.id,
    consultation_id: test.consultationId || null,
    patient_id: test.patientId,
    patient_name: test.patientName || null,
    test_name: test.testName,
    category: test.category,
    status: test.status,
    results: test.results || null,
    reference_ranges: test.referenceRanges || null,
    notes: test.notes || null,
    requested_by: test.requestedBy,
    conducted_at: test.conductedAt || null,
  });
  if (error) {
    console.error('Cloud sync failed (clinical test upsert)', error);
    return false;
  }
  return true;
}

export async function upsertPrescriptionToSupabase(rx: Prescription): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const { error } = await client.from('prescriptions').upsert({
    id: rx.id,
    rx_number: rx.rxNumber,
    barcode: rx.barcode,
    patient_name: rx.patientName,
    patient_dob: rx.patientDOB,
    patient_phone: rx.patientPhone,
    doctor_name: rx.doctorName,
    doctor_license: rx.doctorLicense,
    doctor_clinic: rx.doctorClinic,
    medication_id: rx.medicationId || null,
    medication_name: rx.medicationName,
    dosage_instructions: rx.dosageInstructions || '',
    quantity_prescribed: rx.quantityPrescribed || 0,
    quantity_dispensed_so_far: rx.quantityDispensedSoFar || 0,
    refills_allowed: rx.refillsAllowed || 0,
    refills_remaining: rx.refillsRemaining || 0,
    date_issued: rx.dateIssued,
    expiry_date: rx.expiryDate,
    status: rx.status,
    insurance_provider: rx.insuranceProvider || null,
    insurance_co_pay_rate: rx.insuranceCoPayRate || 0,
  });
  if (error) {
    console.error('Cloud sync failed (prescription upsert)', error);
    return false;
  }
  return true;
}
