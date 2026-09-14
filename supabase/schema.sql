-- ==========================================================
-- PHARMACY POS DATABASE SCHEMA FOR SUPABASE
-- Run this in your Supabase Project -> SQL Editor -> New Query
-- ==========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS TABLE
--
-- IMPORTANT: passwords are NOT stored here. Authentication is handled by
-- Supabase Auth (auth.users); this table only holds each authenticated
-- account's profile/role, keyed by that same auth user id. See
-- signInWithSupabase / signUpInitialAdmin in src/services/supabase.ts.
CREATE TABLE IF NOT EXISTS public.pharmacy_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'clinician', 'cashier')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    email TEXT,
    phone TEXT,
    license_number TEXT,
    avatar_color TEXT DEFAULT 'bg-teal-700',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration note for an EXISTING deployment created from an older version
-- of this script (TEXT id + password_hash column): run this block once,
-- by hand, after backing up the table - it is NOT executed automatically.
--   ALTER TABLE public.pharmacy_users ALTER COLUMN password_hash DROP NOT NULL;
--   -- then migrate each user into Supabase Auth and update `id` to match
--   -- the resulting auth.users id before dropping password_hash entirely.

-- Helper used by RLS policies below to check whether the calling user is
-- an active admin, without causing the policy to recursively query the
-- same table under RLS (SECURITY DEFINER bypasses RLS for this lookup only).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pharmacy_users
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  );
$$;

-- 3. MEDICATIONS CATALOG & INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.medications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    generic_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    form TEXT NOT NULL,
    category TEXT NOT NULL,
    is_prescription_required BOOLEAN DEFAULT FALSE,
    barcode TEXT UNIQUE NOT NULL,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 10,
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    manufacturer TEXT NOT NULL,
    requires_refrigeration BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for instant barcode & name lookups in POS
CREATE INDEX IF NOT EXISTS idx_medications_barcode ON public.medications(barcode);
CREATE INDEX IF NOT EXISTS idx_medications_name ON public.medications(name);
CREATE INDEX IF NOT EXISTS idx_medications_category ON public.medications(category);
CREATE INDEX IF NOT EXISTS idx_medications_stock ON public.medications(stock);

-- Atomic stock deduction. The current POS flow (src/App.tsx
-- handleCompleteSale) still deducts stock client-side and upserts the
-- resulting absolute number, which is a race condition if two devices
-- sell the last units of the same medication at the same moment. This
-- function is available for that flow to be migrated onto: it deducts
-- and checks the floor in a single atomic statement.
CREATE OR REPLACE FUNCTION public.decrement_medication_stock(p_id TEXT, p_qty INTEGER)
RETURNS public.medications
LANGUAGE plpgsql
AS $$
DECLARE
  updated_row public.medications;
BEGIN
  UPDATE public.medications
  SET stock = stock - p_qty, updated_at = NOW()
  WHERE id = p_id AND stock >= p_qty
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK';
  END IF;

  RETURN updated_row;
END;
$$;

-- 4. PRESCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id TEXT PRIMARY KEY,
    rx_number TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    patient_name TEXT NOT NULL,
    patient_dob DATE NOT NULL,
    patient_phone TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_license TEXT NOT NULL,
    doctor_clinic TEXT NOT NULL,
    medication_id TEXT REFERENCES public.medications(id) ON DELETE SET NULL,
    medication_name TEXT NOT NULL,
    dosage_instructions TEXT NOT NULL,
    quantity_prescribed INTEGER NOT NULL,
    quantity_dispensed_so_far INTEGER DEFAULT 0,
    refills_allowed INTEGER DEFAULT 0,
    refills_remaining INTEGER DEFAULT 0,
    date_issued DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Issued', 'Active', 'Partially Dispensed', 'Dispensed', 'Cancelled', 'Expired')),
    insurance_provider TEXT,
    insurance_co_pay_rate NUMERIC(5, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_rx_number ON public.prescriptions(rx_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_barcode ON public.prescriptions(barcode);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON public.prescriptions(patient_name);

-- 4B. CLINICAL TESTS TABLE (ordered & recorded by clinicians via TestsManager)
CREATE TABLE IF NOT EXISTS public.tests (
    id TEXT PRIMARY KEY,
    test_number TEXT UNIQUE NOT NULL,
    patient_name TEXT NOT NULL,
    patient_dob DATE,
    patient_phone TEXT,
    clinician_name TEXT NOT NULL,
    clinician_license TEXT,
    test_type TEXT NOT NULL,
    notes TEXT,
    date_ordered DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Ordered' CHECK (status IN ('Ordered', 'In Progress', 'Completed', 'Cancelled')),
    result_summary TEXT,
    result_date DATE,
    linked_prescription_id TEXT REFERENCES public.prescriptions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tests_test_number ON public.tests(test_number);
CREATE INDEX IF NOT EXISTS idx_tests_patient ON public.tests(patient_name);
CREATE INDEX IF NOT EXISTS idx_tests_status ON public.tests(status);

-- 4C. PATIENTS, CONSULTATIONS & CLINICAL TESTS (backs ClinicalWorkflowView)
--
-- ClinicalWorkflowView.tsx is a patient-centric clinical workflow that is
-- NOT currently wired into app navigation (see project notes) and models
-- "a test" differently from the table above (category + Pending/In
-- Progress/... status vs test_type + Ordered/...), so it gets its own
-- clinical_tests table rather than sharing `tests`.
CREATE TABLE IF NOT EXISTS public.patients (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    dob DATE NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    allergies TEXT[] DEFAULT '{}',
    insurance_provider TEXT,
    insurance_policy_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_full_name ON public.patients(full_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients(phone);

CREATE TABLE IF NOT EXISTS public.consultations (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES public.patients(id) ON DELETE SET NULL,
    patient_name TEXT NOT NULL,
    clinician_id UUID REFERENCES public.pharmacy_users(id) ON DELETE SET NULL,
    clinician_name TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    symptoms TEXT NOT NULL,
    diagnosis TEXT NOT NULL,
    notes TEXT,
    vitals JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultations_patient ON public.consultations(patient_id);

CREATE TABLE IF NOT EXISTS public.clinical_tests (
    id TEXT PRIMARY KEY,
    consultation_id TEXT REFERENCES public.consultations(id) ON DELETE SET NULL,
    patient_id TEXT REFERENCES public.patients(id) ON DELETE SET NULL,
    patient_name TEXT,
    test_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Hematology', 'Biochemistry', 'Microbiology', 'Rapid Diagnostic', 'Urinalysis', 'Other')),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
    results TEXT,
    reference_ranges TEXT,
    notes TEXT,
    requested_by TEXT NOT NULL,
    conducted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_tests_patient ON public.clinical_tests(patient_id);

-- 5. SALE TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.sale_transactions (
    id TEXT PRIMARY KEY,
    receipt_number TEXT UNIQUE NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cashier_name TEXT NOT NULL,
    cashier_role TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL,
    amount_tendered NUMERIC(12, 2),
    change_due NUMERIC(12, 2),
    cash_amount NUMERIC(12, 2),
    mpesa_amount NUMERIC(12, 2),
    mpesa_reference TEXT,
    mpesa_phone TEXT,
    patient_name TEXT,
    card_auth_code TEXT,
    insurance_provider TEXT,
    insurance_policy_number TEXT,
    insurance_auth_code TEXT,
    is_offline BOOLEAN DEFAULT FALSE,
    synced BOOLEAN DEFAULT TRUE,
    sync_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_transactions_receipt ON public.sale_transactions(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sale_transactions_timestamp ON public.sale_transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_sale_transactions_payment ON public.sale_transactions(payment_method);

-- 6. SYSTEM AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('AUTH', 'USERS', 'INVENTORY', 'SALES', 'SETTINGS', 'SYSTEM', 'CLINICAL')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON public.audit_logs(category);

-- 7. PHARMACY & RECEIPT SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.receipt_settings (
    id TEXT PRIMARY KEY DEFAULT 'default_settings',
    pharmacy_name TEXT NOT NULL,
    tagline TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    phone TEXT,
    email TEXT,
    license_number TEXT,
    tax_id TEXT,
    tax_rate NUMERIC(5, 4) DEFAULT 0.16,
    paper_width TEXT DEFAULT '80mm',
    header_message TEXT,
    footer_message TEXT,
    return_policy TEXT,
    emergency_phone TEXT,
    show_generic_name BOOLEAN DEFAULT TRUE,
    show_batch_and_expiry BOOLEAN DEFAULT TRUE,
    show_prescription_details BOOLEAN DEFAULT TRUE,
    show_pharmacist_name BOOLEAN DEFAULT TRUE,
    show_barcode BOOLEAN DEFAULT TRUE,
    show_tax_breakdown BOOLEAN DEFAULT TRUE,
    currency_symbol TEXT DEFAULT 'KSh',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.pharmacy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_settings ENABLE ROW LEVEL SECURITY;

-- pharmacy_users: staff records include phone numbers, license numbers and
-- roles - the anon key (shipped inside the public client bundle) must NOT
-- be able to read or rewrite this table freely, and only an admin may
-- create/modify/deactivate accounts. The one exception is account
-- creation while the table is empty, which is how the very first
-- administrator account gets provisioned (see signUpInitialAdmin).
CREATE POLICY "Users can read own profile, admins read all" ON public.pharmacy_users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Bootstrap first admin or existing admin creates users" ON public.pharmacy_users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR (SELECT COUNT(*) FROM public.pharmacy_users) = 0
  );

CREATE POLICY "Admins update users, users update own last_login" ON public.pharmacy_users
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR id = auth.uid())
  WITH CHECK (public.is_admin() OR id = auth.uid());

CREATE POLICY "Admins delete users" ON public.pharmacy_users
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Operational data: the app currently reads/writes these as the anon
-- client both before and after sign-in (see project notes on the
-- localStorage-first data layer), so access stays anon-scoped for now.
-- This is broader than ideal (see final report) but matches how the
-- rest of the app actually talks to Supabase today; narrowing it further
-- requires first moving those read/write paths onto an authenticated
-- client, which is a larger follow-up.
CREATE POLICY "Allow anon read medications" ON public.medications FOR SELECT USING (true);
CREATE POLICY "Allow anon update medications" ON public.medications FOR ALL USING (true);

CREATE POLICY "Allow anon read prescriptions" ON public.prescriptions FOR SELECT USING (true);
CREATE POLICY "Allow anon modify prescriptions" ON public.prescriptions FOR ALL USING (true);

CREATE POLICY "Allow anon read tests" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Allow anon modify tests" ON public.tests FOR ALL USING (true);

CREATE POLICY "Allow anon read sales" ON public.sale_transactions FOR SELECT USING (true);
CREATE POLICY "Allow anon insert sales" ON public.sale_transactions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon read audit logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow anon insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon read settings" ON public.receipt_settings FOR SELECT USING (true);
CREATE POLICY "Allow anon update settings" ON public.receipt_settings FOR ALL USING (true);

-- Clinical data (patients/consultations/clinical_tests): this feature is
-- not yet reachable from the UI, so it's locked to authenticated staff
-- only rather than inheriting the broad anon policy above.
CREATE POLICY "Authenticated read patients" ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated modify patients" ON public.patients FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read consultations" ON public.consultations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert consultations" ON public.consultations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read clinical_tests" ON public.clinical_tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated modify clinical_tests" ON public.clinical_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8B. REALTIME: publish medications, prescriptions & tests so connected
-- clients (admin / clinician / cashier, on any device) get live updates.
-- Safe to re-run; skips tables already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'medications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.medications;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'prescriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prescriptions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tests;
  END IF;
END $$;

-- 9. INITIAL SEED DATA (DEFAULT SETTINGS)
INSERT INTO public.receipt_settings (
    id,
    pharmacy_name,
    tagline,
    address_line1,
    address_line2,
    phone,
    email,
    license_number,
    tax_id,
    tax_rate,
    currency_symbol
) VALUES (
    'default_settings',
    'Apothecary & Health Pharmacy',
    'Care You Can Trust, Everyday',
    'Kimathi Street, City Centre',
    'P.O. Box 48291-00100, Nairobi',
    '+254 700 123 456',
    'dispensary@apothecary.co.ke',
    'PPB-RET-2024-8819',
    'P051234567Z',
    0.16,
    'KSh'
) ON CONFLICT (id) DO NOTHING;

