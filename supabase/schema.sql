-- ==============================================================================
-- PRODUCTION SUPABASE DATABASE SCHEMA FOR PHARMACY + CLINIC PWA
-- Authoritative Source of Truth: PostgreSQL with Row Level Security (RLS)
-- Canonical Roles: ADMIN, CLINICIAN, CASHIER
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CANONICAL ENUMS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('ADMIN', 'CLINICIAN', 'CASHIER');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE public.user_status AS ENUM ('ACTIVE', 'INACTIVE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prescription_status') THEN
        CREATE TYPE public.prescription_status AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED', 'EXPIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'test_status') THEN
        CREATE TYPE public.test_status AS ENUM ('ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type') THEN
        CREATE TYPE public.movement_type AS ENUM ('RECEIPT', 'SALE', 'DISPENSE', 'ADJUSTMENT', 'RETURN', 'WRITE_OFF', 'TRANSFER');
    END IF;
END $$;

-- 3. PROFILES TABLE (Linked to Supabase Auth auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role public.user_role NOT NULL DEFAULT 'CASHIER',
    status public.user_status NOT NULL DEFAULT 'ACTIVE',
    license_number TEXT,
    avatar_color TEXT DEFAULT 'bg-teal-700',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 4. SECURITY DEFINER HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_role public.user_role;
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid() AND status = 'ACTIVE';
    RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND status = 'ACTIVE'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_clinician()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'CLINICIAN' AND status = 'ACTIVE'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_cashier()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'CASHIER' AND status = 'ACTIVE'
    );
END;
$$;

-- 5. PATIENTS TABLE
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    sex TEXT CHECK (sex IN ('MALE', 'FEMALE', 'OTHER')),
    phone TEXT,
    email TEXT,
    address TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_number ON public.patients(patient_number);
CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients(full_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients(phone);

-- 6. VISITS TABLE
CREATE TABLE IF NOT EXISTS public.visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    visit_number TEXT UNIQUE NOT NULL,
    visit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_patient ON public.visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON public.visits(visit_date);

-- 7. CONSULTATIONS TABLE
CREATE TABLE IF NOT EXISTS public.consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    clinician_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    vitals JSONB NOT NULL DEFAULT '{}'::jsonb,
    observations TEXT,
    clinical_notes TEXT,
    assessment TEXT,
    diagnosis TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultations_patient ON public.consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_clinician ON public.consultations(clinician_id);

-- 8. CATEGORIES TABLE (Database-Driven, NOT hardcoded)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'MEDICATION',
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(active);

-- 9. MEDICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    generic_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    form TEXT NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    barcode TEXT UNIQUE NOT NULL,
    is_prescription_required BOOLEAN NOT NULL DEFAULT false,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
    manufacturer TEXT NOT NULL,
    min_stock_level INTEGER NOT NULL DEFAULT 10 CHECK (min_stock_level >= 0),
    requires_refrigeration BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medications_barcode ON public.medications(barcode);
CREATE INDEX IF NOT EXISTS idx_medications_name ON public.medications(name);
CREATE INDEX IF NOT EXISTS idx_medications_category ON public.medications(category_id);
CREATE INDEX IF NOT EXISTS idx_medications_active ON public.medications(active);

-- 10. INVENTORY BATCHES TABLE
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE RESTRICT,
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_cost >= 0),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_medication_batch UNIQUE (medication_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_medication ON public.inventory_batches(medication_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON public.inventory_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_qty ON public.inventory_batches(quantity_on_hand);

-- 11. INVENTORY MOVEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
    quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
    movement_type public.movement_type NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    reason TEXT NOT NULL,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_medication ON public.inventory_movements(medication_id);
CREATE INDEX IF NOT EXISTS idx_movements_batch ON public.inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON public.inventory_movements(created_at);

-- 12. CLINICAL TESTS TABLE
CREATE TABLE IF NOT EXISTS public.tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. TEST ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.test_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_number TEXT UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    clinician_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    test_id UUID REFERENCES public.tests(id) ON DELETE SET NULL,
    test_type TEXT NOT NULL,
    notes TEXT,
    date_ordered DATE NOT NULL DEFAULT CURRENT_DATE,
    status public.test_status NOT NULL DEFAULT 'ORDERED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_orders_patient ON public.test_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_test_orders_status ON public.test_orders(status);

-- 14. TEST RESULTS TABLE
CREATE TABLE IF NOT EXISTS public.test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_order_id UUID UNIQUE NOT NULL REFERENCES public.test_orders(id) ON DELETE RESTRICT,
    result_summary TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. PRESCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_number TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    clinician_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    status public.prescription_status NOT NULL DEFAULT 'ISSUED',
    notes TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_rx ON public.prescriptions(prescription_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_barcode ON public.prescriptions(barcode);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON public.prescriptions(status);

-- 16. PRESCRIPTION ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE RESTRICT,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    duration TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    instructions TEXT NOT NULL,
    dispensing_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (dispensing_status IN ('PENDING', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED')),
    quantity_dispensed INTEGER NOT NULL DEFAULT 0 CHECK (quantity_dispensed >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rx_items_rx ON public.prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_rx_items_med ON public.prescription_items(medication_id);

-- 17. SALES TABLE
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT UNIQUE NOT NULL,
    client_operation_id TEXT UNIQUE NOT NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
    cashier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED', 'REFUNDED')),
    is_offline BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_receipt ON public.sales(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sales_operation_id ON public.sales(client_operation_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON public.sales(created_at);

-- 18. SALE ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
    prescription_item_id UUID REFERENCES public.prescription_items(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_med ON public.sale_items(medication_id);

-- 19. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'MPESA', 'CARD', 'INSURANCE', 'SPLIT')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reference_code TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_sale ON public.payments(sale_id);

-- 20. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    role public.user_role,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- 21. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
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
    show_generic_name BOOLEAN DEFAULT true,
    show_batch_and_expiry BOOLEAN DEFAULT true,
    show_prescription_details BOOLEAN DEFAULT true,
    show_pharmacist_name BOOLEAN DEFAULT true,
    show_barcode BOOLEAN DEFAULT true,
    show_tax_breakdown BOOLEAN DEFAULT true,
    currency_symbol TEXT DEFAULT 'KSh',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 22. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Authenticated users can view active profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Users can update their own non-role profile fields"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Admin has full profile management"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Patients Policies
CREATE POLICY "Active users can view patients"
ON public.patients FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Clinicians and Admins can create patients"
ON public.patients FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR public.is_clinician() OR public.is_cashier());

CREATE POLICY "Clinicians and Admins can update patients"
ON public.patients FOR UPDATE
TO authenticated
USING (public.is_admin() OR public.is_clinician())
WITH CHECK (public.is_admin() OR public.is_clinician());

-- Visits & Consultations
CREATE POLICY "Clinicians and Admins can view visits"
ON public.visits FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_clinician());

CREATE POLICY "Clinicians and Admins can create visits"
ON public.visits FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR public.is_clinician());

CREATE POLICY "Clinicians and Admins can view consultations"
ON public.consultations FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_clinician());

CREATE POLICY "Clinicians and Admins can insert consultations"
ON public.consultations FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR public.is_clinician());

-- Categories Policies
CREATE POLICY "Active users can view categories"
ON public.categories FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Admins can manage categories"
ON public.categories FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Medications Policies
CREATE POLICY "Active users can view medications"
ON public.medications FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Admins can manage medications"
ON public.medications FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Inventory Batches Policies
CREATE POLICY "Active users can view inventory batches"
ON public.inventory_batches FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Admins can directly manage inventory batches"
ON public.inventory_batches FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Inventory Movements Policies
CREATE POLICY "Admins can view inventory movements"
ON public.inventory_movements FOR SELECT
TO authenticated
USING (public.is_admin());

-- Tests & Orders
CREATE POLICY "Active users can view tests catalog"
ON public.tests FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Admins can manage tests catalog"
ON public.tests FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Active users can view test orders"
ON public.test_orders FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_clinician());

CREATE POLICY "Clinicians and Admins can manage test orders"
ON public.test_orders FOR ALL
TO authenticated
USING (public.is_admin() OR public.is_clinician())
WITH CHECK (public.is_admin() OR public.is_clinician());

CREATE POLICY "Clinicians and Admins can view test results"
ON public.test_results FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_clinician());

CREATE POLICY "Clinicians and Admins can record test results"
ON public.test_results FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR public.is_clinician());

-- Prescriptions Policies
CREATE POLICY "Active users can view prescriptions"
ON public.prescriptions FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Clinicians and Admins can create prescriptions"
ON public.prescriptions FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR public.is_clinician());

CREATE POLICY "Clinicians and Admins can update prescriptions"
ON public.prescriptions FOR UPDATE
TO authenticated
USING (public.is_admin() OR public.is_clinician())
WITH CHECK (public.is_admin() OR public.is_clinician());

CREATE POLICY "Active users can view prescription items"
ON public.prescription_items FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Clinicians and Admins can manage prescription items"
ON public.prescription_items FOR ALL
TO authenticated
USING (public.is_admin() OR public.is_clinician())
WITH CHECK (public.is_admin() OR public.is_clinician());

-- Sales Policies
CREATE POLICY "Admins and Cashiers can view sales"
ON public.sales FOR SELECT
TO authenticated
USING (public.is_admin() OR (public.is_cashier() AND cashier_id = auth.uid()));

CREATE POLICY "Admins and Cashiers can view sale items"
ON public.sale_items FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_cashier());

CREATE POLICY "Admins and Cashiers can view payments"
ON public.payments FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_cashier());

-- Audit Logs Policies
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Active users can append audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (public.is_active_user() AND (user_id IS NULL OR user_id = auth.uid()));

-- Settings Policies
CREATE POLICY "Active users can view settings"
ON public.settings FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "Admins can update settings"
ON public.settings FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- ==============================================================================
-- 23. RPC FUNCTIONS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.complete_sale(
    p_operation_id TEXT,
    p_receipt_number TEXT,
    p_items JSONB,
    p_payment_method TEXT,
    p_total NUMERIC,
    p_subtotal NUMERIC,
    p_tax NUMERIC,
    p_discount NUMERIC,
    p_amount_tendered NUMERIC DEFAULT NULL,
    p_patient_id UUID DEFAULT NULL,
    p_prescription_id UUID DEFAULT NULL,
    p_payment_reference TEXT DEFAULT NULL,
    p_is_offline BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_cashier_id UUID := auth.uid();
    v_cashier_role public.user_role;
    v_existing_sale_id UUID;
    v_sale_id UUID;
    v_item RECORD;
    v_batch_id UUID;
    v_med_id UUID;
    v_qty INTEGER;
    v_unit_price NUMERIC;
    v_disc_pct NUMERIC;
    v_line_total NUMERIC;
    v_rx_item_id UUID;
    v_avail_qty INTEGER;
    v_rx_qty_prescribed INTEGER;
    v_rx_qty_dispensed INTEGER;
BEGIN
    IF v_cashier_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to complete sales.';
    END IF;

    SELECT role INTO v_cashier_role
    FROM public.profiles
    WHERE id = v_cashier_id AND status = 'ACTIVE';

    IF v_cashier_role IS NULL OR (v_cashier_role <> 'CASHIER' AND v_cashier_role <> 'ADMIN') THEN
        RAISE EXCEPTION 'Unauthorized: Only active cashiers or administrators can finalize sales.';
    END IF;

    SELECT id INTO v_existing_sale_id
    FROM public.sales
    WHERE client_operation_id = p_operation_id;

    IF v_existing_sale_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'sale_id', v_existing_sale_id,
            'receipt_number', (SELECT receipt_number FROM public.sales WHERE id = v_existing_sale_id)
        );
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot complete sale with empty item list.';
    END IF;

    INSERT INTO public.sales (
        receipt_number,
        client_operation_id,
        patient_id,
        prescription_id,
        cashier_id,
        subtotal,
        tax,
        discount,
        total,
        status,
        is_offline
    ) VALUES (
        p_receipt_number,
        p_operation_id,
        p_patient_id,
        p_prescription_id,
        v_cashier_id,
        p_subtotal,
        p_tax,
        p_discount,
        p_total,
        'COMPLETED',
        p_is_offline
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        medication_id UUID,
        batch_id UUID,
        quantity INTEGER,
        unit_price NUMERIC,
        discount_percent NUMERIC,
        prescription_item_id UUID
    )
    LOOP
        v_med_id := v_item.medication_id;
        v_batch_id := v_item.batch_id;
        v_qty := v_item.quantity;
        v_unit_price := v_item.unit_price;
        v_disc_pct := COALESCE(v_item.discount_percent, 0.00);
        v_rx_item_id := v_item.prescription_item_id;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Sale item quantity must be greater than zero.';
        END IF;

        IF v_batch_id IS NULL THEN
            SELECT id INTO v_batch_id
            FROM public.inventory_batches
            WHERE medication_id = v_med_id AND active = true AND quantity_on_hand >= v_qty
            ORDER BY expiry_date ASC
            LIMIT 1
            FOR UPDATE;
        ELSE
            PERFORM 1 FROM public.inventory_batches WHERE id = v_batch_id FOR UPDATE;
        END IF;

        IF v_batch_id IS NULL THEN
            RAISE EXCEPTION 'No batch available with sufficient stock for medication %', v_med_id;
        END IF;

        SELECT quantity_on_hand INTO v_avail_qty
        FROM public.inventory_batches
        WHERE id = v_batch_id;

        IF v_avail_qty < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock in batch %. Requested: %, Available: %', v_batch_id, v_qty, v_avail_qty;
        END IF;

        UPDATE public.inventory_batches
        SET quantity_on_hand = quantity_on_hand - v_qty,
            updated_at = now()
        WHERE id = v_batch_id;

        INSERT INTO public.inventory_movements (
            medication_id,
            batch_id,
            quantity_change,
            movement_type,
            reference_type,
            reference_id,
            reason,
            performed_by
        ) VALUES (
            v_med_id,
            v_batch_id,
            -v_qty,
            'SALE',
            'SALE',
            v_sale_id::TEXT,
            'POS Dispensing sale ' || p_receipt_number,
            v_cashier_id
        );

        v_line_total := ROUND((v_qty * v_unit_price * (1.00 - (v_disc_pct / 100.00))), 2);

        INSERT INTO public.sale_items (
            sale_id,
            medication_id,
            batch_id,
            prescription_item_id,
            quantity,
            unit_price,
            discount_percent,
            total_price
        ) VALUES (
            v_sale_id,
            v_med_id,
            v_batch_id,
            v_rx_item_id,
            v_qty,
            v_unit_price,
            v_disc_pct,
            v_line_total
        );

        IF v_rx_item_id IS NOT NULL THEN
            SELECT quantity, quantity_dispensed INTO v_rx_qty_prescribed, v_rx_qty_dispensed
            FROM public.prescription_items
            WHERE id = v_rx_item_id;

            UPDATE public.prescription_items
            SET quantity_dispensed = quantity_dispensed + v_qty,
                dispensing_status = CASE
                    WHEN quantity_dispensed + v_qty >= quantity THEN 'DISPENSED'
                    ELSE 'PARTIALLY_DISPENSED'
                END,
                updated_at = now()
            WHERE id = v_rx_item_id;
        END IF;
    END LOOP;

    IF p_prescription_id IS NOT NULL THEN
        UPDATE public.prescriptions
        SET status = CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM public.prescription_items
                WHERE prescription_id = p_prescription_id AND dispensing_status <> 'DISPENSED'
            ) THEN 'DISPENSED'::public.prescription_status
            ELSE 'PARTIALLY_DISPENSED'::public.prescription_status
        END,
        updated_at = now()
        WHERE id = p_prescription_id;
    END IF;

    INSERT INTO public.payments (
        sale_id,
        payment_method,
        amount,
        reference_code
    ) VALUES (
        v_sale_id,
        p_payment_method,
        p_total,
        p_payment_reference
    );

    INSERT INTO public.audit_logs (
        user_id,
        role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_cashier_id,
        v_cashier_role,
        'SALE_COMPLETED',
        'SALES',
        v_sale_id::TEXT,
        jsonb_build_object(
            'receipt_number', p_receipt_number,
            'total', p_total,
            'payment_method', p_payment_method,
            'items_count', jsonb_array_length(p_items),
            'is_offline', p_is_offline
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'sale_id', v_sale_id,
        'receipt_number', p_receipt_number
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory(
    p_batch_id UUID,
    p_quantity_change INTEGER,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_med_id UUID;
    v_current_qty INTEGER;
    v_new_qty INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can adjust inventory levels.';
    END IF;

    IF p_quantity_change = 0 THEN
        RAISE EXCEPTION 'Adjustment quantity change cannot be zero.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Reason is mandatory for inventory adjustments.';
    END IF;

    SELECT medication_id, quantity_on_hand INTO v_med_id, v_current_qty
    FROM public.inventory_batches
    WHERE id = p_batch_id
    FOR UPDATE;

    IF v_med_id IS NULL THEN
        RAISE EXCEPTION 'Inventory batch not found: %', p_batch_id;
    END IF;

    v_new_qty := v_current_qty + p_quantity_change;
    IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'Adjustment would result in negative inventory (Current: %, Change: %)', v_current_qty, p_quantity_change;
    END IF;

    UPDATE public.inventory_batches
    SET quantity_on_hand = v_new_qty,
        updated_at = now()
    WHERE id = p_batch_id;

    INSERT INTO public.inventory_movements (
        medication_id,
        batch_id,
        quantity_change,
        movement_type,
        reference_type,
        reference_id,
        reason,
        performed_by
    ) VALUES (
        v_med_id,
        p_batch_id,
        p_quantity_change,
        'ADJUSTMENT',
        'MANUAL_ADJUSTMENT',
        NULL,
        p_reason,
        v_user_id
    );

    INSERT INTO public.audit_logs (
        user_id,
        role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_user_id,
        'ADMIN',
        'INVENTORY_ADJUSTED',
        'INVENTORY',
        p_batch_id::TEXT,
        jsonb_build_object(
            'medication_id', v_med_id,
            'previous_stock', v_current_qty,
            'quantity_change', p_quantity_change,
            'new_stock', v_new_qty,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', p_batch_id,
        'previous_stock', v_current_qty,
        'new_stock', v_new_qty
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role public.user_role,
    p_phone TEXT DEFAULT NULL,
    p_license_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_new_user_id UUID;
    v_encrypted_pw TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can create new system accounts.';
    END IF;

    IF p_email IS NULL OR trim(p_email) = '' THEN
        RAISE EXCEPTION 'Valid email address is required.';
    END IF;

    IF p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters long.';
    END IF;

    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));
    v_new_user_id := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_new_user_id,
        'authenticated',
        'authenticated',
        lower(trim(p_email)),
        v_encrypted_pw,
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('full_name', p_full_name, 'role', p_role::TEXT),
        now(),
        now()
    );

    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        phone,
        role,
        status,
        license_number,
        avatar_color
    ) VALUES (
        v_new_user_id,
        p_full_name,
        lower(trim(p_email)),
        p_phone,
        p_role,
        'ACTIVE',
        p_license_number,
        CASE
            WHEN p_role = 'ADMIN' THEN 'bg-teal-700'
            WHEN p_role = 'CLINICIAN' THEN 'bg-blue-600'
            ELSE 'bg-emerald-600'
        END
    );

    INSERT INTO public.audit_logs (
        user_id,
        role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_admin_id,
        'ADMIN',
        'USER_CREATED',
        'USERS',
        v_new_user_id::TEXT,
        jsonb_build_object(
            'email', p_email,
            'role', p_role::TEXT,
            'full_name', p_full_name
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_new_user_id,
        'email', p_email,
        'role', p_role::TEXT
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_target_user_id UUID,
    p_full_name TEXT,
    p_role public.user_role,
    p_status public.user_status,
    p_phone TEXT DEFAULT NULL,
    p_license_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_admin_count INTEGER;
    v_target_curr_role public.user_role;
    v_target_curr_status public.user_status;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can update user records.';
    END IF;

    SELECT role, status INTO v_target_curr_role, v_target_curr_status
    FROM public.profiles
    WHERE id = p_target_user_id;

    IF v_target_curr_role IS NULL THEN
        RAISE EXCEPTION 'User profile not found: %', p_target_user_id;
    END IF;

    IF v_target_curr_role = 'ADMIN' AND (p_role <> 'ADMIN' OR p_status <> 'ACTIVE') THEN
        SELECT COUNT(*) INTO v_admin_count
        FROM public.profiles
        WHERE role = 'ADMIN' AND status = 'ACTIVE';

        IF v_admin_count <= 1 THEN
            RAISE EXCEPTION 'Cannot deactivate or demote the final active Administrator account.';
        END IF;
    END IF;

    UPDATE public.profiles
    SET full_name = p_full_name,
        role = p_role,
        status = p_status,
        phone = p_phone,
        license_number = p_license_number,
        updated_at = now()
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (
        user_id,
        role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_admin_id,
        'ADMIN',
        'USER_UPDATED',
        'USERS',
        p_target_user_id::TEXT,
        jsonb_build_object(
            'new_role', p_role::TEXT,
            'new_status', p_status::TEXT,
            'full_name', p_full_name
        )
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_password(
    p_target_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can reset passwords.';
    END IF;

    IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (
        user_id,
        role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_admin_id,
        'ADMIN',
        'PASSWORD_RESET',
        'USERS',
        p_target_user_id::TEXT,
        jsonb_build_object('target_user_id', p_target_user_id)
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_existing_users INTEGER;
    v_new_id UUID;
BEGIN
    SELECT count(*) INTO v_existing_users FROM public.profiles;

    IF v_existing_users > 0 THEN
        RAISE EXCEPTION 'System already initialized with existing users. Bootstrap not permitted.';
    END IF;

    IF p_email IS NULL OR p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'Valid email and password (min 6 chars) required.';
    END IF;

    v_new_id := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_new_id,
        'authenticated',
        'authenticated',
        lower(trim(p_email)),
        extensions.crypt(p_password, extensions.gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('full_name', p_full_name, 'role', 'ADMIN'),
        now(),
        now()
    );

    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        status,
        avatar_color
    ) VALUES (
        v_new_id,
        p_full_name,
        lower(trim(p_email)),
        'ADMIN',
        'ACTIVE',
        'bg-teal-700'
    );

    INSERT INTO public.audit_logs (
        user_id,
        role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_new_id,
        'ADMIN',
        'SYSTEM_INITIALIZED',
        'SYSTEM',
        v_new_id::TEXT,
        jsonb_build_object('initial_admin', p_email)
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_new_id,
        'email', p_email
    );
END;
$$;

-- Default Settings & Seed
INSERT INTO public.settings (
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
    paper_width,
    currency_symbol
) VALUES (
    'default_settings',
    'RG Apothecary & Health Pharmacy',
    'Care You Can Trust, Everyday',
    'Kimathi Street, City Centre',
    'P.O. Box 48291-00100, Nairobi',
    '+254 700 123 456',
    'dispensary@apothecary.co.ke',
    'PPB-RET-2024-8819',
    'P051234567Z',
    0.16,
    '80mm',
    'KSh'
) ON CONFLICT (id) DO UPDATE SET
    pharmacy_name = EXCLUDED.pharmacy_name,
    updated_at = now();
