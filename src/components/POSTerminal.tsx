import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  Camera,
  Check,
  CornerDownLeft,
  CreditCard,
  Edit2,
  FileCheck,
  Layers,
  Minus,
  PauseCircle,
  Pill,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Smartphone,
  Split,
  Trash2,
  User,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  CartItem,
  Medication,
  MedicationCategory,
  PaymentMethod,
  POSTab,
  Prescription,
  ReceiptSettings,
  SaleTransaction,
  UserRole,
} from '../types';
import { playScanSuccessBeep } from '../utils/audio';
import { formatKSh } from '../utils/currency';
import { storageService } from '../services/storage';

interface POSTerminalProps {
  medications: Medication[];
  prescriptions: Prescription[];
  cart: CartItem[];
  onUpdateCart: (newCart: CartItem[]) => void;
  onCompleteSale: (transaction: SaleTransaction) => void;
  onOpenScanner: () => void;
  receiptSettings: ReceiptSettings;
  isOnline: boolean;
  currentUser: { name: string; role: UserRole };
  // Tab Management Props
  tabs?: POSTab[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onAddTab?: (customName?: string) => void;
  onCloseTab?: (tabId: string) => void;
  onRenameTab?: (tabId: string, newName: string) => void;
  onToggleParkTab?: (tabId: string) => void;
  activePatientName?: string;
  onUpdatePatientName?: (name: string) => void;
}

export const POSTerminal: React.FC<POSTerminalProps> = ({
  medications,
  prescriptions,
  cart,
  onUpdateCart,
  onCompleteSale,
  onOpenScanner,
  receiptSettings,
  isOnline,
  currentUser,
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab,
  onToggleParkTab,
  activePatientName,
  onUpdatePatientName,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [barcodeQuickInput, setBarcodeQuickInput] = useState('');
  const [patientNameInput, setPatientNameInput] = useState(() => activePatientName || storageService.getCartPatientName());

  // Tab editing state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTabName, setEditTabName] = useState('');

  const currentTab = tabs?.find((t) => t.id === activeTabId);

  // Sync patient name input when active tab changes
  useEffect(() => {
    if (activePatientName !== undefined) {
      setPatientNameInput(activePatientName);
    } else if (currentTab) {
      setPatientNameInput(currentTab.patientName || '');
    }
  }, [activeTabId, activePatientName, currentTab?.patientName]);

  const handlePatientNameChange = (name: string) => {
    setPatientNameInput(name);
    if (onUpdatePatientName) {
      onUpdatePatientName(name);
    } else {
      storageService.saveCartPatientName(name);
    }
  };

  // Quick Add search state for rapid typing & enter checkout
  const [quickAddInput, setQuickAddInput] = useState('');
  const [quickAddFeedback, setQuickAddFeedback] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error';
  } | null>(null);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts:
  // Alt+Q: Jump focus to Quick Add
  // Alt+N: New customer order tab
  // Alt+H: Hold/Park active tab
  // Alt+W: Close active tab
  // Alt+1 to Alt+9: Switch to tab 1-9
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+Q: Quick Add Focus
      if (e.altKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        quickAddInputRef.current?.focus();
        quickAddInputRef.current?.select();
        return;
      }

      // Alt+N: New Tab
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (onAddTab) {
          onAddTab();
        }
        return;
      }

      // Alt+H: Hold / Park current tab
      if (e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        if (currentTab && onToggleParkTab) {
          onToggleParkTab(currentTab.id);
        }
        return;
      }

      // Alt+W: Close current tab
      if (e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (currentTab && onCloseTab) {
          onCloseTab(currentTab.id);
        }
        return;
      }

      // Alt+1 to Alt+9: Switch to tab by index
      if (e.altKey && /^[1-9]$/.test(e.key) && tabs && tabs.length > 0) {
        const tabIdx = parseInt(e.key, 10) - 1;
        if (tabs[tabIdx] && onSelectTab) {
          e.preventDefault();
          onSelectTab(tabs[tabIdx].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAddTab, onToggleParkTab, onCloseTab, onSelectTab, currentTab, tabs]);

  // Compute the first matching medication with prefix priority for Quick Add
  const normalizedQuickAdd = quickAddInput.trim().toLowerCase();
  const firstQuickAddMatch = normalizedQuickAdd
    ? medications
        .slice()
        .sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(normalizedQuickAdd);
          const bStarts = b.name.toLowerCase().startsWith(normalizedQuickAdd);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          const aGenStarts = a.genericName.toLowerCase().startsWith(normalizedQuickAdd);
          const bGenStarts = b.genericName.toLowerCase().startsWith(normalizedQuickAdd);
          if (aGenStarts && !bGenStarts) return -1;
          if (!aGenStarts && bGenStarts) return 1;
          return 0;
        })
        .find(
          (m) =>
            m.name.toLowerCase().includes(normalizedQuickAdd) ||
            m.genericName.toLowerCase().includes(normalizedQuickAdd) ||
            m.barcode.toLowerCase() === normalizedQuickAdd
        )
    : null;

  // Payment checkout modal state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');

  // Tender states
  const [cashTendered, setCashTendered] = useState<number>(0);

  // M-Pesa states
  const [mpesaPhone, setMpesaPhone] = useState<string>('07');
  const [mpesaReference, setMpesaReference] = useState<string>('');

  // Partial payment states (Cash + M-Pesa)
  const [partialCash, setPartialCash] = useState<number>(0);
  const [partialMpesa, setPartialMpesa] = useState<number>(0);

  // Card payment states
  const [cardBankTerminal, setCardBankTerminal] = useState('Equity Bank PDQ');
  const [cardType, setCardType] = useState('Visa Debit');
  const [cardLast4, setCardLast4] = useState('');
  const [cardAuthCode, setCardAuthCode] = useState('');

  // Insurance payment states
  const [insuranceProvider, setInsuranceProvider] = useState('Social Health Authority (SHA / NHIF)');
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState('');
  const [insuranceAuthCode, setInsuranceAuthCode] = useState('');

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [mobilePosTab, setMobilePosTab] = useState<'catalog' | 'cart'>('catalog');

  const categories: (string | MedicationCategory)[] = [
    'All',
    'Antibiotics',
    'Cardiovascular',
    'Pain & Analgesics',
    'OTC & First Aid',
    'Diabetes',
    'Respiratory',
    'Vitamins & Supplements',
  ];

  // Helper date checkers
  const isExpired = (dateStr: string) => {
    return new Date(dateStr).getTime() < new Date().getTime();
  };

  const isExpiringSoon = (dateStr: string) => {
    const diffDays = (new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 90;
  };

  // Filter medications
  const filteredMedications = medications.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.barcode.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (selectedCategory !== 'All' && m.category !== selectedCategory) return false;
    return true;
  });

  // Cart operations
  const handleAddToCart = (med: Medication, prescription?: Prescription) => {
    // Safety check: block dispensing expired medicine
    if (isExpired(med.expiryDate)) {
      alert(`SAFETY BLOCK: Cannot dispense expired medication!\n\n${med.name} (Batch ${med.batchNumber}) expired on ${med.expiryDate}.\nThis item has been flagged for immediate pharmacy quarantine.`);
      return;
    }

    const existingIndex = cart.findIndex((item) => item.medication.id === med.id);

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (currentQty + 1 > med.stock) {
        alert(`Stock limit reached! Only ${med.stock} units available in pharmacy.`);
        return;
      }
      const updated = [...cart];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: currentQty + 1,
      };
      onUpdateCart(updated);
    } else {
      if (med.stock < 1) {
        alert(`Cannot add out-of-stock medication: ${med.name}`);
        return;
      }

      // Calculate co-pay discount if prescribed with insurance
      let itemDiscount = 0;
      if (prescription && prescription.insuranceCoPayRate !== undefined) {
        itemDiscount = (1 - prescription.insuranceCoPayRate) * 100;
      }

      const newItem: CartItem = {
        medication: med,
        quantity: 1,
        prescriptionId: prescription?.id,
        rxNumber: prescription?.rxNumber,
        patientName: prescription?.patientName,
        discountPercent: itemDiscount,
      };

      if (prescription?.patientName && !patientNameInput) {
        handlePatientNameChange(prescription.patientName);
      }

      onUpdateCart([...cart, newItem]);
    }

    playScanSuccessBeep();
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    const item = cart[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      handleRemoveFromCart(index);
      return;
    }

    if (newQty > item.medication.stock) {
      alert(`Cannot exceed current shelf stock of ${item.medication.stock} units.`);
      return;
    }

    const updated = [...cart];
    updated[index] = { ...item, quantity: newQty };
    onUpdateCart(updated);
  };

  const handleSetExactQuantity = (index: number, qty: number) => {
    const item = cart[index];
    if (isNaN(qty) || qty <= 0) return;
    const clamped = Math.min(qty, item.medication.stock);
    const updated = [...cart];
    updated[index] = { ...item, quantity: clamped };
    onUpdateCart(updated);
  };

  const handleRemoveFromCart = (index: number) => {
    const updated = cart.filter((_, i) => i !== index);
    onUpdateCart(updated);
    if (updated.length === 0) {
      handlePatientNameChange('');
    }
  };

  const handleClearCart = () => {
    if (cart.length > 0 && !window.confirm('Are you sure you want to clear all items from the current cart?')) {
      return;
    }
    onUpdateCart([]);
    handlePatientNameChange('');
    storageService.clearCart();
  };

  // Quick barcode input handler
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeQuickInput.trim();
    if (!code) return;

    // First check prescriptions
    const matchedRx = prescriptions.find(
      (r) => r.rxNumber.toLowerCase() === code.toLowerCase() || r.barcode.toLowerCase() === code.toLowerCase()
    );

    if (matchedRx) {
      const med = medications.find((m) => m.id === matchedRx.medicationId);
      if (med) {
        handleAddToCart(med, matchedRx);
        setBarcodeQuickInput('');
        return;
      }
    }

    // Check medications
    const matchedMed = medications.find(
      (m) => m.barcode.toLowerCase() === code.toLowerCase() || m.id.toLowerCase() === code.toLowerCase()
    );

    if (matchedMed) {
      handleAddToCart(matchedMed);
      setBarcodeQuickInput('');
      return;
    }

    alert(`Barcode "${code}" not found. Try scanning with camera or searching by drug name.`);
  };

  // Quick Add submit handler (Typing partial name and pressing Enter immediately adds top match to cart)
  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = quickAddInput.trim();
    if (!query) return;

    if (!firstQuickAddMatch) {
      setQuickAddFeedback({
        text: `No medication found matching "${query}"`,
        type: 'error',
      });
      setTimeout(() => setQuickAddFeedback(null), 3000);
      return;
    }

    // Safety check: cannot dispense expired medication
    if (isExpired(firstQuickAddMatch.expiryDate)) {
      setQuickAddFeedback({
        text: `SAFETY BLOCK: ${firstQuickAddMatch.name} is expired (${firstQuickAddMatch.expiryDate})!`,
        type: 'error',
      });
      setTimeout(() => setQuickAddFeedback(null), 3500);
      return;
    }

    // Stock availability check
    if (firstQuickAddMatch.stock < 1) {
      setQuickAddFeedback({
        text: `Cannot add: ${firstQuickAddMatch.name} is out of stock!`,
        type: 'warning',
      });
      setTimeout(() => setQuickAddFeedback(null), 3000);
      return;
    }

    // Quantity check against cart
    const existingInCart = cart.find((i) => i.medication.id === firstQuickAddMatch.id);
    if (existingInCart && existingInCart.quantity + 1 > firstQuickAddMatch.stock) {
      setQuickAddFeedback({
        text: `Stock limit reached (${firstQuickAddMatch.stock} units available on shelf).`,
        type: 'warning',
      });
      setTimeout(() => setQuickAddFeedback(null), 3000);
      return;
    }

    handleAddToCart(firstQuickAddMatch);
    setQuickAddFeedback({
      text: `Added ${firstQuickAddMatch.name} (${firstQuickAddMatch.dosage}) to cart!`,
      type: 'success',
    });
    setQuickAddInput('');
    setTimeout(() => setQuickAddFeedback(null), 2500);

    // Keep input focused for rapid subsequent entries
    quickAddInputRef.current?.focus();
  };

  // Financial calculations in Kenyan Shillings
  const subtotal = cart.reduce((acc, item) => {
    const basePrice = item.medication.price * item.quantity;
    const discount = item.discountPercent ? (basePrice * item.discountPercent) / 100 : 0;
    return acc + (basePrice - discount);
  }, 0);

  const cartDiscount = (subtotal * discountPercent) / 100;
  const taxableAmount = Math.max(0, subtotal - cartDiscount);
  const tax = taxableAmount * (receiptSettings.taxRate || 0.16);
  const total = Math.round((taxableAmount + tax) * 100) / 100;

  // Change calculations depending on payment method
  let changeDue = 0;
  if (paymentMethod === 'Cash') {
    changeDue = Math.max(0, cashTendered - total);
  } else if (paymentMethod === 'Partial (Cash + M-Pesa)') {
    const totalPartialTendered = partialCash + partialMpesa;
    changeDue = Math.max(0, totalPartialTendered - total);
  }

  // Trigger Checkout
  const handleStartCheckout = () => {
    if (cart.length === 0) return;

    // Safety check for expired items in cart
    const expiredItem = cart.find((item) => isExpired(item.medication.expiryDate));
    if (expiredItem) {
      alert(`SAFETY BLOCK: Cart contains expired medication "${expiredItem.medication.name}" (expired ${expiredItem.medication.expiryDate}). Please remove it before proceeding to checkout.`);
      return;
    }

    const roundedTotal = Math.ceil(total);
    setCashTendered(roundedTotal);

    // Default partial: 50% cash, remainder M-Pesa
    const half = Math.round(roundedTotal / 2);
    setPartialCash(half);
    setPartialMpesa(Math.max(0, roundedTotal - half));

    // Generate random codes
    handleGenerateMpesaCode();
    handleGenerateCardAuthCode();
    if (!insuranceAuthCode) {
      handleGenerateInsuranceClaimCode();
    }

    setCheckoutError(null);
    setIsCheckoutOpen(true);
  };

  // One-Click Fast Cash Checkout for straight-forward OTC transactions
  const handleQuickCashCheckout = () => {
    if (cart.length === 0 || isSubmitting) return;

    // Safety check for expired medications
    const expiredInCart = cart.find((item) => isExpired(item.medication.expiryDate));
    if (expiredInCart) {
      alert(
        `Safety Block: Cart contains expired item (${expiredInCart.medication.name}, expired ${expiredInCart.medication.expiryDate}). Remove it to proceed.`
      );
      return;
    }

    // Strict pharmaceutical compliance check: Stock levels must never fall below zero
    for (const item of cart) {
      if (item.quantity > item.medication.stock) {
        alert(
          `Pharmaceutical Compliance Error: Stock for "${item.medication.name}" cannot fall below zero. Available shelf stock is ${item.medication.stock}, requested: ${item.quantity}.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const receiptNumber = 'REC-' + Math.floor(100000 + Math.random() * 900000);
      const roundedTotal = Math.ceil(total);

      const transaction: SaleTransaction = {
        id: 'tx-' + Date.now(),
        receiptNumber,
        timestamp: new Date().toISOString(),
        cashierName: currentUser.name,
        cashierRole: currentUser.role,
        items: cart.map((it) => ({
          medicationId: it.medication.id,
          name: it.medication.name,
          genericName: it.medication.genericName,
          dosage: it.medication.dosage,
          isPrescription: it.medication.isPrescriptionRequired,
          rxNumber: it.rxNumber,
          patientName: it.patientName || patientNameInput,
          quantity: it.quantity,
          unitPrice: it.medication.price,
          totalPrice: it.medication.price * it.quantity * (1 - (it.discountPercent || 0) / 100),
          batchNumber: it.medication.batchNumber || 'N/A',
          expiryDate: it.medication.expiryDate || 'N/A',
        })),
        subtotal,
        tax,
        discount: cartDiscount,
        total,
        paymentMethod: 'Cash',
        amountTendered: roundedTotal,
        changeDue: 0,
        cashAmount: roundedTotal,
        patientName: patientNameInput || undefined,
        isOffline: !isOnline,
        synced: isOnline,
        syncTimestamp: isOnline ? new Date().toISOString() : undefined,
      };

      onCompleteSale(transaction);
      onUpdateCart([]);
      storageService.clearCart();
      setIsCheckoutOpen(false);
      handlePatientNameChange('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate new M-Pesa Transaction Code
  const handleGenerateMpesaCode = () => {
    const prefixes = ['QA', 'QB', 'SH', 'SK', 'TL', 'MG'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const code = randomPrefix + Math.floor(10000000 + Math.random() * 90000000).toString().slice(0, 8);
    setMpesaReference(code);
  };

  // Generate Card PDQ Authorization Code
  const handleGenerateCardAuthCode = () => {
    const auth = 'AUTH-' + Math.floor(100000 + Math.random() * 900000);
    setCardAuthCode(auth);
  };

  // Generate Insurance Claim Pre-Auth Code
  const handleGenerateInsuranceClaimCode = () => {
    const claim = 'CLM-' + Math.floor(100000 + Math.random() * 900000);
    setInsuranceAuthCode(claim);
  };

  // Finalize Sale with duplicate submission guard
  const handleConfirmSale = () => {
    if (isSubmitting) return;
    setCheckoutError(null);

    // Safety check: ensure no expired medications in cart
    const expiredInCart = cart.find((item) => isExpired(item.medication.expiryDate));
    if (expiredInCart) {
      setCheckoutError(
        `Safety Block: Cart contains expired item (${expiredInCart.medication.name}, expired ${expiredInCart.medication.expiryDate}). Remove it to proceed.`
      );
      return;
    }

    // Strict pharmaceutical compliance check: Stock levels must never fall below zero
    for (const item of cart) {
      if (item.quantity > item.medication.stock) {
        setCheckoutError(
          `Pharmaceutical Compliance Error: Stock for "${item.medication.name}" cannot fall below zero. Available shelf stock is ${item.medication.stock}, but ${item.quantity} was requested.`
        );
        return;
      }
    }

    if (paymentMethod === 'Cash') {
      if (cashTendered < total) {
        setCheckoutError(
          `Insufficient cash tendered. Total is ${formatKSh(total)}, received ${formatKSh(cashTendered)}.`
        );
        return;
      }
    } else if (paymentMethod === 'Partial (Cash + M-Pesa)') {
      const combinedTendered = partialCash + partialMpesa;
      if (combinedTendered < total) {
        setCheckoutError(
          `Combined payment is incomplete! Cash (${formatKSh(partialCash)}) + M-Pesa (${formatKSh(
            partialMpesa
          )}) = ${formatKSh(combinedTendered)}. Total due is ${formatKSh(total)}.`
        );
        return;
      }
      if (!mpesaReference.trim()) {
        setCheckoutError('Please enter or generate the M-Pesa transaction confirmation code.');
        return;
      }
    } else if (paymentMethod === 'M-Pesa') {
      if (!mpesaReference.trim()) {
        setCheckoutError('Please enter or generate the M-Pesa transaction confirmation code.');
        return;
      }
    } else if (paymentMethod === 'Credit/Debit Card') {
      if (!cardAuthCode.trim()) {
        setCheckoutError('Please enter or generate the PDQ terminal authorization code.');
        return;
      }
    } else if (paymentMethod === 'Insurance') {
      if (!insurancePolicyNumber.trim()) {
        setCheckoutError('Please enter the patient insurance member/policy number.');
        return;
      }
      if (!insuranceAuthCode.trim()) {
        setCheckoutError('Please enter or generate the insurance pre-authorization claim code.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const receiptNumber = 'REC-' + Math.floor(100000 + Math.random() * 900000);

      const transaction: SaleTransaction = {
        id: 'tx-' + Date.now(),
        receiptNumber,
        timestamp: new Date().toISOString(),
        cashierName: currentUser.name,
        cashierRole: currentUser.role,
        items: cart.map((it) => ({
          medicationId: it.medication.id,
          name: it.medication.name,
          genericName: it.medication.genericName,
          dosage: it.medication.dosage,
          isPrescription: it.medication.isPrescriptionRequired,
          rxNumber: it.rxNumber,
          patientName: it.patientName || patientNameInput,
          quantity: it.quantity,
          unitPrice: it.medication.price,
          totalPrice: it.medication.price * it.quantity * (1 - (it.discountPercent || 0) / 100),
          batchNumber: it.medication.batchNumber || 'N/A',
          expiryDate: it.medication.expiryDate || 'N/A',
        })),
        subtotal,
        tax,
        discount: cartDiscount,
        total,
        paymentMethod,
        amountTendered:
          paymentMethod === 'Cash'
            ? cashTendered
            : paymentMethod === 'Partial (Cash + M-Pesa)'
            ? partialCash + partialMpesa
            : total,
        changeDue: paymentMethod === 'Cash' || paymentMethod === 'Partial (Cash + M-Pesa)' ? changeDue : 0,
        cashAmount:
          paymentMethod === 'Cash'
            ? cashTendered
            : paymentMethod === 'Partial (Cash + M-Pesa)'
            ? partialCash
            : undefined,
        mpesaAmount:
          paymentMethod === 'M-Pesa'
            ? total
            : paymentMethod === 'Partial (Cash + M-Pesa)'
            ? partialMpesa
            : undefined,
        mpesaReference:
          paymentMethod === 'M-Pesa' || paymentMethod === 'Partial (Cash + M-Pesa)'
            ? mpesaReference.toUpperCase()
            : undefined,
        mpesaPhone:
          paymentMethod === 'M-Pesa' || paymentMethod === 'Partial (Cash + M-Pesa)'
            ? mpesaPhone
            : undefined,
        patientName: patientNameInput || undefined,
        cardAuthCode:
          paymentMethod === 'Credit/Debit Card'
            ? `${cardBankTerminal} [${cardType}] ${cardLast4 ? '••••' + cardLast4 : ''} - ${cardAuthCode.trim()}`
            : undefined,
        insuranceProvider: paymentMethod === 'Insurance' ? insuranceProvider : undefined,
        insurancePolicyNumber: paymentMethod === 'Insurance' ? insurancePolicyNumber.trim() : undefined,
        insuranceAuthCode: paymentMethod === 'Insurance' ? insuranceAuthCode.trim() : undefined,
        isOffline: !isOnline,
        synced: isOnline,
        syncTimestamp: isOnline ? new Date().toISOString() : undefined,
      };

      onCompleteSale(transaction);
      onUpdateCart([]);
      storageService.clearCart();
      setIsCheckoutOpen(false);
      handlePatientNameChange('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      {/* Mobile Segmented View Toggle (< lg) */}
      <div className="lg:hidden flex items-center bg-slate-100 p-1 rounded-2xl text-xs font-bold">
        <button
          type="button"
          onClick={() => setMobilePosTab('catalog')}
          className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
            mobilePosTab === 'catalog' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Pill className="w-4 h-4" />
          <span>Medication Catalog</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePosTab('cart')}
          className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
            mobilePosTab === 'cart' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Cart ({cart.length})</span>
          {cart.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                mobilePosTab === 'cart' ? 'bg-teal-900 text-teal-200' : 'bg-teal-100 text-teal-800'
              }`}
            >
              {formatKSh(total)}
            </span>
          )}
        </button>
      </div>

      {/* POS Multi-Customer Order Tabs Bar */}
      {tabs && tabs.length > 0 && (
        <div id="pos-tab-bar" className="bg-white rounded-2xl border border-slate-200 p-2.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
            <div className="flex items-center gap-1 text-slate-400 pl-1 pr-1.5 shrink-0" title="Customer / Order Tabs">
              <Layers className="w-4 h-4 text-teal-700" />
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider hidden sm:inline">Tabs:</span>
            </div>

            {tabs.map((tab, idx) => {
              const isActive = tab.id === activeTabId;
              const tabSubtotal = tab.cart.reduce((acc, item) => {
                const itemTotal = item.medication.price * item.quantity;
                const discount = item.discountPercent ? (itemTotal * item.discountPercent) / 100 : 0;
                return acc + (itemTotal - discount);
              }, 0);

              return (
                <div
                  key={tab.id}
                  id={`pos-tab-${tab.id}`}
                  onClick={() => onSelectTab && onSelectTab(tab.id)}
                  className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition select-none shrink-0 ${
                    isActive
                      ? 'bg-teal-700 text-white shadow-xs ring-2 ring-teal-600/30'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                  }`}
                >
                  {/* Tab Index Number */}
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${
                      isActive ? 'bg-teal-800 text-teal-200' : 'bg-slate-200 text-slate-600'
                    }`}
                    title={`Alt + ${idx + 1}`}
                  >
                    {idx + 1}
                  </span>

                  {/* Tab Name (Editable) */}
                  {editingTabId === tab.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (onRenameTab && editTabName.trim()) {
                          onRenameTab(tab.id, editTabName.trim());
                        }
                        setEditingTabId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editTabName}
                        onChange={(e) => setEditTabName(e.target.value)}
                        onBlur={() => {
                          if (onRenameTab && editTabName.trim()) {
                            onRenameTab(tab.id, editTabName.trim());
                          }
                          setEditingTabId(null);
                        }}
                        className="w-28 px-1.5 py-0.5 text-xs bg-white text-slate-900 rounded border border-teal-400 focus:outline-hidden font-bold"
                      />
                    </form>
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingTabId(tab.id);
                        setEditTabName(tab.name);
                      }}
                      className="font-bold max-w-[130px] truncate"
                      title={`${tab.name} (Double-click to rename)`}
                    >
                      {tab.name}
                    </span>
                  )}

                  {/* Parked / Hold Indicator */}
                  {tab.isParked && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                        isActive
                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                      title="This tab is currently on hold / parked"
                    >
                      Hold
                    </span>
                  )}

                  {/* Item count & Subtotal badge */}
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                      isActive ? 'bg-teal-800 text-teal-100' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.cart.length} {tab.cart.length === 1 ? 'item' : 'items'}
                    {tab.cart.length > 0 && ` • ${formatKSh(tabSubtotal)}`}
                  </span>

                  {/* Inline edit button */}
                  {isActive && editingTabId !== tab.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTabId(tab.id);
                        setEditTabName(tab.name);
                      }}
                      className="opacity-70 hover:opacity-100 p-0.5 text-teal-200 hover:text-white transition"
                      title="Rename tab"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}

                  {/* Close Tab Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onCloseTab) {
                        onCloseTab(tab.id);
                      }
                    }}
                    className={`p-0.5 rounded-md transition ${
                      isActive
                        ? 'text-teal-200 hover:text-white hover:bg-teal-800'
                        : 'text-slate-400 hover:text-rose-600 hover:bg-slate-200'
                    }`}
                    title="Close tab (Alt+W)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Add New Tab Button */}
            <button
              type="button"
              id="pos-new-tab-btn"
              onClick={() => onAddTab && onAddTab()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 transition cursor-pointer shrink-0 shadow-2xs active:scale-95"
              title="Open a new customer order tab (Alt+N)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Tab</span>
              <kbd className="hidden sm:inline-block px-1 py-0.2 bg-teal-100 text-teal-800 text-[9px] rounded font-mono font-semibold">
                Alt+N
              </kbd>
            </button>
          </div>

          {/* Right Tab Controls: Park / Hold active tab & Quick helper */}
          <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
            {currentTab && (
              <button
                type="button"
                id="pos-park-tab-btn"
                onClick={() => onToggleParkTab && onToggleParkTab(currentTab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs active:scale-95 ${
                  currentTab.isParked
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black ring-2 ring-amber-300'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                }`}
                title="Hold/Park this customer's cart to serve next customer (Alt+H)"
              >
                <PauseCircle className="w-4 h-4 text-amber-700" />
                <span>{currentTab.isParked ? 'Resume Tab' : 'Hold / Park Tab'}</span>
                <kbd className="hidden lg:inline-block px-1 py-0.2 bg-amber-200/70 text-amber-900 text-[9px] rounded font-mono">
                  Alt+H
                </kbd>
              </button>
            )}

            <div className="text-[11px] text-slate-500 font-mono hidden xl:flex items-center gap-2">
              <span className="text-slate-400">•</span>
              <span>Alt+1..{Math.min(9, tabs.length)}: Switch</span>
              <span className="text-slate-400">•</span>
              <span>Alt+W: Close</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Catalog & Fast Barcode Bar */}
        <div className={`lg:col-span-7 space-y-4 ${mobilePosTab === 'catalog' ? 'block' : 'hidden lg:block'}`}>
          {/* Quick Barcode & Search Header */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            {/* Quick Add Search Input (Type partial name & Enter) */}
            <form onSubmit={handleQuickAddSubmit} className="space-y-1.5" id="pos-quick-add-form">
              <div className="flex items-center justify-between">
                <label htmlFor="pos-quick-add-input" className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-teal-700 fill-teal-700" />
                  <span>Quick Add to Cart</span>
                  <span className="text-[10px] font-normal text-slate-500 font-sans">(Type name &amp; press Enter)</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline-flex items-center gap-1">
                  Shortcut: <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-600 font-bold">Alt + Q</kbd>
                </span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teal-700" />
                <input
                  ref={quickAddInputRef}
                  id="pos-quick-add-input"
                  type="text"
                  value={quickAddInput}
                  onChange={(e) => setQuickAddInput(e.target.value)}
                  placeholder="Quick Add: Type partial product name (e.g. 'amox', 'panad', 'ibu') and press Enter..."
                  className="w-full pl-9 pr-24 py-2.5 text-xs sm:text-sm bg-teal-50/40 border border-teal-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:bg-white text-slate-900 placeholder:text-slate-400 font-medium transition"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={!quickAddInput.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer"
                  title="Press Enter to add first matching item to cart"
                >
                  <span>Add</span>
                  <CornerDownLeft className="w-3 h-3" />
                </button>
              </div>

              {/* Real-time Match Indicator or Feedback Alert */}
              {quickAddFeedback ? (
                <div
                  className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition ${
                    quickAddFeedback.type === 'success'
                      ? 'bg-teal-50 text-teal-900 border border-teal-200'
                      : quickAddFeedback.type === 'warning'
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {quickAddFeedback.type === 'success' ? (
                    <Check className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  )}
                  <span>{quickAddFeedback.text}</span>
                </div>
              ) : firstQuickAddMatch ? (
                <div className="text-xs px-3 py-1.5 rounded-lg bg-teal-50/60 border border-teal-200/80 flex flex-wrap items-center justify-between gap-1 text-slate-700">
                  <div className="flex items-center gap-1.5 font-medium truncate">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-teal-800 bg-white px-1.5 py-0.5 rounded border border-teal-200 shadow-2xs">
                      1st Match
                    </span>
                    <span className="font-bold text-slate-900">{firstQuickAddMatch.name}</span>
                    <span className="text-slate-500 text-[11px]">({firstQuickAddMatch.dosage} • {firstQuickAddMatch.form})</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] shrink-0">
                    <span className="font-bold text-teal-800">{formatKSh(firstQuickAddMatch.price)}</span>
                    <span
                      className={`font-semibold ${
                        firstQuickAddMatch.stock <= 0
                          ? 'text-rose-600'
                          : firstQuickAddMatch.stock <= firstQuickAddMatch.minStockLevel
                          ? 'text-amber-600'
                          : 'text-slate-600'
                      }`}
                    >
                      Stock: {firstQuickAddMatch.stock}
                    </span>
                    <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white border border-teal-300 rounded shadow-2xs text-teal-900 font-bold">
                      ↵ Enter to Add
                    </kbd>
                  </div>
                </div>
              ) : quickAddInput.trim() ? (
                <div className="text-xs px-3 py-1 text-slate-500 italic bg-slate-50 rounded-lg border border-slate-200">
                  No medication found matching &ldquo;{quickAddInput}&rdquo;
                </div>
              ) : null}
            </form>

            <div className="border-t border-slate-100 pt-2 flex gap-2">
              {/* Rapid Barcode Input */}
              <form onSubmit={handleBarcodeSubmit} className="relative flex-1">
                <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="pos-fast-barcode-input"
                  type="text"
                  value={barcodeQuickInput}
                  onChange={(e) => setBarcodeQuickInput(e.target.value)}
                  placeholder="Scan / Type Rx or NDC Barcode (Enter)..."
                  className="w-full pl-9 pr-20 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
                >
                  Scan
                </button>
              </form>

              {/* Camera Scanner Button */}
              <button
                id="open-pos-camera-scanner-btn"
                onClick={onOpenScanner}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 whitespace-nowrap"
                title="Open Barcode Scanner Camera"
              >
                <Camera className="w-4 h-4" />
                <span>Camera Scan</span>
              </button>
            </div>

          {/* Search by drug name & Generic */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medication catalog by brand, active ingredient or category..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Medication Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[620px] overflow-y-auto pr-1">
          {filteredMedications.map((med) => {
            const isLow = med.stock <= med.minStockLevel;
            const isOut = med.stock === 0;
            const expired = isExpired(med.expiryDate);
            const expiringSoon = !expired && isExpiringSoon(med.expiryDate);

            return (
              <div
                key={med.id}
                onClick={() => !isOut && !expired && handleAddToCart(med)}
                className={`bg-white p-3.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer group ${
                  expired
                    ? 'border-rose-300 bg-rose-50/30 opacity-75 cursor-not-allowed'
                    : isOut
                    ? 'opacity-50 border-slate-200 cursor-not-allowed'
                    : 'border-slate-200 hover:border-teal-500 hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                        med.isPrescriptionRequired
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {med.isPrescriptionRequired ? 'Rx Script' : 'OTC'}
                    </span>

                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        expired
                          ? 'bg-rose-100 text-rose-700'
                          : isOut
                          ? 'bg-red-100 text-red-700'
                          : isLow
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {expired
                        ? `Expired (${med.expiryDate})`
                        : isOut
                        ? 'Out of Stock'
                        : `${med.stock} in stock`}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition">
                    {med.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 italic line-clamp-1">{med.genericName}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>{med.dosage} • {med.form}</span>
                    {expiringSoon && (
                      <span className="text-amber-700 font-bold bg-amber-50 px-1 rounded">
                        Exp: {med.expiryDate}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                  <span className="text-sm font-extrabold text-slate-900">
                    {formatKSh(med.price)}
                  </span>
                  <button
                    disabled={isOut || expired}
                    className="p-1.5 rounded-xl bg-teal-50 text-teal-700 group-hover:bg-teal-700 group-hover:text-white transition disabled:opacity-40"
                    title={expired ? 'Medication Expired' : isOut ? 'Out of Stock' : 'Add to Dispense Cart'}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right 5 cols: Active POS Cart & Checkout */}
      <div
        className={`lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[740px] overflow-hidden sticky top-6 ${
          mobilePosTab === 'cart' ? 'block' : 'hidden lg:block'
        }`}
      >
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-slate-900">Active Dispense Cart</h2>
                {currentTab && (
                  <span className="text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-teal-100 text-teal-800 border border-teal-200">
                    {currentTab.name}
                  </span>
                )}
                {currentTab?.isParked && (
                  <span className="text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-200 text-amber-900 border border-amber-300">
                    On Hold
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {cart.length} line item{cart.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentTab && onToggleParkTab && (
              <button
                type="button"
                onClick={() => onToggleParkTab(currentTab.id)}
                className={`text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg transition ${
                  currentTab.isParked
                    ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                    : 'text-slate-600 hover:text-amber-800 hover:bg-amber-50'
                }`}
                title={currentTab.isParked ? 'Resume this tab' : 'Hold / Park this tab'}
              >
                <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>{currentTab.isParked ? 'Resume' : 'Park'}</span>
              </button>
            )}

            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 p-1 hover:bg-rose-50 rounded-lg transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Patient Reference Field */}
        <div className="px-4 py-2.5 bg-slate-100/60 border-b border-slate-200 text-xs flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={patientNameInput}
            onChange={(e) => handlePatientNameChange(e.target.value)}
            placeholder="Customer / Patient Name (e.g. Grace Muthoni)..."
            className="w-full bg-transparent border-none focus:outline-hidden text-xs font-semibold text-slate-800 placeholder:text-slate-400"
          />
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Pill className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">Dispense Cart is Empty</p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Scan an Rx barcode or tap medication cards to ring up the sale in Kenyan Shillings.
              </p>
            </div>
          ) : (
            cart.map((item, idx) => {
              const itemTotal = item.medication.price * item.quantity;
              const discount = item.discountPercent ? (itemTotal * item.discountPercent) / 100 : 0;
              const finalItemPrice = itemTotal - discount;

              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-200 hover:border-teal-300 bg-slate-50/50 transition flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900">{item.medication.name}</div>
                      <div className="text-[11px] text-slate-500 italic">{item.medication.dosage}</div>
                      {item.rxNumber && (
                        <span className="inline-block mt-0.5 text-[10px] font-bold bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded font-mono">
                          Rx: {item.rxNumber} ({item.patientName})
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xs text-slate-900">{formatKSh(finalItemPrice)}</div>
                      {item.discountPercent ? (
                        <div className="text-[10px] text-emerald-700 font-semibold">
                          -{item.discountPercent}% Co-Pay
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400">
                          {formatKSh(item.medication.price)} each
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-500 font-mono">
                      Batch: {item.medication.batchNumber}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(idx, -1)}
                        className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition"
                        title="Decrease quantity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={item.medication.stock}
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          handleSetExactQuantity(idx, val);
                        }}
                        className="w-10 text-center font-bold text-xs text-slate-900 border border-slate-300 rounded-md py-0.5 bg-white font-mono focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        title={`Enter quantity (1 to ${item.medication.stock})`}
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(idx, 1)}
                        disabled={item.quantity >= item.medication.stock}
                        className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Increase quantity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 ml-1 rounded-lg hover:bg-rose-50"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Totals and Checkout Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2.5 text-xs">
          <div className="space-y-1.5 text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-800">{formatKSh(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT ({Math.round((receiptSettings.taxRate || 0.16) * 100)}%):</span>
              <span className="font-semibold text-slate-800">{formatKSh(tax)}</span>
            </div>
            {cartDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discount Applied:</span>
                <span>-{formatKSh(cartDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
              <span>Total Amount Due:</span>
              <span className="text-base text-teal-900 font-extrabold">{formatKSh(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              id="instant-cash-btn"
              type="button"
              onClick={handleQuickCashCheckout}
              disabled={cart.length === 0 || isSubmitting}
              className="py-3 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs shadow-md transition active:scale-98 flex items-center justify-center gap-1.5"
              title="Fast one-click checkout with exact cash"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Quick Cash ({formatKSh(total)})</span>
            </button>

            <button
              id="proceed-checkout-btn"
              type="button"
              onClick={handleStartCheckout}
              disabled={cart.length === 0 || isSubmitting}
              className="py-3 px-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs shadow-md transition active:scale-98 flex items-center justify-center gap-1.5"
            >
              <Wallet className="w-4 h-4" />
              <span>Checkout Options</span>
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Floating Mobile Cart Summary Bar (< lg) */}
      {cart.length > 0 && mobilePosTab === 'catalog' && (
        <div className="lg:hidden fixed bottom-16 left-3 right-3 z-20 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl flex items-center justify-between animate-fade-in border border-slate-700/60 no-print">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {cart.length}
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Due</div>
              <div className="text-sm font-black text-white font-mono">{formatKSh(total)}</div>
            </div>
          </div>
          <button
            onClick={() => setMobilePosTab('cart')}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md active:scale-95"
          >
            <span>Review & Pay</span>
            <ShoppingCart className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Checkout & Tender Payment Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Payment & Tender (Kenya)</h3>
                <p className="text-xs text-slate-500 font-mono">Total Due: {formatKSh(total)}</p>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs max-h-[80vh] overflow-y-auto">
              {/* Grand Total Callout */}
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-center">
                <span className="text-[11px] uppercase font-bold text-teal-800">Total Payable Amount</span>
                <div className="text-3xl font-extrabold text-teal-950 mt-0.5 font-mono">
                  {formatKSh(total)}
                </div>
                {!isOnline && (
                  <span className="inline-block mt-1 text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                    Offline Mode Active - Will Queue for Sync
                  </span>
                )}
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Select Payment Method:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Cash */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Cash')}
                    className={`p-2.5 rounded-xl border text-left font-semibold flex flex-col gap-1 transition ${
                      paymentMethod === 'Cash'
                        ? 'border-teal-700 bg-teal-50 text-teal-900 shadow-xs ring-1 ring-teal-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold">Cash</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal">KSh notes & coins</span>
                  </button>

                  {/* M-Pesa */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('M-Pesa')}
                    className={`p-2.5 rounded-xl border text-left font-semibold flex flex-col gap-1 transition ${
                      paymentMethod === 'M-Pesa'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-emerald-800">M-Pesa</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal">Safaricom Mobile</span>
                  </button>

                  {/* Partial (Cash + M-Pesa) */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Partial (Cash + M-Pesa)')}
                    className={`p-2.5 rounded-xl border text-left font-semibold flex flex-col gap-1 transition ${
                      paymentMethod === 'Partial (Cash + M-Pesa)'
                        ? 'border-teal-700 bg-teal-50 text-teal-900 shadow-xs ring-1 ring-teal-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Split className="w-4 h-4 text-teal-700" />
                      <span className="font-bold">Partial</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal">Cash + M-Pesa split</span>
                  </button>
                </div>

                {/* Secondary methods */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Credit/Debit Card')}
                    className={`p-2 rounded-lg border text-left font-medium flex items-center gap-1.5 text-xs transition ${
                      paymentMethod === 'Credit/Debit Card'
                        ? 'border-teal-700 bg-teal-50 text-teal-900 font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    <span>Card / POS PDQ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Insurance')}
                    className={`p-2 rounded-lg border text-left font-medium flex items-center gap-1.5 text-xs transition ${
                      paymentMethod === 'Insurance'
                        ? 'border-teal-700 bg-teal-50 text-teal-900 font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileCheck className="w-3.5 h-3.5 text-purple-600" />
                    <span>Insurance / SHA</span>
                  </button>
                </div>
              </div>

              {/* CASH TENDER SECTION */}
              {paymentMethod === 'Cash' && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center">
                    <label className="block font-semibold text-slate-700">Cash Received (KSh):</label>
                    <span className="text-[11px] text-slate-500 font-mono">Due: {formatKSh(total)}</span>
                  </div>

                  <input
                    type="number"
                    step="1"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white font-mono"
                  />

                  {/* Fast Tender Kenyan Note Buttons */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Fast Tender Notes</span>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                      {[100, 200, 500, 1000, 2000, 5000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCashTendered(amt)}
                          className="py-1.5 px-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 text-[11px] font-mono text-center"
                        >
                          {amt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCashTendered(Math.ceil(total))}
                        className="py-1.5 px-1 rounded-lg bg-teal-100 text-teal-900 font-bold hover:bg-teal-200 text-[11px] text-center"
                      >
                        Exact
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-sm">
                    <span className="text-slate-600">Change Due to Customer:</span>
                    <span className={changeDue >= 0 ? 'text-emerald-700 text-base font-mono' : 'text-red-600 font-mono'}>
                      {formatKSh(changeDue)}
                    </span>
                  </div>
                </div>
              )}

              {/* M-PESA ONLY SECTION */}
              {paymentMethod === 'M-Pesa' && (
                <div className="space-y-3 bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                        M
                      </div>
                      <span className="font-bold text-emerald-950">Safaricom M-Pesa Payment</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-900 font-mono">{formatKSh(total)}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Customer Mobile Number:
                      </label>
                      <input
                        type="tel"
                        value={mpesaPhone}
                        onChange={(e) => setMpesaPhone(e.target.value)}
                        placeholder="e.g. 0712 345 678"
                        className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[11px] font-semibold text-slate-700">M-Pesa Confirmation Code:</label>
                        <button
                          type="button"
                          onClick={handleGenerateMpesaCode}
                          className="text-[10px] text-emerald-700 font-bold hover:underline"
                        >
                          Auto-Code
                        </button>
                      </div>
                      <input
                        type="text"
                        value={mpesaReference}
                        onChange={(e) => setMpesaReference(e.target.value.toUpperCase())}
                        placeholder="e.g. QK89201982"
                        className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 uppercase font-mono tracking-wider"
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-100/70 border border-emerald-300 text-[11px] text-emerald-900 flex items-center justify-between">
                    <span>Till / Paybill: <strong>522522 (Acc: RX-{Math.floor(1000 + Math.random() * 9000)})</strong></span>
                    <span className="font-bold text-emerald-800">Status: Verified OK</span>
                  </div>
                </div>
              )}

              {/* PARTIAL PAYMENT SECTION (Cash + M-Pesa) */}
              {paymentMethod === 'Partial (Cash + M-Pesa)' && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Split className="w-4 h-4 text-teal-700" />
                      <span>Split Payment: Cash + M-Pesa</span>
                    </div>
                    <span className="font-bold text-xs text-slate-900 font-mono">
                      Target: {formatKSh(total)}
                    </span>
                  </div>

                  {/* Cash portion */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="font-bold text-slate-700 text-xs flex items-center gap-1">
                        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                        <span>1. Cash Amount Tendered:</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const half = Math.round(total / 2);
                          setPartialCash(half);
                          setPartialMpesa(Math.max(0, total - half));
                        }}
                        className="text-[10px] text-teal-700 font-bold hover:underline"
                      >
                        Split 50/50
                      </button>
                    </div>

                    <input
                      type="number"
                      step="1"
                      value={partialCash}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setPartialCash(val);
                        setPartialMpesa(Math.max(0, total - val));
                      }}
                      className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>

                  {/* M-Pesa portion */}
                  <div className="p-3 bg-white rounded-xl border border-emerald-200 space-y-2">
                    <label className="font-bold text-slate-700 text-xs flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>2. M-Pesa Amount:</span>
                    </label>

                    <input
                      type="number"
                      step="1"
                      value={partialMpesa}
                      onChange={(e) => setPartialMpesa(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                    />

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          M-Pesa Phone Number:
                        </label>
                        <input
                          type="tel"
                          value={mpesaPhone}
                          onChange={(e) => setMpesaPhone(e.target.value)}
                          placeholder="0712 345 678"
                          className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg font-mono"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="text-[10px] font-semibold text-slate-600">Confirmation Code:</label>
                          <button
                            type="button"
                            onClick={handleGenerateMpesaCode}
                            className="text-[9px] text-emerald-700 font-bold hover:underline"
                          >
                            Auto
                          </button>
                        </div>
                        <input
                          type="text"
                          value={mpesaReference}
                          onChange={(e) => setMpesaReference(e.target.value.toUpperCase())}
                          placeholder="e.g. SH9102910"
                          className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg uppercase font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Partial summary calculation */}
                  <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Tendered (Cash + M-Pesa):</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {formatKSh(partialCash + partialMpesa)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-slate-700">Change Due:</span>
                      <span className={changeDue >= 0 ? 'text-emerald-700 font-mono' : 'text-red-600 font-mono'}>
                        {formatKSh(changeDue)}
                      </span>
                    </div>
                    {partialCash + partialMpesa < total && (
                      <div className="text-[11px] text-red-600 font-semibold">
                        Remaining balance needed: {formatKSh(total - (partialCash + partialMpesa))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CARD PAYMENT SECTION */}
              {paymentMethod === 'Credit/Debit Card' && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-slate-800 font-bold text-xs">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span>Card / PDQ Terminal Payment</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Bank Terminal / PDQ
                      </label>
                      <select
                        value={cardBankTerminal}
                        onChange={(e) => setCardBankTerminal(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Equity Bank PDQ">Equity Bank PDQ</option>
                        <option value="KCB Bank POS">KCB Bank POS</option>
                        <option value="Co-op Bank Terminal">Co-op Bank Terminal</option>
                        <option value="Absa Kenya POS">Absa Kenya POS</option>
                        <option value="Standard Chartered">Standard Chartered</option>
                        <option value="NCBA Merchant POS">NCBA Merchant POS</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Card Type
                      </label>
                      <select
                        value={cardType}
                        onChange={(e) => setCardType(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Visa Debit">Visa Debit</option>
                        <option value="Visa Credit">Visa Credit</option>
                        <option value="Mastercard">Mastercard</option>
                        <option value="American Express">American Express</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Card Last 4 Digits (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="e.g. 4821"
                        value={cardLast4}
                        onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg font-mono"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-0.5">
                        <label className="text-[10px] font-semibold text-slate-600">Approval / Auth Code</label>
                        <button
                          type="button"
                          onClick={handleGenerateCardAuthCode}
                          className="text-[9px] text-blue-700 font-bold hover:underline"
                        >
                          Generate
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="AUTH-982144"
                        value={cardAuthCode}
                        onChange={(e) => setCardAuthCode(e.target.value.toUpperCase())}
                        className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-blue-50/80 border border-blue-200 text-[11px] text-blue-900 flex justify-between items-center">
                    <span>Swiped / Tapped on POS terminal</span>
                    <span className="font-bold text-blue-800">Amount: {formatKSh(total)}</span>
                  </div>
                </div>
              )}

              {/* INSURANCE PAYMENT SECTION */}
              {paymentMethod === 'Insurance' && (
                <div className="p-3.5 bg-purple-50/80 rounded-xl border border-purple-200 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-purple-200 text-purple-950 font-bold text-xs">
                    <FileCheck className="w-4 h-4 text-purple-700" />
                    <span>Insurance / Medical Cover Claim</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-purple-900 mb-0.5">
                      Insurance Provider / Underwriter
                    </label>
                    <select
                      value={insuranceProvider}
                      onChange={(e) => setInsuranceProvider(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold border border-purple-300 rounded-lg bg-white text-purple-950"
                    >
                      <option value="Social Health Authority (SHA / NHIF)">Social Health Authority (SHA / NHIF)</option>
                      <option value="Jubilee Health Insurance">Jubilee Health Insurance</option>
                      <option value="AAR Insurance Kenya">AAR Insurance Kenya</option>
                      <option value="Britam Medishield">Britam Medishield</option>
                      <option value="CIC General Insurance">CIC General Insurance</option>
                      <option value="UAP Old Mutual Health">UAP Old Mutual Health</option>
                      <option value="First Assurance Medical">First Assurance Medical</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-purple-900 mb-0.5">
                        Member / Policy Number *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. SHA-881920"
                        value={insurancePolicyNumber}
                        onChange={(e) => setInsurancePolicyNumber(e.target.value.toUpperCase())}
                        className="w-full px-2.5 py-1.5 text-xs font-bold border border-purple-300 rounded-lg font-mono uppercase bg-white"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-0.5">
                        <label className="text-[10px] font-semibold text-purple-900">Pre-Auth / Claim Code *</label>
                        <button
                          type="button"
                          onClick={handleGenerateInsuranceClaimCode}
                          className="text-[9px] text-purple-700 font-bold hover:underline"
                        >
                          Generate
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="CLM-827361"
                        value={insuranceAuthCode}
                        onChange={(e) => setInsuranceAuthCode(e.target.value.toUpperCase())}
                        className="w-full px-2.5 py-1.5 text-xs font-bold border border-purple-300 rounded-lg font-mono uppercase bg-white"
                      />
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-purple-100/70 border border-purple-300 text-[11px] text-purple-900 flex justify-between items-center">
                    <span>Direct Insurance Billing Approved</span>
                    <span className="font-bold text-purple-800">Claim Total: {formatKSh(total)}</span>
                  </div>
                </div>
              )}

              {checkoutError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                  {checkoutError}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-checkout-sale-btn"
                  onClick={handleConfirmSale}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <span>Processing Sale...</span>
                  ) : (
                    <span>Complete Sale & Print</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
