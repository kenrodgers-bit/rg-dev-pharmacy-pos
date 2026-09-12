/**
 * RG Pharma-POS Types & Interfaces
 * Production Canonical Models with Supabase PostgreSQL Integration
 */

// Phase 3: Exact Three User Roles
export type CanonicalUserRole = 'ADMIN' | 'CLINICIAN' | 'CASHIER';
export type UserRole = 'admin' | 'clinician' | 'cashier' | 'ADMIN' | 'CLINICIAN' | 'CASHIER';

export const normalizeRole = (role?: string | null): CanonicalUserRole => {
  if (!role) return 'CASHIER';
  const upper = role.toUpperCase();
  if (upper === 'ADMIN') return 'ADMIN';
  if (upper === 'CLINICIAN') return 'CLINICIAN';
  return 'CASHIER';
};

export const toDisplayRole = (role?: string | null): 'admin' | 'clinician' | 'cashier' => {
  const norm = normalizeRole(role);
  if (norm === 'ADMIN') return 'admin';
  if (norm === 'CLINICIAN') return 'clinician';
  return 'cashier';
};

export type CanonicalUserStatus = 'ACTIVE' | 'INACTIVE';
export type UserStatus = 'active' | 'inactive' | 'ACTIVE' | 'INACTIVE';

export const normalizeStatus = (status?: string | null): CanonicalUserStatus => {
  if (!status) return 'ACTIVE';
  return status.toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
};

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: 'admin' | 'clinician' | 'cashier';
  canonicalRole: CanonicalUserRole;
  status: 'active' | 'inactive';
  canonicalStatus: CanonicalUserStatus;
  createdAt: string;
  lastLogin?: string;
  phone?: string;
  licenseNumber?: string;
  avatarColor: string;
}

export type AppNavTab = 
  | 'pos' 
  | 'prescriptions' 
  | 'tests'
  | 'inventory' 
  | 'users' 
  | 'profile' 
  | 'reports' 
  | 'audit' 
  | 'settings';

export interface AuditLog {
  id: string;
  timestamp: string;
  userId?: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  category: 'AUTH' | 'USERS' | 'INVENTORY' | 'SALES' | 'SETTINGS' | 'SYSTEM' | 'CLINICAL';
  metadata?: Record<string, unknown>;
}

export interface Category {
  id: string;
  name: string;
  type: string;
  description?: string;
  active: boolean;
}

export type MedicationCategory = string;

export interface InventoryBatch {
  id: string;
  medicationId: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  quantityOnHand: number;
  unitCost: number;
  receivedAt?: string;
  active: boolean;
}

export interface Medication {
  id: string;
  name: string;
  genericName: string;
  dosage: string;
  form: 'Tablet' | 'Capsule' | 'Syrup' | 'Injection' | 'Inhaler' | 'Ointment' | 'Drops' | string;
  categoryId?: string;
  category: string;
  isPrescriptionRequired: boolean;
  barcode: string;
  price: number;
  costPrice: number;
  stock: number;
  minStockLevel: number;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  manufacturer: string;
  requiresRefrigeration?: boolean;
  active?: boolean;
  batches?: InventoryBatch[];
}

export interface Patient {
  id: string;
  patientNumber: string;
  fullName: string;
  dateOfBirth: string;
  sex?: 'MALE' | 'FEMALE' | 'OTHER';
  phone?: string;
  email?: string;
  address?: string;
  createdAt?: string;
}

export interface Visit {
  id: string;
  patientId: string;
  visitNumber: string;
  visitDate: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdBy?: string;
}

export interface Consultation {
  id: string;
  visitId: string;
  patientId: string;
  clinicianId: string;
  vitals: Record<string, unknown>;
  observations?: string;
  clinicalNotes?: string;
  assessment?: string;
  diagnosis?: string;
}

export type PrescriptionStatus = 'Active' | 'Dispensed' | 'Partially Dispensed' | 'Expired' | 'Cancelled';

export interface PrescriptionItem {
  id: string;
  prescriptionId: string;
  medicationId: string;
  medicationName?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions: string;
  dispensingStatus: 'PENDING' | 'PARTIALLY_DISPENSED' | 'DISPENSED' | 'CANCELLED';
  quantityDispensed: number;
}

export interface Prescription {
  id: string;
  rxNumber: string;
  barcode: string;
  patientId?: string;
  patientName: string;
  patientDOB: string;
  patientPhone: string;
  doctorName: string;
  doctorLicense: string;
  doctorClinic: string;
  medicationId: string;
  medicationName: string;
  dosageInstructions: string;
  quantityPrescribed: number;
  quantityDispensedSoFar: number;
  refillsAllowed: number;
  refillsRemaining: number;
  dateIssued: string;
  expiryDate: string;
  status: PrescriptionStatus;
  insuranceProvider?: string;
  insuranceCoPayRate?: number;
  items?: PrescriptionItem[];
}

export type TestStatus = 'Ordered' | 'In Progress' | 'Completed' | 'Cancelled';

export interface MedicalTest {
  id: string;
  testNumber: string;
  patientName: string;
  patientDOB: string;
  patientPhone: string;
  clinicianName: string;
  clinicianLicense: string;
  testType: string;
  notes: string;
  dateOrdered: string;
  status: TestStatus;
  resultSummary?: string;
  resultDate?: string;
  linkedPrescriptionId?: string;
}

export interface CartItem {
  medication: Medication;
  quantity: number;
  prescriptionId?: string;
  prescriptionItemId?: string;
  rxNumber?: string;
  patientName?: string;
  discountPercent?: number;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface POSTab {
  id: string;
  name: string;
  cart: CartItem[];
  patientName?: string;
  isParked?: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type PaymentMethod = 
  | 'Cash' 
  | 'M-Pesa' 
  | 'Partial (Cash + M-Pesa)' 
  | 'Credit/Debit Card' 
  | 'Insurance';

export interface SaleTransaction {
  id: string;
  clientOperationId?: string; // Idempotency key
  receiptNumber: string;
  timestamp: string;
  cashierName: string;
  cashierRole: UserRole;
  items: {
    medicationId: string;
    batchId?: string;
    name: string;
    genericName: string;
    dosage: string;
    isPrescription: boolean;
    rxNumber?: string;
    prescriptionItemId?: string;
    patientName?: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    totalPrice: number;
    batchNumber?: string;
    expiryDate?: string;
  }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountTendered?: number;
  changeDue?: number;
  cashAmount?: number;
  mpesaAmount?: number;
  mpesaReference?: string;
  mpesaPhone?: string;
  patientName?: string;
  patientId?: string;
  prescriptionId?: string;
  cardAuthCode?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceAuthCode?: string;
  isOffline: boolean;
  synced: boolean;
  syncTimestamp?: string;
}

export interface ReceiptSettings {
  pharmacyName: string;
  tagline: string;
  logoUrl?: string;
  showLogo?: boolean;
  logoHeight?: number;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  email: string;
  licenseNumber: string;
  taxId: string;
  taxRate: number;
  paperWidth: '80mm' | '58mm';
  headerMessage: string;
  footerMessage: string;
  returnPolicy: string;
  emergencyPhone: string;
  showGenericName: boolean;
  showBatchAndExpiry: boolean;
  showPrescriptionDetails: boolean;
  showPharmacistName: boolean;
  showBarcode: boolean;
  showTaxBreakdown: boolean;
  currencySymbol: string;
}

export interface InventoryAlert {
  id: string;
  medicationId: string;
  medicationName: string;
  type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRING_SOON' | 'EXPIRED';
  currentStock: number;
  minStockLevel: number;
  expiryDate?: string;
  message: string;
}

export type ExpiryFilterPreset =
  | 'all'
  | 'expired'
  | 'expiring_30'
  | 'expiring_90'
  | 'expiring_180'
  | 'expiring_365'
  | 'custom';

export interface InventoryFilters {
  searchTerm: string;
  category: string;
  supplier: string;
  stockStatus: 'all' | 'low' | 'rx' | 'otc' | 'expiring';
  expiryPreset: ExpiryFilterPreset;
  expiryStartDate: string;
  expiryEndDate: string;
}
