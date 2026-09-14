import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  FileText,
  Image as ImageIcon,
  Info,
  Lock,
  Printer,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Store,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { ReceiptSettings, UserRole } from '../types';
import { INITIAL_RECEIPT_SETTINGS } from '../data/mockData';
import { SupabaseDatabaseSettings } from './SupabaseDatabaseSettings';

const SAMPLE_LOGOS = [
  {
    name: 'Green Rx Cross',
    dataUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="24" fill="%230f766e"/><path d="M48 24h24v24h24v24H72v24H48V72H24V48h24z" fill="%23ffffff"/><circle cx="60" cy="60" r="8" fill="%230f766e"/></svg>',
  },
  {
    name: 'Mortar & Pestle',
    dataUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="56" fill="%231e293b"/><path d="M78 30l-8 8-16-4 12 12-4 4-22-22-6 6 22 22-8 8c-14 3-24 16-24 32h72c0-16-10-29-24-32l8-8 6 6 6-6-8-8z" fill="%23ffffff"/><rect x="36" y="98" width="48" height="6" rx="3" fill="%2314b8a6"/></svg>',
  },
  {
    name: 'Caduceus Rx',
    dataUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="20" fill="%23047857"/><path d="M60 16c-3 0-5 2-5 5v80c0 3 2 5 5 5s5-2 5-5V21c0-3-2-5-5-5z" fill="%23ffffff"/><path d="M38 32c12 2 18 10 22 18 4-8 10-16 22-18-12 10-14 26-6 38-8-2-12-6-16-12-4 6-8 10-16 12 8-12 6-28-6-38z" fill="%23a7f3d0"/><circle cx="60" cy="18" r="7" fill="%23fbbf24"/></svg>',
  },
];

function processAndOptimizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 200;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const format = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        resolve(canvas.toDataURL(format, 0.92));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

interface ReceiptSettingsViewProps {
  settings: ReceiptSettings;
  onSaveSettings: (settings: ReceiptSettings) => void;
  userRole: UserRole;
  onResetSystemData?: () => void;
  medicationCount?: number;
  transactionCount?: number;
  prescriptionCount?: number;
  auditLogCount?: number;
}

export const ReceiptSettingsView: React.FC<ReceiptSettingsViewProps> = ({
  settings,
  onSaveSettings,
  userRole,
  onResetSystemData,
  medicationCount = 0,
  transactionCount = 0,
  prescriptionCount = 0,
  auditLogCount = 0,
}) => {
  const [subTab, setSubTab] = useState<'receipt' | 'database' | 'reset'>('receipt');
  const [formData, setFormData] = useState<ReceiptSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [resetSuccessNotice, setResetSuccessNotice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = userRole === 'admin';

  const handleChange = <K extends keyof ReceiptSettings>(
    key: K,
    value: ReceiptSettings[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileSelect = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Invalid file type. Please upload an image (PNG, JPG, WebP, SVG).');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setUploadError('File exceeds 3MB limit. Please choose a smaller image.');
      return;
    }
    setUploadError(null);
    try {
      const dataUrl = await processAndOptimizeImage(file);
      setFormData((prev) => ({
        ...prev,
        logoUrl: dataUrl,
        showLogo: true,
        logoHeight: prev.logoHeight || 48,
      }));
    } catch {
      setUploadError('Error processing image. Please try another image.');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = () => {
    if (!isAdmin) return;
    setFormData({ ...INITIAL_RECEIPT_SETTINGS });
  };

  const handleTestPrint = () => {
    window.print();
  };

  const handleExecuteSystemReset = () => {
    if (!isAdmin || !onResetSystemData) return;
    if (resetConfirmInput.trim().toUpperCase() !== 'RESET') return;
    onResetSystemData();
    setIsResetModalOpen(false);
    setResetConfirmInput('');
    setResetSuccessNotice(true);
    setTimeout(() => setResetSuccessNotice(false), 6000);
  };

  return (
    <div className="space-y-6">
      {/* Reset Success Notice */}
      {resetSuccessNotice && (
        <div className="bg-emerald-900 border border-emerald-700 text-white px-5 py-4 rounded-2xl shadow-md flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-800 text-emerald-300 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold">System Successfully Reset</h4>
              <p className="text-xs text-emerald-200">
                All inventory stock, sales transactions, prescriptions, and app activity logs have been wiped. Shop profile for &ldquo;{formData.pharmacyName}&rdquo; has been preserved.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setResetSuccessNotice(false)}
            className="text-emerald-300 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Admin Settings & Receipt Customization</h1>
            <p className="text-xs text-slate-500">
              Configure pharmacy identity, thermal receipts, cloud database, and system-wide maintenance
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isAdmin && (
            <div className="flex items-center gap-2 bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Lock className="w-4 h-4 text-slate-500" />
              <span>Staff View-Only (Admin permissions required to modify)</span>
            </div>
          )}

          {isAdmin && (
            <>
              {/* SYSTEM RESET BUTTON (ADMIN) */}
              <button
                type="button"
                id="top-system-reset-btn"
                onClick={() => {
                  setResetConfirmInput('');
                  setIsResetModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
                title="Wipe stock, sales, and app activity while keeping shop details"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Reset System Data</span>
              </button>

              {subTab === 'receipt' && (
                <>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Reset Defaults</span>
                  </button>
                  <button
                    type="button"
                    id="save-receipt-settings-btn"
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    {savedSuccess ? <Check className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
                    <span>{savedSuccess ? 'Settings Saved!' : 'Save Changes'}</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setSubTab('receipt')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'receipt'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Receipt Customization</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('database')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'database'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Supabase Cloud Database & Schema</span>
        </button>

        <button
          type="button"
          id="system-reset-tab-btn"
          onClick={() => setSubTab('reset')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'reset'
              ? 'bg-rose-700 text-white shadow-xs'
              : 'text-rose-700 hover:bg-rose-50 border border-rose-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>System Data Reset</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
            subTab === 'reset' ? 'bg-rose-800 text-rose-100' : 'bg-rose-100 text-rose-700'
          }`}>Admin</span>
        </button>
      </div>

      {subTab === 'database' ? (
        <SupabaseDatabaseSettings isAdmin={isAdmin} />
      ) : subTab === 'reset' ? (
        <div className="space-y-6">
          {/* Main Hero Warning / Overview */}
          <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-6 sm:p-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-extrabold text-rose-950">Factory System Data Reset</h2>
                    <span className="bg-rose-200 text-rose-900 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                      Admin Only
                    </span>
                  </div>
                  <p className="text-sm text-rose-800">
                    Purge operational inventory, sales transactions, prescriptions, and app activity while safely preserving your pharmacy shop profile, license, and user credentials.
                  </p>
                </div>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  id="open-reset-modal-hero-btn"
                  onClick={() => {
                    setResetConfirmInput('');
                    setIsResetModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-sm shadow-md transition active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Start System Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Side-by-side comparison: What gets deleted vs What is preserved */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Red Card: What is DELETED */}
            <div className="bg-white rounded-2xl border-2 border-rose-200 p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-rose-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Data to be Deleted</h3>
                </div>
                <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                  Permanent Wipe
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-start justify-between p-3 rounded-xl bg-rose-50/60 border border-rose-100">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">Stock Inventory</div>
                    <div className="text-slate-600 text-[11px]">All medication stock, batch lots, and inventory levels</div>
                  </div>
                  <span className="font-extrabold text-rose-700 bg-white px-2 py-1 rounded-md shadow-2xs">
                    {medicationCount} items
                  </span>
                </div>

                <div className="flex items-start justify-between p-3 rounded-xl bg-rose-50/60 border border-rose-100">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">Sales Transactions & Receipts</div>
                    <div className="text-slate-600 text-[11px]">All sales history, revenue numbers, and customer receipts</div>
                  </div>
                  <span className="font-extrabold text-rose-700 bg-white px-2 py-1 rounded-md shadow-2xs">
                    {transactionCount} sales
                  </span>
                </div>

                <div className="flex items-start justify-between p-3 rounded-xl bg-rose-50/60 border border-rose-100">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">Prescriptions</div>
                    <div className="text-slate-600 text-[11px]">All dispensary prescriptions and patient orders</div>
                  </div>
                  <span className="font-extrabold text-rose-700 bg-white px-2 py-1 rounded-md shadow-2xs">
                    {prescriptionCount} Rx
                  </span>
                </div>

                <div className="flex items-start justify-between p-3 rounded-xl bg-rose-50/60 border border-rose-100">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">App Activity & Audit Logs</div>
                    <div className="text-slate-600 text-[11px]">Past activity logs, stock adjustment logs & audit trail</div>
                  </div>
                  <span className="font-extrabold text-rose-700 bg-white px-2 py-1 rounded-md shadow-2xs">
                    {auditLogCount} logs
                  </span>
                </div>

                <div className="flex items-start justify-between p-3 rounded-xl bg-rose-50/60 border border-rose-100">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">Active / Parked POS Carts</div>
                    <div className="text-slate-600 text-[11px]">Multi-customer checkout tabs and pending cart items</div>
                  </div>
                  <span className="font-extrabold text-rose-700 bg-white px-2 py-1 rounded-md shadow-2xs">
                    Cleared
                  </span>
                </div>
              </div>
            </div>

            {/* Green Card: What is PRESERVED */}
            <div className="bg-white rounded-2xl border-2 border-emerald-200 p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Shop Details Kept Intact</h3>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  100% Retained
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">Pharmacy / Shop Name:</span>
                    <p className="text-emerald-950 font-semibold">{formData.pharmacyName}</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">Slogan / Tagline:</span>
                    <p className="text-slate-700">{formData.tagline || 'Licensed Chemists & Medical Suppliers'}</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">Physical Address & Contact Info:</span>
                    <p className="text-slate-700">
                      {formData.addressLine1} {formData.addressLine2 ? `, ${formData.addressLine2}` : ''} | Tel: {formData.phone}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">Regulatory License & KRA Tax PIN:</span>
                    <p className="text-slate-700 font-mono">
                      License: {formData.licenseNumber} | Tax PIN: {formData.taxId} (VAT: {Math.round(formData.taxRate * 100)}%)
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">Branding, Logo & Thermal Printer Setup:</span>
                    <p className="text-slate-700">
                      Paper width ({formData.paperWidth}), disclaimers, return policy, and logo image.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">User Accounts & Admin Session:</span>
                    <p className="text-slate-700">
                      Staff accounts and your active logged-in admin session remain active.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Safe Confirmation Box */}
          {isAdmin ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-5 shadow-xs">
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900">Confirm System Data Wipe</h3>
                <p className="text-xs text-slate-500">
                  To prevent accidental loss of operational inventory and financial history, type <strong className="font-mono text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">RESET</strong> below to confirm.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  id="reset-confirmation-input"
                  value={resetConfirmInput}
                  onChange={(e) => setResetConfirmInput(e.target.value)}
                  placeholder="Type RESET to confirm..."
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-500 max-w-xs"
                />

                <button
                  type="button"
                  id="execute-system-reset-btn"
                  disabled={resetConfirmInput.trim().toUpperCase() !== 'RESET'}
                  onClick={handleExecuteSystemReset}
                  className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm shadow-xs transition cursor-pointer active:scale-95 ${
                    resetConfirmInput.trim().toUpperCase() === 'RESET'
                      ? 'bg-rose-700 hover:bg-rose-800 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Wipe Stock, Sales & Activity (Keep Shop Details)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 font-semibold">
              System data reset is restricted to authorized Administrators only.
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Form configuration */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Section: Pharmacy Logo Upload & Thermal Branding */}
            <div className="rounded-2xl border border-slate-200 p-5 bg-slate-50/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-600/10 text-teal-700 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Pharmacy Logo Image</h3>
                    <p className="text-xs text-slate-500">
                      Upload your official pharmacy crest or dispensary logo for thermal receipts
                    </p>
                  </div>
                </div>

                {formData.logoUrl && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={formData.showLogo ?? true}
                      onChange={(e) => handleChange('showLogo', e.target.checked)}
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Print on Receipts</span>
                  </label>
                )}
              </div>

              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Logo Preview & Controls if Logo Exists */}
              {formData.logoUrl ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Standard Color Preview Card */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center flex flex-col items-center justify-center space-y-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Original Color Image
                      </span>
                      <div className="h-20 w-full flex items-center justify-center p-2 rounded-lg bg-slate-50 border border-dashed border-slate-200">
                        <img
                          src={formData.logoUrl}
                          alt="Pharmacy Logo"
                          referrerPolicy="no-referrer"
                          className="max-h-16 max-w-full object-contain"
                        />
                      </div>
                    </div>

                    {/* Thermal Paper Simulation Preview Card */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center flex flex-col items-center justify-center space-y-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Thermal Paper Simulation
                      </span>
                      <div className="h-20 w-full flex items-center justify-center p-2 rounded-lg bg-neutral-100 border border-dashed border-slate-300">
                        <img
                          src={formData.logoUrl}
                          alt="Thermal Simulated Logo"
                          referrerPolicy="no-referrer"
                          className="max-h-16 max-w-full object-contain filter grayscale contrast-125"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Size & Adjustments */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">Receipt Height:</span>
                      <div className="flex items-center gap-1">
                        {[
                          { label: 'Compact', h: 36 },
                          { label: 'Standard', h: 48 },
                          { label: 'Medium', h: 60 },
                          { label: 'Large', h: 72 },
                        ].map((size) => (
                          <button
                            key={size.h}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => handleChange('logoHeight', size.h)}
                            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                              (formData.logoHeight || 48) === size.h
                                ? 'bg-teal-700 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {size.label} ({size.h}px)
                          </button>
                        ))}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          Change Image
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('logoUrl', '');
                            setUploadError(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Empty State Upload Dropzone */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (isAdmin) setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (!isAdmin) return;
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => {
                    if (isAdmin) fileInputRef.current?.click();
                  }}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer ${
                    isDragging
                      ? 'border-teal-500 bg-teal-50/50 scale-[1.01]'
                      : 'border-slate-300 hover:border-teal-500 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    Click to upload or drag & drop pharmacy logo
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    PNG with transparency, SVG, or JPG (max 3MB). High contrast images print best on thermal paper.
                  </p>
                </div>
              )}

              {/* Sample Presets */}
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Sample Templates:</span>
                {SAMPLE_LOGOS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        logoUrl: sample.dataUrl,
                        showLogo: true,
                        logoHeight: prev.logoHeight || 48,
                      }));
                      setUploadError(null);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 text-slate-700 font-medium transition cursor-pointer"
                  >
                    <img
                      src={sample.dataUrl}
                      alt={sample.name}
                      referrerPolicy="no-referrer"
                      className="w-3.5 h-3.5 object-contain rounded-xs"
                    />
                    <span>{sample.name}</span>
                  </button>
                ))}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                disabled={!isAdmin}
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
            </div>

            {/* Section 1: Store & Pharmacy Identity */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                Pharmacy Branding & Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pharmacy Legal / DBA Name
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.pharmacyName}
                    onChange={(e) => handleChange('pharmacyName', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.tagline}
                    onChange={(e) => handleChange('tagline', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.addressLine1}
                    onChange={(e) => handleChange('addressLine1', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City, State, ZIP
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.addressLine2}
                    onChange={(e) => handleChange('addressLine2', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    disabled={!isAdmin}
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pharmacy License / DEA Number
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.licenseNumber}
                    onChange={(e) => handleChange('licenseNumber', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tax ID / EIN
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.taxId}
                    onChange={(e) => handleChange('taxId', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Printer & Paper Setup */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
                <Printer className="w-4 h-4 text-teal-600" />
                Thermal Paper & Tax Format
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thermal Paper Width
                  </label>
                  <select
                    disabled={!isAdmin}
                    value={formData.paperWidth}
                    onChange={(e) => handleChange('paperWidth', e.target.value as '80mm' | '58mm')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 bg-white"
                  >
                    <option value="80mm">80mm (Standard POS Receipt)</option>
                    <option value="58mm">58mm (Compact Mobile Thermal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sales Tax Rate (% decimal, e.g. 0.06 = 6%)
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    min="0"
                    max="0.30"
                    disabled={!isAdmin}
                    value={formData.taxRate}
                    onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Custom Messages & Disclaimers */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600" />
                Custom Messages & Disclaimers
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Header Greeting Message
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.headerMessage}
                    onChange={(e) => handleChange('headerMessage', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Footer Medication Safety Message
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isAdmin}
                    value={formData.footerMessage}
                    onChange={(e) => handleChange('footerMessage', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prescription Return Policy Notice
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isAdmin}
                    value={formData.returnPolicy}
                    onChange={(e) => handleChange('returnPolicy', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Emergency Helpline / Poison Control
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.emergencyPhone}
                    onChange={(e) => handleChange('emergencyPhone', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Display Options Toggles */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100">
                Itemized Receipt Element Toggles
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showLogo ?? true}
                    onChange={(e) => handleChange('showLogo', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Print Pharmacy Logo</span>
                    <span className="text-[11px] text-slate-500">Prints uploaded logo on thermal paper</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showGenericName}
                    onChange={(e) => handleChange('showGenericName', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Show Generic Name</span>
                    <span className="text-[11px] text-slate-500">Prints chemical/generic drug name</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showPrescriptionDetails}
                    onChange={(e) => handleChange('showPrescriptionDetails', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Show Rx Number</span>
                    <span className="text-[11px] text-slate-500">Prints Rx reference for insurance</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showPharmacistName}
                    onChange={(e) => handleChange('showPharmacistName', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Show Dispenser Name</span>
                    <span className="text-[11px] text-slate-500">Prints cashier/pharmacist on duty</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showBarcode}
                    onChange={(e) => handleChange('showBarcode', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Print Bottom Barcode</span>
                    <span className="text-[11px] text-slate-500">Includes scannable transaction barcode</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showTaxBreakdown}
                    onChange={(e) => handleChange('showTaxBreakdown', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Tax Breakdown</span>
                    <span className="text-[11px] text-slate-500">Shows subtotal and tax percentage</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Section 5: Thermal Printing Automation & Dialogue Behavior */}
            <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-teal-200/80">
                <Printer className="w-5 h-5 text-teal-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Thermal Printing & Checkout Behavior</h3>
                  <p className="text-xs text-slate-500">
                    Control automated hardware printing and dialogue popups after sales
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                {/* Master Toggle: Enable Receipt Printing */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer shadow-2xs">
                  <input
                    type="checkbox"
                    id="enable-receipt-printing-toggle"
                    disabled={!isAdmin}
                    checked={formData.enableReceiptPrinting ?? true}
                    onChange={(e) => handleChange('enableReceiptPrinting', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Enable Receipt Printing</span>
                    <span className="text-[11px] text-slate-600 leading-normal block mt-0.5">
                      Turn receipt printing on or off. When disabled, checkout completes silently without sending print jobs.
                    </span>
                  </div>
                </label>

                {/* Auto Print Receipt Immediately */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer shadow-2xs">
                  <input
                    type="checkbox"
                    id="auto-print-receipt-toggle"
                    disabled={!isAdmin || formData.enableReceiptPrinting === false}
                    checked={(formData.enableReceiptPrinting ?? true) && (formData.autoPrintReceipt ?? true)}
                    onChange={(e) => handleChange('autoPrintReceipt', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Auto-Print Receipt Upon Checkout</span>
                    <span className="text-[11px] text-slate-600 leading-normal block mt-0.5">
                      Automatically fires the thermal print job immediately when a sale is finalized.
                    </span>
                  </div>
                </label>

                {/* Show in-app dialogue */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer shadow-2xs">
                  <input
                    type="checkbox"
                    id="show-receipt-dialog-toggle"
                    disabled={!isAdmin}
                    checked={formData.showReceiptDialog ?? false}
                    onChange={(e) => handleChange('showReceiptDialog', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Show In-App Receipt Modal Dialogue</span>
                    <span className="text-[11px] text-slate-600 leading-normal block mt-0.5">
                      When unchecked (recommended for speed), no popup modal appears after checkout. The cashier stays directly on the terminal for the next customer.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Danger Zone: System Data Reset */}
            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-rose-950 uppercase tracking-wider">
                      Danger Zone: Factory Data Reset
                    </h4>
                    <p className="text-xs text-rose-800">
                      Wipe stock inventory, sales transactions & app activity while preserving shop details
                    </p>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    id="danger-zone-system-reset-btn"
                    onClick={() => {
                      setResetConfirmInput('');
                      setIsResetModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset Stock & Sales</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Clears all registered stock medications, sales transactions, customer tabs, and past activity logs.
                Your shop identity (<strong className="text-slate-900 font-semibold">{formData.pharmacyName}</strong>), physical address, KRA PIN, license number, and logo are 100% retained.
              </p>
            </div>

            {isAdmin && (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Save Receipt Customization
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Right column: Live Interactive Thermal Receipt Preview */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full bg-slate-900 text-white px-4 py-2.5 rounded-t-2xl flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-2">
              <Printer className="w-4 h-4 text-teal-400" />
              Live Thermal Output Preview ({formData.paperWidth})
            </span>
            <button
              onClick={handleTestPrint}
              className="text-[11px] bg-teal-700 hover:bg-teal-600 text-white font-semibold px-2.5 py-1 rounded-lg transition"
            >
              Test Print
            </button>
          </div>

          <div className="w-full bg-slate-200 p-6 rounded-b-2xl border border-slate-300 flex justify-center overflow-x-auto shadow-inner">
            <div
              className={`bg-white text-black p-5 shadow-xl border border-slate-300 font-mono-receipt text-[11px] leading-snug transition-all ${
                formData.paperWidth === '58mm' ? 'w-[250px]' : 'w-[310px]'
              }`}
            >
              {/* Header */}
              <div className="text-center pb-2.5 border-b border-dashed border-slate-400 space-y-0.5">
                {(formData.showLogo ?? true) && formData.logoUrl && (
                  <div className="flex justify-center pb-1.5">
                    <img
                      src={formData.logoUrl}
                      alt={formData.pharmacyName}
                      referrerPolicy="no-referrer"
                      style={{ maxHeight: `${formData.logoHeight || 48}px` }}
                      className="max-w-[140px] object-contain filter grayscale contrast-125 transition-all"
                    />
                  </div>
                )}
                <h3 className="font-bold text-sm tracking-wider uppercase m-0">
                  {formData.pharmacyName || 'PHARMACY NAME'}
                </h3>
                <p className="text-[10px] text-slate-600">{formData.tagline}</p>
                <p className="text-[10px] text-slate-600">{formData.addressLine1}</p>
                <p className="text-[10px] text-slate-600">{formData.addressLine2}</p>
                <p className="text-[10px] text-slate-600">Tel: {formData.phone}</p>
                <p className="text-[9px] text-slate-500">{formData.licenseNumber}</p>
                {formData.taxId && <p className="text-[9px] text-slate-500">{formData.taxId}</p>}
                {formData.headerMessage && (
                  <p className="text-[9px] font-semibold text-slate-700 pt-1">
                    "{formData.headerMessage}"
                  </p>
                )}
              </div>

              {/* Sample Meta */}
              <div className="py-2 border-b border-dashed border-slate-400 text-[10px] space-y-0.5">
                <div className="flex justify-between">
                  <span>RECEIPT:</span>
                  <span className="font-bold">#RX-2026-9041</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE:</span>
                  <span>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {formData.showPharmacistName && (
                  <div className="flex justify-between">
                    <span>DISPENSER:</span>
                    <span>Dr. Sarah Jenkins, PharmD</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>PAYMENT:</span>
                  <span className="font-bold">Credit/Debit Card</span>
                </div>
                <div className="flex justify-between">
                  <span>PATIENT:</span>
                  <span>Eleanor Vance</span>
                </div>
              </div>

              {/* Sample Items */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>Amoxicillin 500mg</span>
                    <span>KSh 1,850.00</span>
                  </div>
                  {formData.showGenericName && (
                    <div className="text-[9px] text-slate-500 italic">Gen: Amoxicillin Trihydrate</div>
                  )}
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>1 x KSh 1,850.00</span>
                    {formData.showPrescriptionDetails && (
                      <span className="bg-slate-100 font-bold px-1 rounded text-[9px]">Rx: RX-80219</span>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>Ibuprofen 400mg Forte</span>
                    <span>KSh 875.00</span>
                  </div>
                  {formData.showGenericName && (
                    <div className="text-[9px] text-slate-500 italic">Gen: Ibuprofen</div>
                  )}
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>1 x KSh 875.00</span>
                    <span className="text-[9px] text-slate-500">OTC Item</span>
                  </div>
                </div>
              </div>

              {/* Sample Totals */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span>KSh 2,725.00</span>
                </div>
                {formData.showTaxBreakdown && (
                  <div className="flex justify-between text-slate-600">
                    <span>TAX ({Math.round(formData.taxRate * 100)}%):</span>
                    <span>KSh {(2725 * formData.taxRate).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-300">
                  <span>TOTAL:</span>
                  <span>KSh {(2725 * (1 + formData.taxRate)).toFixed(2)}</span>
                </div>
              </div>

              {/* Sample Footer */}
              <div className="pt-2.5 text-center space-y-1 text-[9px] text-slate-600">
                <p className="font-semibold">{formData.footerMessage}</p>
                {formData.returnPolicy && <p className="text-[8px] text-slate-500 leading-tight">{formData.returnPolicy}</p>}
                <p className="font-bold text-slate-800">{formData.emergencyPhone}</p>

                {formData.showBarcode && (
                  <div className="pt-2 flex flex-col items-center">
                    <div className="h-8 w-36 bg-slate-100 border border-slate-300 flex items-center justify-center font-mono tracking-widest text-[9px] font-bold">
                      |||||||||||||||||||||||
                    </div>
                    <span className="text-[8px] font-mono text-slate-500 mt-0.5">*RX-2026-9041*</span>
                  </div>
                )}

                <p className="text-[8px] text-slate-400 pt-1">*** END OF RECEIPT ***</p>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* SYSTEM RESET CONFIRMATION MODAL DIALOG */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-rose-200 overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="bg-rose-50 border-b border-rose-100 p-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-rose-950">Factory System Data Reset</h3>
                    <span className="bg-rose-200 text-rose-800 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  </div>
                  <p className="text-xs text-rose-800 mt-0.5">
                    Delete stock, sales & app activity while retaining shop details
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-white/80 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5">
              <div className="p-3.5 bg-rose-50/70 rounded-2xl border border-rose-200 text-xs text-rose-900 leading-relaxed">
                <strong>Attention:</strong> This will permanently delete all inventory medications, recorded sales receipts, customer carts, and operational activity logs.
              </div>

              {/* Data Summary Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Wiped list */}
                <div className="p-3.5 bg-rose-50/40 rounded-2xl border border-rose-100 space-y-1.5">
                  <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">
                    Will be deleted:
                  </span>
                  <ul className="space-y-1 text-slate-700 text-[11px]">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      <span>Stock inventory ({medicationCount} meds)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      <span>Sales & receipts ({transactionCount} sales)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      <span>Prescriptions ({prescriptionCount} records)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      <span>Activity logs ({auditLogCount} logs)</span>
                    </li>
                  </ul>
                </div>

                {/* Retained list */}
                <div className="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-1.5">
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">
                    Will be kept:
                  </span>
                  <ul className="space-y-1 text-slate-700 text-[11px]">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate"><strong>{formData.pharmacyName}</strong></span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Address & phone</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>KRA PIN: {formData.taxId}</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Printer settings & logo</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Admin user accounts</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Confirmation Input Field */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-slate-800">
                  Type <span className="font-mono text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">RESET</span> to confirm:
                </label>
                <input
                  type="text"
                  id="modal-reset-input"
                  value={resetConfirmInput}
                  onChange={(e) => setResetConfirmInput(e.target.value)}
                  placeholder="Type RESET"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
              >
                Cancel / Keep Data
              </button>
              <button
                type="button"
                id="modal-confirm-reset-btn"
                disabled={resetConfirmInput.trim().toUpperCase() !== 'RESET'}
                onClick={handleExecuteSystemReset}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-xs transition cursor-pointer active:scale-95 ${
                  resetConfirmInput.trim().toUpperCase() === 'RESET'
                    ? 'bg-rose-700 hover:bg-rose-800 text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Wipe Stock & Sales (Keep Shop)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
