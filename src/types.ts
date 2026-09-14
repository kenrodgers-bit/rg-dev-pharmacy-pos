/**
 * RG Pharma-POS Types & Interfaces
 */

export type UserRole = 'admin' | 'clinician' | 'cashier';

export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string;
  username: string;
  email?: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLogin?: string;
  phone?: string;
  licenseNumber?: string;
  avatarColor: string;
}

export type AppNavTab = 
  | 'pos' 
  | 'clinical'
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
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  category: 'AUTH' | 'USERS' | 'INVENTORY' | 'SALES' | 'SETTINGS' | 'SYSTEM' | 'CLINICAL';
}

export type MedicationCategory = 
  | 'Antibiotics'
  | 'Cardiovascular'
  | 'Pain & Analgesics'
  | 'Respiratory'
  | 'Gastrointestinal'
  | 'Diabetes'
  | 'OTC & First Aid'
  | 'Vitamins & Supplements';

export interface Medication {
  id: string;
  name: string;
  genericName: string;
  dosage: string; // e.g., "500mg", "10mg/5ml", "20mcg"
  form: 'Tablet' | 'Capsule' | 'Syrup' | 'Injection' | 'Inhaler' | 'Ointment' | 'Drops';
  category: MedicationCategory;
  isPrescriptionRequired: boolean; // Rx required
  barcode: string; // NDC or EAN
  price: number;
  costPrice: number;
  stock: number;
  minStockLevel: number;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  manufacturer: string;
  requiresRefrigeration?: boolean;
}

export type PrescriptionStatus = 
  | 'Draft' 
  | 'Issued' 
  | 'Partially Dispensed' 
  | 'Dispensed' 
  | 'Cancelled' 
  | 'Expired'
  | 'Active'; // Keep 'Active' for backwards compatibility with existing rows

export interface PrescriptionItem {
  id: string;
  medicationId: string;
  medicationName: string;
  genericName?: string;
  dosageInstructions: string;
  quantityPrescribed: number;
  quantityDispensedSoFar: number;
  refillsAllowed: number;
  refillsRemaining: number;
}

export interface Prescription {
  id: string;
  rxNumber: string; // e.g., "RX-80219"
  barcode: string;
  patientId?: string;
  patientName: string;
  patientDOB: string;
  patientPhone: string;
  doctorName: string;
  doctorLicense: string;
  doctorClinic: string;
  medicationId?: string;
  medicationName: string;
  dosageInstructions?: string;
  quantityPrescribed?: number;
  quantityDispensedSoFar?: number;
  refillsAllowed?: number;
  refillsRemaining?: number;
  items?: PrescriptionItem[];
  dateIssued: string;
  expiryDate: string;
  status: PrescriptionStatus;
  insuranceProvider?: string;
  insuranceCoPayRate?: number; // e.g., 0.20 for 80% coverage
  notes?: string;
}

export interface Patient {
  id: string;
  fullName: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  email?: string;
  address?: string;
  allergies?: string[];
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  createdAt: string;
}

export interface ClinicalTest {
  id: string;
  consultationId?: string;
  patientId: string;
  patientName?: string;
  testName: string;
  category: 'Hematology' | 'Biochemistry' | 'Microbiology' | 'Rapid Diagnostic' | 'Urinalysis' | 'Other';
  status: 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';
  results?: string;
  referenceRanges?: string;
  notes?: string;
  requestedBy: string;
  conductedAt?: string;
  createdAt: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  patientName: string;
  clinicianId: string;
  clinicianName: string;
  date: string;
  symptoms: string;
  diagnosis: string;
  notes?: string;
  vitals?: {
    bp?: string;
    temperature?: string;
    heartRate?: string;
    weight?: string;
    oxygenSat?: string;
  };
  tests?: ClinicalTest[];
  prescriptions?: Prescription[];
  createdAt: string;
}

export interface InventoryMovement {
  id: string;
  medicationId: string;
  medicationName?: string;
  movementType: 'IMPORT_ADD' | 'IMPORT_REDUCE' | 'IMPORT_SET' | 'SALE' | 'RETURN' | 'MANUAL_ADJUSTMENT' | 'DAMAGE_WRITE_OFF';
  quantityChange: number;
  previousStock: number;
  newStock: number;
  batchNumber?: string;
  reason?: string;
  userId?: string;
  userName?: string;
  createdAt: string;
}

export interface InventoryImportBatch {
  id: string;
  importId: string;
  filename: string;
  fileHash?: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  stockAdded: number;
  stockReduced: number;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export type TestStatus = 'Ordered' | 'In Progress' | 'Completed' | 'Cancelled';

export interface MedicalTest {
  id: string;
  testNumber: string; // e.g. "TST-40291"
  patientName: string;
  patientDOB: string;
  patientPhone: string;
  clinicianName: string; // Ordering clinician
  clinicianLicense: string;
  testType: string; // e.g. "Blood Glucose Panel", "Malaria RDT", "Full Blood Count"
  notes: string; // Clinical notes / reason for test
  dateOrdered: string;
  status: TestStatus;
  resultSummary?: string;
  resultDate?: string;
  linkedPrescriptionId?: string; // Optional follow-on prescription created from results
}

export interface CartItem {
  medication: Medication;
  quantity: number;
  prescriptionId?: string; // linked Rx if Rx item
  rxNumber?: string;
  patientName?: string;
  discountPercent?: number;
}

export interface POSTab {
  id: string;
  name: string; // e.g. "Tab 1", "Walk-in #1", "Grace Muthoni"
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
  receiptNumber: string;
  timestamp: string;
  cashierName: string;
  cashierRole: UserRole;
  items: {
    medicationId: string;
    name: string;
    genericName: string;
    dosage: string;
    isPrescription: boolean;
    rxNumber?: string;
    patientName?: string;
    quantity: number;
    unitPrice: number;
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
  licenseNumber: string; // State Pharmacy License or DEA
  taxId: string;
  taxRate: number; // e.g., 0.05 for 5%
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
  enableReceiptPrinting?: boolean; // Turn receipt printing on/off
  autoPrintReceipt?: boolean; // Auto print immediately upon checkout without dialog
  showReceiptDialog?: boolean; // Whether to show receipt modal after checkout
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
  category: string; // 'All' or specific category
  supplier: string; // 'All' or specific manufacturer
  stockStatus: 'all' | 'low' | 'rx' | 'otc' | 'expiring';
  expiryPreset: ExpiryFilterPreset;
  expiryStartDate: string; // 'YYYY-MM-DD'
  expiryEndDate: string; // 'YYYY-MM-DD'
}

