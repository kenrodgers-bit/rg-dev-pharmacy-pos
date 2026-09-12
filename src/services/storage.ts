import {
  AuditLog,
  CartItem,
  InventoryFilters,
  MedicalTest,
  Medication,
  normalizeRole,
  normalizeStatus,
  POSTab,
  Prescription,
  ReceiptSettings,
  SaleTransaction,
  toDisplayRole,
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

  createUser(
    actingUser: User,
    userData: {
      name: string;
      username: string;
      email?: string;
      phone?: string;
      role: UserRole;
      password?: string;
      licenseNumber?: string;
    }
  ): { success: boolean; user?: User; error?: string } {
    if (actingUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only administrators can create new staff accounts.' };
    }

    const currentUsers = this.getUsers();
    const cleanUsername = userData.username.trim().toLowerCase();

    if (!cleanUsername) {
      return { success: false, error: 'Username cannot be blank.' };
    }

    if (currentUsers.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: `Username "${userData.username}" is already taken.` };
    }

    const canonicalRole = normalizeRole(userData.role);
    const canonicalStatus = normalizeStatus((userData as any).status);

    const newUser: User = {
      id: 'user-' + Date.now(),
      username: cleanUsername,
      name: userData.name.trim(),
      email: userData.email?.trim() || `${cleanUsername}@afyacare.co.ke`,
      phone: userData.phone?.trim() || '',
      role: toDisplayRole(canonicalRole),
      canonicalRole,
      status: canonicalStatus === 'ACTIVE' ? 'active' : 'inactive',
      canonicalStatus,
      licenseNumber: userData.licenseNumber?.trim() || '',
      avatarColor: canonicalRole === 'ADMIN' ? 'bg-teal-700' : canonicalRole === 'CLINICIAN' ? 'bg-blue-600' : 'bg-emerald-600',
      createdAt: new Date().toISOString(),
    };

    const updated = [newUser, ...currentUsers];
    this.saveUsers(updated);

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: 'USER_CREATED',
      details: `Created new ${newUser.role.toUpperCase()} account for ${newUser.name} (@${newUser.username})`,
      category: 'USERS',
    });

    return { success: true, user: newUser };
  },

  updateUser(
    actingUser: User,
    targetUserId: string,
    updates: Partial<User>
  ): { success: boolean; user?: User; error?: string } {
    const currentUsers = this.getUsers();
    const target = currentUsers.find((u) => u.id === targetUserId);

    if (!target) {
      return { success: false, error: 'Target user account not found.' };
    }

    // Role-based security checks:
    // 1. If acting user is staff: can only edit own profile, and can NEVER alter role, status, id, or permissions
    if (actingUser.role !== 'admin') {
      if (actingUser.id !== targetUserId) {
        return { success: false, error: 'Unauthorized: Staff members cannot edit other user accounts.' };
      }
      // Strip forbidden keys
      if (updates.role && updates.role !== target.role) {
        return { success: false, error: 'Unauthorized: Staff members cannot modify account role.' };
      }
      if (updates.status && updates.status !== target.status) {
        return { success: false, error: 'Unauthorized: Staff members cannot modify account status.' };
      }
    }

    // 2. If acting user is admin:
    if (actingUser.role === 'admin') {
      // Admin cannot change their own role from ADMIN to STAFF
      if (actingUser.id === targetUserId && updates.role && updates.role !== 'admin') {
        return { success: false, error: 'Security restriction: Administrators cannot downgrade their own role.' };
      }

      // Check last remaining admin rule
      if (
        (updates.role && updates.role !== 'admin' && target.role === 'admin') ||
        (updates.status === 'inactive' && target.role === 'admin')
      ) {
        const activeAdmins = currentUsers.filter((u) => u.role === 'admin' && u.status === 'active');
        if (activeAdmins.length <= 1 && activeAdmins.some((u) => u.id === targetUserId)) {
          return {
            success: false,
            error: 'Action prohibited: Cannot downgrade or deactivate the last remaining active Administrator.',
          };
        }
      }
    }

    // Admin self-downgrade protection
    if (actingUser.id === targetUserId && updates.role && updates.role !== 'admin' && target.role === 'admin') {
      return { success: false, error: 'Security restriction: Administrators cannot downgrade their own role.' };
    }

    // Last admin protection
    if (target.role === 'admin' && updates.role && updates.role !== 'admin') {
      const activeAdmins = currentUsers.filter((u) => u.role === 'admin' && u.status === 'active');
      if (activeAdmins.length <= 1) {
        return {
          success: false,
          error: 'Security restriction: Cannot downgrade the last remaining active Administrator.',
        };
      }
    }

    // Safe updates whitelist
    const updatedUser: User = {
      ...target,
      name: updates.name !== undefined ? updates.name.trim() : target.name,
      email: updates.email !== undefined ? updates.email.trim() : target.email,
      phone: updates.phone !== undefined ? updates.phone.trim() : target.phone,
      licenseNumber: updates.licenseNumber !== undefined ? updates.licenseNumber.trim() : target.licenseNumber,
      // Admin-only fields
      role: actingUser.role === 'admin' && updates.role ? updates.role : target.role,
      status: actingUser.role === 'admin' && updates.status ? updates.status : target.status,
    };

    const updatedList = currentUsers.map((u) => (u.id === targetUserId ? updatedUser : u));
    this.saveUsers(updatedList);

    // If updating current active user, sync active user storage as well
    const active = this.getActiveUser();
    if (active.id === targetUserId) {
      this.saveActiveUser(updatedUser);
    }

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: 'USER_UPDATED',
      details: `Updated account details for ${updatedUser.name} (@${updatedUser.username})`,
      category: actingUser.id === targetUserId ? 'AUTH' : 'USERS',
    });

    return { success: true, user: updatedUser };
  },

  toggleUserStatus(actingUser: User, targetUserId: string): { success: boolean; user?: User; error?: string } {
    if (actingUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only administrators can modify account statuses.' };
    }

    if (actingUser.id === targetUserId) {
      return { success: false, error: 'Security restriction: You cannot deactivate your own currently active account.' };
    }

    const currentUsers = this.getUsers();
    const target = currentUsers.find((u) => u.id === targetUserId);
    if (!target) return { success: false, error: 'User not found.' };

    const newStatus = target.status === 'active' ? 'inactive' : 'active';

    // Last admin check
    if (newStatus === 'inactive' && target.role === 'admin') {
      const activeAdmins = currentUsers.filter((u) => u.role === 'admin' && u.status === 'active');
      if (activeAdmins.length <= 1) {
        return {
          success: false,
          error: 'Security restriction: Cannot deactivate the last remaining active Administrator.',
        };
      }
    }

    const updatedUser: User = { ...target, status: newStatus };
    const updatedList = currentUsers.map((u) => (u.id === targetUserId ? updatedUser : u));
    this.saveUsers(updatedList);

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: newStatus === 'active' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      details: `${newStatus === 'active' ? 'Activated' : 'Deactivated'} account of ${target.name} (@${target.username})`,
      category: 'USERS',
    });

    return { success: true, user: updatedUser };
  },

  deleteUser(actingUser: User, targetUserId: string): { success: boolean; error?: string } {
    if (actingUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only administrators can delete staff accounts.' };
    }

    if (actingUser.id === targetUserId) {
      return { success: false, error: 'Security restriction: Administrators cannot delete their own account.' };
    }

    const currentUsers = this.getUsers();
    const target = currentUsers.find((u) => u.id === targetUserId);
    if (!target) return { success: false, error: 'User not found.' };

    if (target.role === 'admin') {
      const adminCount = currentUsers.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        return {
          success: false,
          error: 'Security restriction: Cannot delete the last remaining Administrator.',
        };
      }
    }

    const updatedList = currentUsers.filter((u) => u.id !== targetUserId);
    this.saveUsers(updatedList);

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: 'USER_DELETED',
      details: `Permanently removed ${target.role.toUpperCase()} account for ${target.name} (@${target.username})`,
      category: 'USERS',
    });

    return { success: true };
  },

  resetUserPassword(actingUser: User, targetUserId: string, newPassword: string): { success: boolean; error?: string } {
    if (actingUser.role !== 'admin' && actingUser.id !== targetUserId) {
      return { success: false, error: 'Unauthorized: You can only change your own password.' };
    }

    if (!newPassword || newPassword.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters.' };
    }

    const currentUsers = this.getUsers();
    const target = currentUsers.find((u) => u.id === targetUserId);
    if (!target) return { success: false, error: 'User not found.' };

    const updatedUser = { ...target, password: newPassword };
    const updatedList = currentUsers.map((u) => (u.id === targetUserId ? updatedUser : u));
    this.saveUsers(updatedList);

    if (this.getActiveUser().id === targetUserId) {
      this.saveActiveUser(updatedUser);
    }

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: 'PASSWORD_RESET',
      details: `Password reset performed for ${target.name} (@${target.username})`,
      category: 'AUTH',
    });

    return { success: true };
  },

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
  getActiveUser(): User | null {
    try {
      if (localStorage.getItem(STORAGE_KEYS.LOGGED_OUT) === 'true') {
        return null;
      }
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.id) return parsed;
      }
    } catch (e) {
      console.error('Failed to load active user', e);
    }
    const all = this.getUsers();
    return all[0] || DEMO_USERS[0];
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

  authenticateUser(username: string, passwordInput: string): { success: boolean; user?: User; error?: string } {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = passwordInput.trim();

    if (!cleanUsername) {
      return { success: false, error: 'Please enter your username.' };
    }
    if (!cleanPassword) {
      return { success: false, error: 'Please enter your password.' };
    }

    const allUsers = this.getUsers();
    const matched = allUsers.find((u) => u.username.toLowerCase() === cleanUsername);

    if (!matched) {
      return { success: false, error: 'Invalid username or credentials.' };
    }

    if (matched.status === 'inactive') {
      return { success: false, error: 'This account has been deactivated. Please contact an Administrator.' };
    }

    const expectedPassword = matched.password || matched.username;
    if (cleanPassword !== expectedPassword) {
      return { success: false, error: 'Incorrect password for this account.' };
    }

    // Update lastLogin
    const updatedUser: User = {
      ...matched,
      lastLogin: new Date().toISOString(),
    };

    const updatedList = allUsers.map((u) => (u.id === matched.id ? updatedUser : u));
    this.saveUsers(updatedList);
    this.saveActiveUser(updatedUser);

    this.addAuditLog({
      userId: updatedUser.id,
      userName: updatedUser.name,
      userRole: updatedUser.role,
      action: 'USER_LOGIN',
      details: `User authenticated and signed into account (@${updatedUser.username})`,
      category: 'AUTH',
    });

    return { success: true, user: updatedUser };
  },

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
