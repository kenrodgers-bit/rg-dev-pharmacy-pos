/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { POSTerminal } from './components/POSTerminal';
import { PrescriptionsManager } from './components/PrescriptionsManager';
import { TestsManager } from './components/TestsManager';
import { InventoryManager } from './components/InventoryManager';
import { ReceiptSettingsView } from './components/ReceiptSettingsView';
import { ReportsView } from './components/ReportsView';
import { UserManagementView } from './components/UserManagementView';
import { UserProfileView } from './components/UserProfileView';
import { AuditLogsView } from './components/AuditLogsView';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { ReceiptModal } from './components/ReceiptModal';
import { LoginView } from './components/LoginView';
import { storageService } from './services/storage';
import { pharmacyService } from './services/pharmacyService';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSessionTimeout, INACTIVITY_TIMEOUT_MS } from './hooks/useSessionTimeout';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { supabaseConfig } from './services/supabase';
import {
  AppNavTab,
  AuditLog,
  CartItem,
  MedicalTest,
  Medication,
  POSTab,
  Prescription,
  ReceiptSettings,
  SaleTransaction,
  User,
  UserRole,
} from './types';
import { playScanSuccessBeep } from './utils/audio';
import { formatKSh } from './utils/currency';
import { CheckCircle2, Info, Lock, ShieldAlert } from 'lucide-react';

// Role-based tab access: admin can access everything. Clinicians handle
// tests & prescriptions but don't run the till or manage inventory/admin
// modules. Cashiers run the till & dispense but don't order clinical tests.
function isTabAllowedForRole(tab: AppNavTab, role: UserRole): boolean {
  if (role === 'admin') return true;
  const adminOnlyTabs: AppNavTab[] = ['users', 'reports', 'settings', 'audit'];
  if (adminOnlyTabs.includes(tab)) return false;
  if (tab === 'pos') return role === 'cashier';
  if (tab === 'tests') return role === 'clinician';
  return true; // prescriptions, inventory (view), profile — visible to all roles
}

export default function App() {
  // Navigation & Role State
  const [activeTab, setActiveTab] = useState<AppNavTab>('pos');
  const [currentUser, setCurrentUser] = useState<User | null>(() => storageService.getActiveUser());
  const [users, setUsers] = useState<User[]>(() => storageService.getUsers());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => storageService.getAuditLogs());

  // Core Pharmacy Data
  const [medications, setMedications] = useState<Medication[]>(() => storageService.getMedications());
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => storageService.getPrescriptions());
  const [tests, setTests] = useState<MedicalTest[]>(() => storageService.getTests());
  const [transactions, setTransactions] = useState<SaleTransaction[]>(() => storageService.getTransactions());
  const [offlineQueue, setOfflineQueue] = useState<SaleTransaction[]>(() => storageService.getOfflineQueue());
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => storageService.getReceiptSettings());

  // POS Multi-Customer Order Tabs with localStorage persistence & inventory reconciliation
  const [posTabs, setPosTabs] = useState<POSTab[]>(() => {
    const savedTabs = storageService.getPOSTabs();
    const currentMeds = storageService.getMedications();
    return savedTabs.map((tab) => ({
      ...tab,
      cart: tab.cart
        .filter((item) => currentMeds.some((m) => m.id === item.medication.id))
        .map((item) => {
          const liveMed = currentMeds.find((m) => m.id === item.medication.id)!;
          const validQuantity = Math.min(item.quantity, Math.max(1, liveMed.stock));
          return {
            ...item,
            medication: liveMed,
            quantity: validQuantity,
          };
        }),
    }));
  });

  const [activePOSTabId, setActivePOSTabId] = useState<string>(() => {
    return storageService.getActivePOSTabId() || 'tab-1';
  });

  // Derived active tab
  const activePOSTab = posTabs.find((t) => t.id === activePOSTabId) || posTabs[0] || {
    id: 'tab-1',
    name: 'Tab 1',
    cart: [],
    patientName: '',
    isParked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Sync tabs and backward-compatible single cart to storage
  useEffect(() => {
    storageService.savePOSTabs(posTabs);
    storageService.saveActivePOSTabId(activePOSTab.id);
    storageService.saveCart(activePOSTab.cart);
    storageService.saveCartPatientName(activePOSTab.patientName || '');
  }, [posTabs, activePOSTab]);

  const handleSelectPOSTab = (tabId: string) => {
    setActivePOSTabId(tabId);
  };

  const handleAddPOSTab = (customName?: string) => {
    const newTabNumber = posTabs.length + 1;
    const newTab: POSTab = {
      id: `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: customName || `Tab ${newTabNumber}`,
      cart: [],
      patientName: '',
      isParked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPosTabs((prev) => [...prev, newTab]);
    setActivePOSTabId(newTab.id);
    showToast(`Opened new order tab "${newTab.name}".`, 'info');
  };

  const handleClosePOSTab = (tabId: string) => {
    const target = posTabs.find((t) => t.id === tabId);
    if (!target) return;

    if (target.cart.length > 0) {
      const confirmClose = window.confirm(
        `Tab "${target.name}" contains ${target.cart.length} item(s). Close and discard this tab's cart?`
      );
      if (!confirmClose) return;
    }

    if (posTabs.length <= 1) {
      const freshTab: POSTab = {
        id: `tab-${Date.now()}`,
        name: 'Tab 1',
        cart: [],
        patientName: '',
        isParked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setPosTabs([freshTab]);
      setActivePOSTabId(freshTab.id);
      showToast('Tab cleared and reset to Tab 1.', 'info');
      return;
    }

    const remaining = posTabs.filter((t) => t.id !== tabId);
    setPosTabs(remaining);

    if (activePOSTabId === tabId) {
      const currentIdx = posTabs.findIndex((t) => t.id === tabId);
      const nextIdx = Math.max(0, currentIdx - 1);
      setActivePOSTabId(remaining[nextIdx]?.id || remaining[0].id);
    }
    showToast(`Closed tab "${target.name}".`, 'info');
  };

  const handleRenamePOSTab = (tabId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setPosTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, name: trimmed, updatedAt: Date.now() } : t))
    );
  };

  const handleToggleParkPOSTab = (tabId: string) => {
    setPosTabs((prev) =>
      prev.map((t) => {
        if (t.id === tabId) {
          const willPark = !t.isParked;
          showToast(
            willPark ? `Tab "${t.name}" put on hold / parked.` : `Tab "${t.name}" resumed.`,
            'info'
          );
          return { ...t, isParked: willPark, updatedAt: Date.now() };
        }
        return t;
      })
    );
  };

  const handleUpdateActiveCart = (newCart: CartItem[]) => {
    setPosTabs((prev) =>
      prev.map((t) => (t.id === activePOSTab.id ? { ...t, cart: newCart, updatedAt: Date.now() } : t))
    );
  };

  const handleUpdateActivePatientName = (patientName: string) => {
    setPosTabs((prev) =>
      prev.map((t) => {
        if (t.id === activePOSTab.id) {
          const isGeneric = /^Tab \d+$/i.test(t.name);
          const newName = isGeneric && patientName.trim() ? `${t.name}: ${patientName.trim()}` : t.name;
          return { ...t, patientName, name: newName, updatedAt: Date.now() };
        }
        return t;
      })
    );
  };

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [receiptModalTx, setReceiptModalTx] = useState<SaleTransaction | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' | 'error' } | null>(null);

  // Network Connectivity Hook
  const { isOnline, isSimulatedOffline, toggleSimulatedOffline } = useOnlineStatus();

  const showToast = (text: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const refreshUsersAndLogs = () => {
    setUsers(storageService.getUsers());
    setAuditLogs(storageService.getAuditLogs());
    setCurrentUser(storageService.getActiveUser());
  };

  const handleLogout = async () => {
    try {
      await pharmacyService.signOut();
    } catch (e) {
      // ignore
    }
    storageService.logoutActiveUser(currentUser);
    setCurrentUser(null);
    showToast('Signed out of session.', 'info');
  };

  // Security: exact 30-minute inactivity auto-logout with cross-tab BroadcastChannel sync.
  useSessionTimeout({
    enabled: !!currentUser,
    onWarning: (msRemaining) => {
      const sec = Math.round(msRemaining / 1000);
      showToast(`Security Warning: Session expiring in ${sec}s due to inactivity...`, 'warning');
    },
    onTimeout: (reason) => {
      if (currentUser) {
        pharmacyService.signOut().catch(() => {});
        storageService.logoutActiveUser(currentUser);
        setCurrentUser(null);
        showToast(reason || 'Session expired after 30 minutes of inactivity. Please sign in again.', 'info');
      }
    },
  });

  // Cloud hydration: when Supabase is configured, pull the latest medications,
  // prescriptions & tests from the cloud on login so this device starts from
  // the shared source of truth rather than stale local data.
  useEffect(() => {
    if (!currentUser || !supabaseConfig.isConfigured()) return;
    (async () => {
      const [cloudMeds, cloudRx, cloudTests] = await Promise.all([
        storageService.pullMedicationsFromCloud(),
        storageService.pullPrescriptionsFromCloud(),
        storageService.pullTestsFromCloud(),
      ]);
      if (cloudMeds && cloudMeds.length > 0) {
        setMedications(cloudMeds);
        storageService.saveMedications(cloudMeds);
      }
      if (cloudRx) {
        setPrescriptions(cloudRx);
        storageService.savePrescriptions(cloudRx);
      }
      if (cloudTests) {
        setTests(cloudTests);
        storageService.saveTests(cloudTests);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Realtime sync: live-refresh medications/prescriptions/tests when another
  // device (a different cashier till, the clinician's tablet, admin laptop)
  // writes a change to Supabase.
  useRealtimeSync({
    enabled: !!currentUser,
    onMedicationsChanged: async () => {
      const cloudMeds = await storageService.pullMedicationsFromCloud();
      if (cloudMeds) {
        setMedications(cloudMeds);
        storageService.saveMedications(cloudMeds);
      }
    },
    onPrescriptionsChanged: async () => {
      const cloudRx = await storageService.pullPrescriptionsFromCloud();
      if (cloudRx) {
        setPrescriptions(cloudRx);
        storageService.savePrescriptions(cloudRx);
      }
    },
    onTestsChanged: async () => {
      const cloudTests = await storageService.pullTestsFromCloud();
      if (cloudTests) {
        setTests(cloudTests);
        storageService.saveTests(cloudTests);
      }
    },
  });

  // Default landing tab per role (used on login & when redirected off a restricted tab)
  const defaultTabForRole = (role: UserRole): AppNavTab => {
    if (role === 'clinician') return 'prescriptions';
    return 'pos';
  };

  // Enforce access control on tab state: users cannot remain on a tab their role can't access
  useEffect(() => {
    if (currentUser && !isTabAllowedForRole(activeTab, currentUser.role)) {
      setActiveTab(defaultTabForRole(currentUser.role));
      showToast('Access restricted: That module is not available for your role.', 'warning');
    }
  }, [currentUser?.role, activeTab]);

  // Sync Offline Queue when returning online or manually triggered
  const handleSyncOfflineQueue = async () => {
    if (offlineQueue.length === 0) {
      showToast('No offline transactions waiting to sync.', 'info');
      return;
    }

    if (!isOnline) {
      showToast('Cannot synchronize: No internet connection detected.', 'warning');
      return;
    }

    try {
      const res = await pharmacyService.syncOfflineSales();
      if (res.failed > 0) {
        showToast(`Synced ${res.synced} sales with PostgreSQL backend. ${res.failed} sync conflicts occurred.`, 'warning');
      } else {
        showToast(`Successfully synced ${res.synced} offline transaction${res.synced > 1 ? 's' : ''} with backend!`, 'success');
      }

      // Refresh state from authoritative service
      const remainingQueue = pharmacyService.getOfflineQueue();
      setOfflineQueue(remainingQueue);

      const [cloudMeds, cloudSales] = await Promise.all([
        pharmacyService.fetchMedications(),
        pharmacyService.fetchSales(),
      ]);
      if (cloudMeds && cloudMeds.length > 0) {
        setMedications(cloudMeds);
        storageService.saveMedications(cloudMeds);
      }
      if (cloudSales && cloudSales.length > 0) {
        setTransactions(cloudSales);
        storageService.saveTransactions(cloudSales);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Sync encountered an error: ${msg}`, 'error');
    }
  };

  // Automatic sync when connection is restored
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      handleSyncOfflineQueue();
    }
  }, [isOnline]);

  // Inventory Management Handlers with Authorization Enforcement & Pharmaceutical Compliance
  const handleUpdateMedication = (updated: Medication) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can modify stock or pricing.', 'warning');
      return;
    }

    // Stricter Validation: Stock cannot fall below zero
    if (typeof updated.stock !== 'number' || isNaN(updated.stock) || updated.stock < 0) {
      showToast('Pharmaceutical Compliance Error: Stock levels cannot fall below zero.', 'error');
      return;
    }

    // Stricter Validation: Batch information must be strictly associated
    if (!updated.batchNumber || !updated.batchNumber.trim()) {
      showToast('Pharmaceutical Compliance Error: Batch/Lot number is strictly required.', 'error');
      return;
    }

    if (!updated.expiryDate || !updated.expiryDate.trim()) {
      showToast('Pharmaceutical Compliance Error: Expiration date is strictly required.', 'error');
      return;
    }

    const cleanUpdated: Medication = {
      ...updated,
      stock: Math.max(0, Math.floor(updated.stock)),
      batchNumber: updated.batchNumber.trim(),
      expiryDate: updated.expiryDate.trim(),
    };

    const updatedList = medications.map((m) => (m.id === cleanUpdated.id ? cleanUpdated : m));
    setMedications(updatedList);
    storageService.saveMedications(updatedList);
    storageService.pushMedicationToCloud(cleanUpdated);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'INVENTORY_UPDATED',
      details: `Updated item ${cleanUpdated.name} (Stock: ${cleanUpdated.stock}, Batch: ${cleanUpdated.batchNumber}, Expiry: ${cleanUpdated.expiryDate}, Price: ${formatKSh(cleanUpdated.price)})`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());

    showToast(`Updated medication details for ${cleanUpdated.name}.`, 'success');
  };

  const handleAddMedication = (newItem: Medication) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can add products.', 'warning');
      return;
    }

    // Stricter Validation: Stock cannot fall below zero
    if (typeof newItem.stock !== 'number' || isNaN(newItem.stock) || newItem.stock < 0) {
      showToast('Pharmaceutical Compliance Error: Stock levels cannot fall below zero.', 'error');
      return;
    }

    // Stricter Validation: Batch information is strictly mandatory
    if (!newItem.batchNumber || !newItem.batchNumber.trim()) {
      showToast('Pharmaceutical Compliance Error: Batch/Lot number is strictly required for registration.', 'error');
      return;
    }

    if (!newItem.expiryDate || !newItem.expiryDate.trim()) {
      showToast('Pharmaceutical Compliance Error: Expiration date is strictly required.', 'error');
      return;
    }

    const cleanItem: Medication = {
      ...newItem,
      stock: Math.max(0, Math.floor(newItem.stock)),
      batchNumber: newItem.batchNumber.trim(),
      expiryDate: newItem.expiryDate.trim(),
    };

    const updatedList = [cleanItem, ...medications];
    setMedications(updatedList);
    storageService.saveMedications(updatedList);
    storageService.pushMedicationToCloud(cleanItem);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRODUCT_ADDED',
      details: `Added new product ${cleanItem.name} (${cleanItem.dosage}, Batch: ${cleanItem.batchNumber}, Expiry: ${cleanItem.expiryDate}, Stock: ${cleanItem.stock}, Price: ${formatKSh(cleanItem.price)})`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());

    showToast(`Added ${cleanItem.name} to pharmacy inventory.`, 'success');
  };

  const handleDeleteMedication = (id: string) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can delete products.', 'warning');
      return;
    }
    const item = medications.find((m) => m.id === id);
    const updatedList = medications.filter((m) => m.id !== id);
    setMedications(updatedList);
    storageService.saveMedications(updatedList);
    storageService.deleteMedicationFromCloud(id);
    setPosTabs((prev) =>
      prev.map((t) => ({ ...t, cart: t.cart.filter((i) => i.medication.id !== id), updatedAt: Date.now() }))
    );

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRODUCT_DELETED',
      details: `Deleted product ${item?.name || id} from catalog`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());

    showToast(`Removed ${item?.name || 'item'} from inventory.`, 'info');
  };

  const handleAdjustStock = (
    medicationId: string,
    newStock: number,
    reason: string,
    newBatchNumber?: string,
    newExpiryDate?: string
  ) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can adjust stock levels.', 'warning');
      return;
    }
    const med = medications.find((m) => m.id === medicationId);
    if (!med) {
      showToast('Medication not found in inventory.', 'error');
      return;
    }

    // Stricter Validation: Stock levels can never fall below zero
    if (typeof newStock !== 'number' || isNaN(newStock) || newStock < 0) {
      showToast(`Compliance Error: Stock levels cannot fall below zero (requested: ${newStock}). Transaction rejected.`, 'error');
      return;
    }

    // Stricter Validation: Batch information must be strictly associated with every product adjustment
    const batch = (newBatchNumber && newBatchNumber.trim()) || med.batchNumber?.trim();
    if (!batch) {
      showToast('Pharmaceutical Compliance Error: Every stock adjustment must be strictly associated with a valid batch/lot number.', 'error');
      return;
    }

    const expiry = (newExpiryDate && newExpiryDate.trim()) || med.expiryDate?.trim();
    if (!expiry) {
      showToast('Pharmaceutical Compliance Error: Valid expiration date is required for stock adjustment batch association.', 'error');
      return;
    }

    if (!reason || !reason.trim()) {
      showToast('Pharmaceutical Compliance Error: Reason is mandatory for regulatory audit compliance.', 'error');
      return;
    }

    const prevStock = med.stock;
    const cleanStock = Math.max(0, Math.floor(newStock));
    const diff = cleanStock - prevStock;

    const updated: Medication = {
      ...med,
      stock: cleanStock,
      batchNumber: batch,
      expiryDate: expiry,
    };
    const updatedList = medications.map((m) => (m.id === medicationId ? updated : m));
    setMedications(updatedList);
    storageService.saveMedications(updatedList);
    storageService.pushMedicationToCloud(updated);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'STOCK_ADJUSTMENT',
      details: `Compliance Verified | Product: "${med.name}" | Batch: "${batch}" | Expiry: "${expiry}" | Previous Stock: ${prevStock} -> New Stock: ${cleanStock} (Adjustment: ${diff >= 0 ? '+' : ''}${diff}) | Reason: ${reason.trim()}`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Stock adjusted for ${med.name}: ${prevStock} -> ${cleanStock} (${diff >= 0 ? '+' : ''}${diff}) [Batch: ${batch}]`, 'success');
  };

  // Prescription Management Handlers
  const handleAddNewPrescription = (newRx: Prescription) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can write new prescriptions.', 'warning');
      return;
    }
    const updated = [newRx, ...prescriptions];
    setPrescriptions(updated);
    storageService.savePrescriptions(updated);
    storageService.pushPrescriptionToCloud(newRx);
    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRESCRIPTION_CREATED',
      details: `Registered prescription ${newRx.rxNumber} for ${newRx.patientName} (${newRx.medicationName})`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Prescription ${newRx.rxNumber} for ${newRx.patientName} registered.`, 'success');
  };

  // Clinical Test Handlers (clinician orders & records results)
  const handleAddNewTest = (newTest: MedicalTest) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can order clinical tests.', 'warning');
      return;
    }
    const updated = [newTest, ...tests];
    setTests(updated);
    storageService.saveTests(updated);
    storageService.pushTestToCloud(newTest);
    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'TEST_ORDERED',
      details: `Ordered test ${newTest.testNumber} (${newTest.testType}) for ${newTest.patientName}`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Test ${newTest.testNumber} for ${newTest.patientName} ordered.`, 'success');
  };

  const handleUpdateTest = (updatedTest: MedicalTest) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can record test results.', 'warning');
      return;
    }
    const updated = tests.map((t) => (t.id === updatedTest.id ? updatedTest : t));
    setTests(updated);
    storageService.saveTests(updated);
    storageService.pushTestToCloud(updatedTest);
    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'TEST_UPDATED',
      details: `Updated test ${updatedTest.testNumber} for ${updatedTest.patientName} to status "${updatedTest.status}"`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Test ${updatedTest.testNumber} updated.`, 'success');
  };

  const handleDispensePrescriptionToCart = (rx: Prescription) => {
    const med = medications.find((m) => m.id === rx.medicationId);
    if (!med) {
      alert('Associated medication not found in pharmacy inventory.');
      return;
    }

    if (med.stock < rx.quantityPrescribed) {
      alert(`Insufficient stock! ${rx.quantityPrescribed} prescribed, but only ${med.stock} on shelf.`);
      return;
    }

    // Co-pay discount
    const itemDiscount = rx.insuranceCoPayRate !== undefined ? (1 - rx.insuranceCoPayRate) * 100 : 0;

    const existingIndex = activePOSTab.cart.findIndex(
      (item) => item.medication.id === med.id && item.prescriptionId === rx.id
    );

    if (existingIndex > -1) {
      showToast(`Prescription ${rx.rxNumber} already in active tab "${activePOSTab.name}".`, 'info');
    } else {
      const newItem: CartItem = {
        medication: med,
        quantity: rx.quantityPrescribed,
        prescriptionId: rx.id,
        rxNumber: rx.rxNumber,
        patientName: rx.patientName,
        discountPercent: itemDiscount,
      };
      const updatedCart = [...activePOSTab.cart, newItem];
      setPosTabs((prev) =>
        prev.map((t) => {
          if (t.id === activePOSTab.id) {
            const isGeneric = /^Tab \d+$/i.test(t.name);
            const tabName = isGeneric ? `${t.name}: ${rx.patientName}` : t.name;
            return {
              ...t,
              cart: updatedCart,
              patientName: t.patientName || rx.patientName,
              name: tabName,
              isParked: false,
              updatedAt: Date.now(),
            };
          }
          return t;
        })
      );
      playScanSuccessBeep();
      showToast(
        `Prescription ${rx.rxNumber} dispensed to "${activePOSTab.name}" (${itemDiscount.toFixed(0)}% co-pay applied).`,
        'success'
      );
    }

    // Switch to POS checkout tab so cashier can tender immediately
    setActiveTab('pos');
  };

  // Barcode Detection Handler
  const handleBarcodeScanned = (code: string) => {
    setIsScannerOpen(false);
    playScanSuccessBeep();

    // 1. Check Prescriptions
    const matchedRx = prescriptions.find(
      (r) => r.rxNumber.toLowerCase() === code.toLowerCase() || r.barcode.toLowerCase() === code.toLowerCase()
    );

    if (matchedRx) {
      handleDispensePrescriptionToCart(matchedRx);
      return;
    }

    // 2. Check Medications by Barcode or ID
    const matchedMed = medications.find(
      (m) => m.barcode.toLowerCase() === code.toLowerCase() || m.id.toLowerCase() === code.toLowerCase()
    );

    if (matchedMed) {
      if (matchedMed.stock <= 0) {
        showToast(`Compliance Alert: Medication ${matchedMed.name} (${matchedMed.barcode}) is out of stock.`, 'warning');
        return;
      }

      // Add to active tab's cart with stock limit guard
      const existingIdx = activePOSTab.cart.findIndex((i) => i.medication.id === matchedMed.id);
      let updatedCart: CartItem[];
      if (existingIdx > -1) {
        if (activePOSTab.cart[existingIdx].quantity + 1 > matchedMed.stock) {
          showToast(`Stock limit reached: Only ${matchedMed.stock} units available for ${matchedMed.name}.`, 'warning');
          return;
        }
        updatedCart = [...activePOSTab.cart];
        updatedCart[existingIdx].quantity += 1;
      } else {
        updatedCart = [...activePOSTab.cart, { medication: matchedMed, quantity: 1 }];
      }
      handleUpdateActiveCart(updatedCart);

      showToast(`Scanned & added: ${matchedMed.name} to tab "${activePOSTab.name}"`, 'success');
      if (activeTab !== 'pos') {
        setActiveTab('pos');
      }
      return;
    }

    showToast(`Barcode "${code}" was not recognized in prescriptions or drug catalog.`, 'warning');
  };

  // Sale Finalization with strict pharmaceutical stock and batch validation
  const handleCompleteSale = (transaction: SaleTransaction) => {
    // 0. Pharmaceutical Compliance Validation: Ensure stock levels NEVER fall below zero during any transaction
    for (const soldItem of transaction.items) {
      const currentMed = medications.find((m) => m.id === soldItem.medicationId);
      if (!currentMed) {
        showToast(
          `Pharmaceutical Compliance Error: Drug "${soldItem.name}" does not exist in inventory catalog. Sale aborted.`,
          'error'
        );
        return;
      }
      if (currentMed.stock < soldItem.quantity) {
        showToast(
          `Pharmaceutical Compliance Error: Stock for "${currentMed.name}" cannot fall below zero! Shelf stock is ${currentMed.stock}, but ${soldItem.quantity} was requested. Sale rejected.`,
          'error'
        );
        return;
      }
    }

    // 1. Deduct stock from inventory strictly enforcing floor of 0
    const updatedMeds = medications.map((med) => {
      const soldItem = transaction.items.find((item) => item.medicationId === med.id);
      if (soldItem) {
        return {
          ...med,
          stock: Math.max(0, med.stock - soldItem.quantity),
        };
      }
      return med;
    });
    setMedications(updatedMeds);
    storageService.saveMedications(updatedMeds);
    updatedMeds
      .filter((med) => transaction.items.some((item) => item.medicationId === med.id))
      .forEach((med) => storageService.pushMedicationToCloud(med));

    // 2. Update prescription refill status if applicable
    const updatedRxs = prescriptions.map((rx) => {
      const soldRx = transaction.items.find((item) => item.rxNumber === rx.rxNumber);
      if (soldRx) {
        const newRemaining = Math.max(0, rx.refillsRemaining - 1);
        return {
          ...rx,
          refillsRemaining: newRemaining,
          quantityDispensedSoFar: rx.quantityDispensedSoFar + soldRx.quantity,
          status: newRemaining === 0 ? ('Dispensed' as const) : rx.status,
        };
      }
      return rx;
    });
    setPrescriptions(updatedRxs);
    storageService.savePrescriptions(updatedRxs);
    updatedRxs
      .filter((rx) => transaction.items.some((item) => item.rxNumber === rx.rxNumber))
      .forEach((rx) => storageService.pushPrescriptionToCloud(rx));

    // 3. Persist transaction
    const newTxList = [transaction, ...transactions];
    setTransactions(newTxList);
    storageService.saveTransactions(newTxList);

    // 4. Log Audit Trail with strict Batch association
    if (currentUser) {
      const batchDetails = transaction.items
        .map((it) => `${it.name} (Qty: ${it.quantity}, Batch: ${it.batchNumber || 'Unspecified'})`)
        .join('; ');
      storageService.addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'SALE_COMPLETED',
        details: `Sale ${transaction.receiptNumber} recorded (${transaction.items.length} items, Total: ${formatKSh(
          transaction.total
        )}, Method: ${transaction.paymentMethod}, Tab: "${activePOSTab.name}") | Batches Dispensed: [${batchDetails}]`,
        category: 'SALES',
      });
      setAuditLogs(storageService.getAuditLogs());
    }

    // 5. Manage Tab Post-Sale
    if (posTabs.length > 1) {
      const remainingTabs = posTabs.filter((t) => t.id !== activePOSTab.id);
      setPosTabs(remainingTabs);
      setActivePOSTabId(remainingTabs[0].id);
      showToast(`Sale completed on tab "${activePOSTab.name}". Switched to "${remainingTabs[0].name}".`, 'success');
    } else {
      const freshTab: POSTab = {
        id: `tab-${Date.now()}`,
        name: 'Tab 1',
        cart: [],
        patientName: '',
        isParked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setPosTabs([freshTab]);
      setActivePOSTabId(freshTab.id);
      showToast(`Sale completed successfully! Receipt ${transaction.receiptNumber}`, 'success');
    }

    // 6. Handle Offline Queueing or Supabase RPC commit
    if (transaction.isOffline || !isOnline || !supabaseConfig.isConfigured()) {
      pharmacyService.enqueueOfflineSale(transaction);
      setOfflineQueue(pharmacyService.getOfflineQueue());
      showToast(`Sale recorded in offline queue (${transaction.receiptNumber}). Will auto-sync when online.`, 'info');
    } else {
      pharmacyService.completeSale(transaction).then((res) => {
        if (!res.success) {
          pharmacyService.enqueueOfflineSale(transaction);
          setOfflineQueue(pharmacyService.getOfflineQueue());
        }
      }).catch(() => {
        pharmacyService.enqueueOfflineSale(transaction);
        setOfflineQueue(pharmacyService.getOfflineQueue());
      });
    }

    // 7. Open thermal receipt modal
    setReceiptModalTx(transaction);
  };

  // System Data Reset Handler (Admin Only) - wipes stock, sales & activity while strictly preserving shop details & accounts
  const handleResetSystemData = () => {
    if (currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can reset system data.', 'error');
      return;
    }

    storageService.resetBusinessData({
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    });

    // Refresh state in App.tsx
    setMedications([]);
    setTransactions([]);
    setOfflineQueue([]);
    setPrescriptions([]);
    setTests([]);
    setAuditLogs(storageService.getAuditLogs());

    // Reset POS tabs
    const freshTab: POSTab = {
      id: 'tab-1',
      name: 'Tab 1',
      cart: [],
      patientName: '',
      isParked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPosTabs([freshTab]);
    setActivePOSTabId('tab-1');

    // Keep shop details intact
    const preservedSettings = storageService.getReceiptSettings();
    setReceiptSettings(preservedSettings);

    showToast(
      `System reset complete: All stock, sales, and past logs deleted. Shop profile for "${preservedSettings.pharmacyName}" preserved.`,
      'success'
    );
  };

  // Authentication & Session
  const handleLogin = (user: User) => {
    setCurrentUser(user);
    if (!isTabAllowedForRole(activeTab, user.role)) {
      setActiveTab(defaultTabForRole(user.role));
    }
    showToast(`Signed into session as ${user.name}`, 'success');
  };

  // Low stock calculation
  const lowStockCount = medications.filter((m) => m.stock <= m.minStockLevel).length;

  // Daily Sales Calculation
  const today = new Date().toDateString();
  const todayTransactions = transactions.filter((t) => new Date(t.timestamp).toDateString() === today);
  const todayRevenue = todayTransactions.reduce((sum, t) => sum + t.total, 0);
  const todayRevenueFormatted = formatKSh(todayRevenue);

  // If user is logged out, render standalone login authentication screen
  if (!currentUser) {
    return (
      <>
        {toastMessage && (
          <div className="fixed top-6 right-4 z-50 animate-fade-in no-print max-w-sm">
            <div
              className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold border ${
                toastMessage.type === 'success'
                  ? 'bg-teal-900 text-white border-teal-700'
                  : toastMessage.type === 'error'
                  ? 'bg-red-900 text-white border-red-700'
                  : toastMessage.type === 'warning'
                  ? 'bg-amber-900 text-white border-amber-700'
                  : 'bg-slate-900 text-white border-slate-700'
              }`}
            >
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
              ) : toastMessage.type === 'error' ? (
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}
        <LoginView
          onLogin={handleLogin}
          pharmacyName={receiptSettings.pharmacyName}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 md:top-6 right-4 z-50 animate-fade-in no-print max-w-sm">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold border ${
              toastMessage.type === 'success'
                ? 'bg-teal-900 text-white border-teal-700'
                : toastMessage.type === 'error'
                ? 'bg-red-900 text-white border-red-700'
                : toastMessage.type === 'warning'
                ? 'bg-amber-900 text-white border-amber-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            ) : toastMessage.type === 'error' ? (
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Left-aligned Navigation Sidebar & Mobile Drawer */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (!isTabAllowedForRole(tab, currentUser.role)) {
            showToast('That module is not available for your role.', 'warning');
            return;
          }
          setActiveTab(tab);
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
        lowStockCount={lowStockCount}
        isOnline={isOnline}
        isSimulatedOffline={isSimulatedOffline}
        onToggleSimulatedOffline={toggleSimulatedOffline}
        offlineQueueCount={offlineQueue.length}
        onSyncOfflineQueue={handleSyncOfflineQueue}
        pharmacyName={receiptSettings.pharmacyName}
        todaySalesCount={todayTransactions.length}
        todayRevenueFormatted={todayRevenueFormatted}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          {activeTab === 'pos' && (
            <POSTerminal
              medications={medications}
              prescriptions={prescriptions}
              cart={activePOSTab.cart}
              onUpdateCart={handleUpdateActiveCart}
              onCompleteSale={handleCompleteSale}
              onOpenScanner={() => setIsScannerOpen(true)}
              receiptSettings={receiptSettings}
              isOnline={isOnline}
              currentUser={currentUser}
              tabs={posTabs}
              activeTabId={activePOSTab.id}
              onSelectTab={handleSelectPOSTab}
              onAddTab={handleAddPOSTab}
              onCloseTab={handleClosePOSTab}
              onRenameTab={handleRenamePOSTab}
              onToggleParkTab={handleToggleParkPOSTab}
              activePatientName={activePOSTab.patientName || ''}
              onUpdatePatientName={handleUpdateActivePatientName}
            />
          )}

          {activeTab === 'prescriptions' && (
            <PrescriptionsManager
              prescriptions={prescriptions}
              medications={medications}
              onDispensePrescription={handleDispensePrescriptionToCart}
              onAddNewPrescription={handleAddNewPrescription}
              onOpenBarcodeScanner={() => setIsScannerOpen(true)}
              userRole={currentUser.role}
            />
          )}

          {activeTab === 'tests' && (
            <TestsManager
              tests={tests}
              onAddNewTest={handleAddNewTest}
              onUpdateTest={handleUpdateTest}
              userRole={currentUser.role}
              currentUserName={currentUser.name}
              currentUserLicense={currentUser.licenseNumber}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryManager
              medications={medications}
              onUpdateMedication={handleUpdateMedication}
              onAddMedication={handleAddMedication}
              onDeleteMedication={handleDeleteMedication}
              onAdjustStock={handleAdjustStock}
              onAddToCart={(med) => {
                const existingIdx = activePOSTab.cart.findIndex((i) => i.medication.id === med.id);
                let updated: CartItem[];
                if (existingIdx > -1) {
                  updated = [...activePOSTab.cart];
                  updated[existingIdx].quantity += 1;
                } else {
                  updated = [...activePOSTab.cart, { medication: med, quantity: 1 }];
                }
                handleUpdateActiveCart(updated);
                showToast(`Added ${med.name} to POS tab "${activePOSTab.name}".`, 'success');
                setActiveTab('pos');
              }}
              userRole={currentUser.role}
            />
          )}

          {/* ADMIN-ONLY MODULE: Staff & Role Management */}
          {activeTab === 'users' && currentUser.role === 'admin' && (
            <UserManagementView
              currentUser={currentUser}
              users={users}
              onRefreshUsers={refreshUsersAndLogs}
              onShowToast={showToast}
            />
          )}

          {/* ADMIN-ONLY MODULE: Admin Settings */}
          {activeTab === 'settings' && currentUser.role === 'admin' && (
            <ReceiptSettingsView
              settings={receiptSettings}
              onSaveSettings={(newSettings) => {
                setReceiptSettings(newSettings);
                storageService.saveReceiptSettings(newSettings);
                storageService.addAuditLog({
                  userId: currentUser.id,
                  userName: currentUser.name,
                  userRole: currentUser.role,
                  action: 'SETTINGS_MODIFIED',
                  details: `Updated receipt customization & tax PIN (${newSettings.pharmacyName})`,
                  category: 'SETTINGS',
                });
                setAuditLogs(storageService.getAuditLogs());
                showToast('Receipt customization settings updated & saved!', 'success');
              }}
              userRole={currentUser.role}
              onResetSystemData={handleResetSystemData}
              medicationCount={medications.length}
              transactionCount={transactions.length}
              prescriptionCount={prescriptions.length}
              auditLogCount={auditLogs.length}
            />
          )}

          {/* ADMIN-ONLY MODULE: Sales & Financial Auditing */}
          {activeTab === 'reports' && currentUser.role === 'admin' && (
            <ReportsView
              transactions={transactions}
              medications={medications}
              offlineQueueCount={offlineQueue.length}
              onSyncOfflineQueue={handleSyncOfflineQueue}
              onViewReceipt={(tx) => setReceiptModalTx(tx)}
              userRole={currentUser.role}
            />
          )}

          {/* ADMIN-ONLY MODULE: System Audit Logs Trail */}
          {activeTab === 'audit' && currentUser.role === 'admin' && (
            <AuditLogsView logs={auditLogs} currentUser={currentUser} />
          )}

          {/* PERSONAL MODULE: My Profile (Staff and Admin) */}
          {activeTab === 'profile' && (
            <UserProfileView
              currentUser={currentUser}
              onUpdateCurrentUser={(updated) => {
                setCurrentUser(updated);
                refreshUsersAndLogs();
              }}
              onShowToast={showToast}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Barcode Scanner Camera Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleBarcodeScanned}
        title="Pharmacy Barcode Reader (Rx Script & Medication NDC)"
      />

      {/* Printed Thermal Receipt Modal */}
      {receiptModalTx && (
        <ReceiptModal
          transaction={receiptModalTx}
          settings={receiptSettings}
          onClose={() => setReceiptModalTx(null)}
        />
      )}
    </div>
  );
}
