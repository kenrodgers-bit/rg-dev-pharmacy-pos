import {
  AuditLog,
  CartItem,
  InventoryFilters,
  MedicalTest,
  Medication,
  POSTab,
  Prescription,
  ReceiptSettings,
  SaleTransaction,
  User,
  UserRole,
} from '../types';
import {
  DEMO_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_MEDICATIONS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_RECEIPT_SETTINGS,
  INITIAL_TESTS,
  INITIAL_TRANSACTIONS,
} from '../data/mockData';
import { getSupabase } from './supabase';

const STORAGE_KEYS = {
  MEDICATIONS: 'pharmapos_medications_v1',
  PRESCRIPTIONS: 'pharmapos_prescriptions_v1',
  TESTS: 'pharmapos_tests_v1',
  TRANSACTIONS: 'pharmapos_transactions_v1',
  OFFLINE_QUEUE: 'pharmapos_offline_queue_v1',
  RECEIPT_SETTINGS: 'pharmapos_receipt_settings_v1',
  ACTIVE_USER: 'pharmapos_active_user_v2',
  USERS: 'pharmapos_users_v2',
  AUDIT_LOGS: 'pharmapos_audit_logs_v1',
  REGISTER_STATE: 'pharmapos_register_state_v1',
  CART: 'pharmapos_cart_v1',
  CART_PATIENT_NAME: 'pharmapos_cart_patient_name_v1',
  POS_TABS: 'pharmapos_tabs_v2',
  ACTIVE_POS_TAB: 'pharmapos_active_tab_id_v2',
  LOGGED_OUT: 'pharmapos_is_logged_out_v2',
};

const SESSION_KEYS = {
  INVENTORY_FILTERS: 'pharmapos_inventory_filters_session_v1',
};

export const storageService = {
  // Inventory Filters Session Persistence
  getInventoryFilters(): InventoryFilters {
    const defaultFilters: InventoryFilters = {
      searchTerm: '',
      category: 'All',
      supplier: 'All',
      stockStatus: 'all',
      expiryPreset: 'all',
      expiryStartDate: '',
      expiryEndDate: '',
    };
    try {
      const data = sessionStorage.getItem(SESSION_KEYS.INVENTORY_FILTERS);
      if (data) {
        const parsed = JSON.parse(data);
        return { ...defaultFilters, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load inventory filters from sessionStorage', e);
    }
    return defaultFilters;
  },

  saveInventoryFilters(filters: InventoryFilters): void {
    try {
      sessionStorage.setItem(SESSION_KEYS.INVENTORY_FILTERS, JSON.stringify(filters));
    } catch (e) {
      console.error('Failed to save inventory filters to sessionStorage', e);
    }
  },

  clearInventoryFilters(): void {
    try {
      sessionStorage.removeItem(SESSION_KEYS.INVENTORY_FILTERS);
    } catch (e) {
      console.error('Failed to clear inventory filters from sessionStorage', e);
    }
  },

  // Cart Persistence
  getCart(): CartItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CART);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load cart from storage', e);
    }
    return [];
  },

  saveCart(cart: CartItem[]): void {
    try {
      if (!cart || cart.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.CART);
      } else {
        localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
      }
    } catch (e) {
      console.error('Failed to save cart to storage', e);
    }
  },

  clearCart(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.CART);
      localStorage.removeItem(STORAGE_KEYS.CART_PATIENT_NAME);
    } catch (e) {
      console.error('Failed to clear cart', e);
    }
  },

  getCartPatientName(): string {
    try {
      return localStorage.getItem(STORAGE_KEYS.CART_PATIENT_NAME) || '';
    } catch (e) {
      return '';
    }
  },

  saveCartPatientName(name: string): void {
    try {
      if (name.trim()) {
        localStorage.setItem(STORAGE_KEYS.CART_PATIENT_NAME, name);
      } else {
        localStorage.removeItem(STORAGE_KEYS.CART_PATIENT_NAME);
      }
    } catch (e) {
      // ignore
    }
  },

  // POS Multi-Order Tabs Persistence
  getPOSTabs(): POSTab[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.POS_TABS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load POS tabs from storage', e);
    }

    // Migration / fallback from legacy single cart
    const existingCart = this.getCart();
    const existingPatientName = this.getCartPatientName();
    const defaultTab: POSTab = {
      id: 'tab-1',
      name: existingPatientName ? `Tab 1: ${existingPatientName}` : 'Tab 1',
      cart: existingCart,
      patientName: existingPatientName,
      isParked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.savePOSTabs([defaultTab]);
    return [defaultTab];
  },

  savePOSTabs(tabs: POSTab[]): void {
    try {
      if (!tabs || tabs.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.POS_TABS);
      } else {
        localStorage.setItem(STORAGE_KEYS.POS_TABS, JSON.stringify(tabs));
      }
    } catch (e) {
      console.error('Failed to save POS tabs', e);
    }
  },

  getActivePOSTabId(): string {
    try {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_POS_TAB) || 'tab-1';
    } catch (e) {
      return 'tab-1';
    }
  },

  saveActivePOSTabId(id: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_POS_TAB, id);
    } catch (e) {
      // ignore
    }
  },
  // Medications (Inventory)
  getMedications(): Medication[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEDICATIONS);
      if (data !== null) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load medications from storage', e);
    }
    this.saveMedications(INITIAL_MEDICATIONS);
    return INITIAL_MEDICATIONS;
  },

  saveMedications(medications: Medication[]): void {
    try {
      // Pharmaceutical compliance check: enforce stock >= 0 and valid batch strings
      const sanitized = medications.map((m) => ({
        ...m,
        stock: Math.max(0, Math.floor(Number(m.stock) || 0)),
        minStockLevel: Math.max(0, Math.floor(Number(m.minStockLevel) || 0)),
        batchNumber: m.batchNumber?.trim() || 'BATCH-UNSPECIFIED',
        expiryDate: m.expiryDate?.trim() || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }));
      localStorage.setItem(STORAGE_KEYS.MEDICATIONS, JSON.stringify(sanitized));
    } catch (e) {
      console.error('Failed to save medications', e);
    }
  },

  // Prescriptions
  getPrescriptions(): Prescription[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PRESCRIPTIONS);
      if (data !== null) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load prescriptions from storage', e);
    }
    this.savePrescriptions(INITIAL_PRESCRIPTIONS);
    return INITIAL_PRESCRIPTIONS;
  },

  savePrescriptions(prescriptions: Prescription[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PRESCRIPTIONS, JSON.stringify(prescriptions));
    } catch (e) {
      console.error('Failed to save prescriptions', e);
    }
  },

  // Clinical Tests (ordered/recorded by clinicians)
  getTests(): MedicalTest[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TESTS);
      if (data !== null) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load tests from storage', e);
    }
    this.saveTests(INITIAL_TESTS);
    return INITIAL_TESTS;
  },

  saveTests(tests: MedicalTest[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(tests));
    } catch (e) {
      console.error('Failed to save tests', e);
    }
  },

  // Sales Transactions
  getTransactions(): SaleTransaction[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load transactions from storage', e);
    }
    this.saveTransactions(INITIAL_TRANSACTIONS);
    return INITIAL_TRANSACTIONS;
  },

  saveTransactions(transactions: SaleTransaction[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    } catch (e) {
      console.error('Failed to save transactions', e);
    }
  },

  // Offline Sync Queue
  getOfflineQueue(): SaleTransaction[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load offline queue', e);
    }
    return [];
  },

  saveOfflineQueue(queue: SaleTransaction[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save offline queue', e);
    }
  },

  addToOfflineQueue(transaction: SaleTransaction): void {
    const queue = this.getOfflineQueue();
    queue.push(transaction);
    this.saveOfflineQueue(queue);
  },

  clearOfflineQueue(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    } catch (e) {
      console.error('Failed to clear offline queue', e);
    }
  },

  // Receipt Settings
  getReceiptSettings(): ReceiptSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RECEIPT_SETTINGS);
      if (data) {
        const parsed = JSON.parse(data);
        const settings = { ...INITIAL_RECEIPT_SETTINGS, ...parsed };
        if (settings.pharmacyName === 'AfyaCare Pharmacy & Chemists' || !settings.pharmacyName) {
          settings.pharmacyName = 'RG Pharma-POS';
          this.saveReceiptSettings(settings);
        }
        return settings;
      }
    } catch (e) {
      console.error('Failed to load receipt settings', e);
    }
    this.saveReceiptSettings(INITIAL_RECEIPT_SETTINGS);
    return INITIAL_RECEIPT_SETTINGS;
  },

  saveReceiptSettings(settings: ReceiptSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.RECEIPT_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save receipt settings', e);
    }
  },

  // Users & Staff Management
  getUsers(): User[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load users from storage', e);
    }
    // Demo/sample staff accounts are a local-only-mode convenience and must
    // never appear once this app is talking to a real Supabase project -
    // the real roster comes from fetchAllUsersFromSupabase() instead.
    if (getSupabase()) {
      return [];
    }
    this.saveUsers(DEMO_USERS);
    return DEMO_USERS;
  },

  saveUsers(users: User[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch (e) {
      console.error('Failed to save users', e);
    }
  },

  getUserById(id: string): User | undefined {
    return this.getUsers().find((u) => u.id === id);
  },

  // NOTE: local-only createUser/updateUser/toggleUserStatus/deleteUser/
  // resetUserPassword were removed - user management is now Supabase-
  // backed (see services/supabase.ts: adminCreateUser, adminDeleteUser,
  // adminResetPassword, updateUserProfileInSupabase, changeOwnPassword,
  // and supabase/functions/admin-manage-user for the privileged parts).


  // Audit Logs
  getAuditLogs(): AuditLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load audit logs', e);
    }
    this.saveAuditLogs(INITIAL_AUDIT_LOGS);
    return INITIAL_AUDIT_LOGS;
  },

  saveAuditLogs(logs: AuditLog[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs.slice(0, 200)));
    } catch (e) {
      console.error('Failed to save audit logs', e);
    }
  },

  addAuditLog(entry: Omit<AuditLog, 'id' | 'timestamp'>): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      ...entry,
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
    };
    this.saveAuditLogs([newLog, ...logs]);
  },

  // Active User / Auth
  //
  // SECURITY: This must NEVER fall back to "the first known user" or a
  // demo account. It only returns a user that was explicitly placed here
  // by a successful `saveActiveUser()` call after real authentication
  // (see `signInWithSupabase` / `signUpInitialAdmin` in services/supabase.ts).
  // Absence of a session here means "signed out" - full stop.
  getActiveUser(): User | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.id) return parsed;
      }
    } catch (e) {
      console.error('Failed to load active user', e);
    }
    return null;
  },

  saveActiveUser(user: User): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.LOGGED_OUT);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to save active user', e);
    }
  },

  logoutActiveUser(user?: User | null): void {
    try {
      if (user) {
        this.addAuditLog({
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'USER_LOGOUT',
          details: `User signed out of account session (@${user.username})`,
          category: 'AUTH',
        });
      }
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
      localStorage.setItem(STORAGE_KEYS.LOGGED_OUT, 'true');
    } catch (e) {
      console.error('Failed to logout user', e);
    }
  },

  // NOTE: The previous local, plaintext-password `authenticateUser()` method
  // has been removed. It is not called anywhere in the app (LoginView calls
  // `signInWithSupabase()` in services/supabase.ts) and comparing passwords
  // against a value stored in a client-readable table is exactly the "fake
  // authentication" / "local database authority" pattern real auth must not
  // use. Real credential checking now happens server-side via Supabase Auth.

  // Reset business data: deletes all stock, sales, prescriptions, and app activity logs while strictly preserving shop details (name, address, tax PIN, logo, receipt config) and user accounts
  resetBusinessData(adminUser?: { id: string; name: string; role: string }): void {
    // 1. Snapshot current shop profile & identity settings to ensure absolute retention
    const preservedShopSettings = this.getReceiptSettings();
    const preservedUsers = this.getUsers();
    const preservedActiveUser = this.getActiveUser();

    // 2. Wipe stock, sales, prescriptions, offline queue, active cart, and order tabs
    this.saveMedications([]);
    this.saveTransactions([]);
    this.savePrescriptions([]);
    this.saveTests([]);
    this.saveOfflineQueue([]);
    this.clearCart();
    this.clearInventoryFilters();

    const freshTabs: POSTab[] = [
      {
        id: 'tab-1',
        name: 'Tab 1',
        cart: [],
        patientName: '',
        isParked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    this.savePOSTabs(freshTabs);
    this.saveActivePOSTabId('tab-1');

    try {
      localStorage.removeItem(STORAGE_KEYS.REGISTER_STATE);
    } catch (e) {
      // ignore
    }

    // 3. Guarantee shop details & user accounts remain strictly preserved
    this.saveReceiptSettings(preservedShopSettings);
    if (preservedUsers && preservedUsers.length > 0) {
      this.saveUsers(preservedUsers);
    }
    if (preservedActiveUser) {
      this.saveActiveUser(preservedActiveUser);
    }

    // 4. Initialize clean audit log recording the factory reset action
    const resetLog: AuditLog = {
      id: 'log-' + Date.now(),
      timestamp: new Date().toISOString(),
      userId: adminUser?.id || 'admin',
      userName: adminUser?.name || 'Administrator',
      userRole: (adminUser?.role as UserRole) || 'admin',
      action: 'SYSTEM_RESET',
      details: `System business reset executed by ${adminUser?.name || 'Administrator'}. All stock inventory, sales history, prescriptions, and historical activity logs wiped. Shop profile for "${preservedShopSettings.pharmacyName}" maintained.`,
      category: 'SETTINGS',
    };
    this.saveAuditLogs([resetLog]);
  },

  // Reset demo data
  resetAllData(): void {
    localStorage.clear();
    this.saveMedications(INITIAL_MEDICATIONS);
    this.savePrescriptions(INITIAL_PRESCRIPTIONS);
    this.saveTests(INITIAL_TESTS);
    this.saveReceiptSettings(INITIAL_RECEIPT_SETTINGS);
    this.saveUsers(DEMO_USERS);
    this.saveActiveUser(DEMO_USERS[0]);
    this.saveAuditLogs(INITIAL_AUDIT_LOGS);
  },

  // ------------------------------------------------------------------
  // Supabase cloud sync (medications, prescriptions & tests)
  // ------------------------------------------------------------------
  // These push local changes up to Supabase (fire-and-forget, so the
  // offline-first local flow never blocks on network) and pull the
  // latest cloud rows down to hydrate this device. Combined with the
  // realtime subscription in supabase.ts, this is what keeps the
  // admin / clinician / cashier screens in sync across devices.

  async pushMedicationToCloud(m: Medication): Promise<void> {
    const client = getSupabase();
    if (!client) return;
    try {
      await client.from('medications').upsert(medicationToRow(m));
    } catch (e) {
      console.error('Cloud sync failed (medication upsert)', e);
    }
  },

  async deleteMedicationFromCloud(id: string): Promise<void> {
    const client = getSupabase();
    if (!client) return;
    try {
      await client.from('medications').delete().eq('id', id);
    } catch (e) {
      console.error('Cloud sync failed (medication delete)', e);
    }
  },

  async pullMedicationsFromCloud(): Promise<Medication[] | null> {
    const client = getSupabase();
    if (!client) return null;
    try {
      const { data, error } = await client.from('medications').select('*');
      if (error || !data) return null;
      return data.map(rowToMedication);
    } catch (e) {
      console.error('Cloud sync failed (medications pull)', e);
      return null;
    }
  },

  async pushPrescriptionToCloud(rx: Prescription): Promise<void> {
    const client = getSupabase();
    if (!client) return;
    try {
      await client.from('prescriptions').upsert(prescriptionToRow(rx));
    } catch (e) {
      console.error('Cloud sync failed (prescription upsert)', e);
    }
  },

  async pullPrescriptionsFromCloud(): Promise<Prescription[] | null> {
    const client = getSupabase();
    if (!client) return null;
    try {
      const { data, error } = await client.from('prescriptions').select('*');
      if (error || !data) return null;
      return data.map(rowToPrescription);
    } catch (e) {
      console.error('Cloud sync failed (prescriptions pull)', e);
      return null;
    }
  },

  async pushTestToCloud(t: MedicalTest): Promise<void> {
    const client = getSupabase();
    if (!client) return;
    try {
      await client.from('tests').upsert(testToRow(t));
    } catch (e) {
      console.error('Cloud sync failed (test upsert)', e);
    }
  },

  async pullTestsFromCloud(): Promise<MedicalTest[] | null> {
    const client = getSupabase();
    if (!client) return null;
    try {
      const { data, error } = await client.from('tests').select('*');
      if (error || !data) return null;
      return data.map(rowToTest);
    } catch (e) {
      console.error('Cloud sync failed (tests pull)', e);
      return null;
    }
  },

  async pushTransactionToCloud(t: SaleTransaction): Promise<boolean> {
    const client = getSupabase();
    if (!client) return false;
    try {
      const { error } = await client.from('sale_transactions').upsert(transactionToRow(t));
      if (error) {
        console.error('Cloud sync failed (transaction upsert)', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Cloud sync failed (transaction upsert)', e);
      return false;
    }
  },
};

// ------------------------------------------------------------------
// camelCase (app) <-> snake_case (Supabase) row mappers
// ------------------------------------------------------------------

function medicationToRow(m: Medication) {
  return {
    id: m.id,
    name: m.name,
    generic_name: m.genericName,
    dosage: m.dosage,
    form: m.form,
    category: m.category,
    is_prescription_required: !!m.isPrescriptionRequired,
    barcode: m.barcode,
    price: m.price,
    cost_price: m.costPrice,
    stock: m.stock,
    min_stock_level: m.minStockLevel,
    batch_number: m.batchNumber,
    expiry_date: m.expiryDate,
    manufacturer: m.manufacturer,
    requires_refrigeration: !!m.requiresRefrigeration,
  };
}

function rowToMedication(r: any): Medication {
  return {
    id: r.id,
    name: r.name,
    genericName: r.generic_name,
    dosage: r.dosage,
    form: r.form,
    category: r.category,
    isPrescriptionRequired: !!r.is_prescription_required,
    barcode: r.barcode,
    price: Number(r.price),
    costPrice: Number(r.cost_price),
    stock: Number(r.stock),
    minStockLevel: Number(r.min_stock_level),
    batchNumber: r.batch_number,
    expiryDate: r.expiry_date,
    manufacturer: r.manufacturer,
    requiresRefrigeration: !!r.requires_refrigeration,
  };
}

function prescriptionToRow(p: Prescription) {
  return {
    id: p.id,
    rx_number: p.rxNumber,
    barcode: p.barcode,
    patient_name: p.patientName,
    patient_dob: p.patientDOB,
    patient_phone: p.patientPhone,
    doctor_name: p.doctorName,
    doctor_license: p.doctorLicense,
    doctor_clinic: p.doctorClinic,
    medication_id: p.medicationId,
    medication_name: p.medicationName,
    dosage_instructions: p.dosageInstructions,
    quantity_prescribed: p.quantityPrescribed,
    quantity_dispensed_so_far: p.quantityDispensedSoFar,
    refills_allowed: p.refillsAllowed,
    refills_remaining: p.refillsRemaining,
    date_issued: p.dateIssued,
    expiry_date: p.expiryDate,
    status: p.status,
    insurance_provider: p.insuranceProvider || null,
    insurance_co_pay_rate: p.insuranceCoPayRate ?? null,
  };
}

function rowToPrescription(r: any): Prescription {
  return {
    id: r.id,
    rxNumber: r.rx_number,
    barcode: r.barcode,
    patientName: r.patient_name,
    patientDOB: r.patient_dob,
    patientPhone: r.patient_phone,
    doctorName: r.doctor_name,
    doctorLicense: r.doctor_license,
    doctorClinic: r.doctor_clinic,
    medicationId: r.medication_id,
    medicationName: r.medication_name,
    dosageInstructions: r.dosage_instructions,
    quantityPrescribed: Number(r.quantity_prescribed),
    quantityDispensedSoFar: Number(r.quantity_dispensed_so_far),
    refillsAllowed: Number(r.refills_allowed),
    refillsRemaining: Number(r.refills_remaining),
    dateIssued: r.date_issued,
    expiryDate: r.expiry_date,
    status: r.status,
    insuranceProvider: r.insurance_provider || undefined,
    insuranceCoPayRate: r.insurance_co_pay_rate ?? undefined,
  };
}

function testToRow(t: MedicalTest) {
  return {
    id: t.id,
    test_number: t.testNumber,
    patient_name: t.patientName,
    patient_dob: t.patientDOB,
    patient_phone: t.patientPhone,
    clinician_name: t.clinicianName,
    clinician_license: t.clinicianLicense,
    test_type: t.testType,
    notes: t.notes || '',
    date_ordered: t.dateOrdered,
    status: t.status,
    result_summary: t.resultSummary || null,
    result_date: t.resultDate || null,
    linked_prescription_id: t.linkedPrescriptionId || null,
  };
}

function rowToTest(r: any): MedicalTest {
  return {
    id: r.id,
    testNumber: r.test_number,
    patientName: r.patient_name,
    patientDOB: r.patient_dob,
    patientPhone: r.patient_phone,
    clinicianName: r.clinician_name,
    clinicianLicense: r.clinician_license,
    testType: r.test_type,
    notes: r.notes || '',
    dateOrdered: r.date_ordered,
    status: r.status,
    resultSummary: r.result_summary || undefined,
    resultDate: r.result_date || undefined,
    linkedPrescriptionId: r.linked_prescription_id || undefined,
  };
}

function transactionToRow(t: SaleTransaction) {
  return {
    id: t.id,
    receipt_number: t.receiptNumber,
    timestamp: t.timestamp,
    cashier_name: t.cashierName,
    cashier_role: t.cashierRole,
    items: t.items,
    subtotal: t.subtotal,
    tax: t.tax,
    discount: t.discount,
    total: t.total,
    payment_method: t.paymentMethod,
    amount_tendered: t.amountTendered ?? null,
    change_due: t.changeDue ?? null,
    cash_amount: t.cashAmount ?? null,
    mpesa_amount: t.mpesaAmount ?? null,
    mpesa_reference: t.mpesaReference ?? null,
    mpesa_phone: t.mpesaPhone ?? null,
    patient_name: t.patientName ?? null,
    card_auth_code: t.cardAuthCode ?? null,
    insurance_provider: t.insuranceProvider ?? null,
    insurance_policy_number: t.insurancePolicyNumber ?? null,
    insurance_auth_code: t.insuranceAuthCode ?? null,
    is_offline: t.isOffline,
    synced: true,
    sync_timestamp: new Date().toISOString(),
  };
}
