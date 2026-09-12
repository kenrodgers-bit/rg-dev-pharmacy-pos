import { getSupabase, mapProfileToUser } from './supabase';
import {
  AuditLog,
  Category,
  InventoryBatch,
  MedicalTest,
  Medication,
  Prescription,
  PrescriptionItem,
  ReceiptSettings,
  SaleTransaction,
  User,
  UserRole,
} from '../types';

export const pharmacyService = {
  /**
   * Checks if any users exist in the database (used for initial admin setup)
   */
  async hasUsers(): Promise<boolean> {
    const client = getSupabase();
    if (!client) return true; // fallback
    try {
      const { count, error } = await client
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      if (error) return true;
      return (count ?? 0) > 0;
    } catch {
      return true;
    }
  },

  /**
   * Bootstraps the first administrator if no users exist
   */
  async bootstrapFirstAdmin(email: string, password: string, fullName: string): Promise<User> {
    const client = getSupabase();
    if (!client) throw new Error('Supabase is not configured.');

    const { data, error } = await client.rpc('bootstrap_first_admin', {
      p_email: email,
      p_password: password,
      p_full_name: fullName,
    });

    if (error) throw new Error(error.message);

    // Sign in the newly bootstrapped admin
    const { data: authData, error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !authData.user) {
      throw new Error(signInError?.message || 'Bootstrap succeeded, but sign-in failed.');
    }

    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    return mapProfileToUser(authData.user, profile);
  },

  /**
   * Gets current authenticated user profile
   */
  async getCurrentUser(): Promise<User | null> {
    const client = getSupabase();
    if (!client) return null;

    try {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError || !session?.user) return null;

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        return null;
      }

      // Enforcement of active account status
      if (profile.status !== 'ACTIVE') {
        await client.auth.signOut();
        throw new Error('This account has been deactivated. Please contact your system administrator.');
      }

      return mapProfileToUser(session.user, profile);
    } catch (e) {
      console.warn('getCurrentUser error', e);
      return null;
    }
  },

  /**
   * Signs out current authenticated user
   */
  async signOut(): Promise<void> {
    const client = getSupabase();
    if (client) {
      await client.auth.signOut();
    }
  },

  /**
   * Fetch categories from database
   */
  async fetchCategories(): Promise<Category[]> {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to load categories', error);
      return [];
    }

    return (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      description: c.description || undefined,
      active: c.active,
    }));
  },

  /**
   * Fetch all medications with live batch inventory
   */
  async fetchMedications(): Promise<Medication[]> {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('medications')
      .select(`
        id,
        name,
        generic_name,
        dosage,
        form,
        category_id,
        barcode,
        is_prescription_required,
        price,
        cost_price,
        manufacturer,
        min_stock_level,
        requires_refrigeration,
        active,
        categories ( id, name ),
        inventory_batches (
          id,
          medication_id,
          batch_number,
          expiry_date,
          quantity_on_hand,
          unit_cost,
          received_at,
          active
        )
      `)
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to load medications from Supabase', error);
      return [];
    }

    return (data || []).map((m: any) => {
      const activeBatches: InventoryBatch[] = (m.inventory_batches || [])
        .filter((b: any) => b.active)
        .map((b: any) => ({
          id: b.id,
          medicationId: b.medication_id,
          batchNumber: b.batch_number,
          expiryDate: b.expiry_date,
          quantityOnHand: b.quantity_on_hand,
          unitCost: Number(b.unit_cost) || 0,
          receivedAt: b.received_at,
          active: b.active,
        }));

      // Calculate total stock across active batches
      const totalStock = activeBatches.reduce((acc, b) => acc + (b.quantityOnHand || 0), 0);

      // Sort batches by expiry date (FEFO) to pick nearest expiry for display compatibility
      const sortedBatches = [...activeBatches].sort(
        (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
      );
      const primaryBatch = sortedBatches.find((b) => b.quantityOnHand > 0) || sortedBatches[0];

      return {
        id: m.id,
        name: m.name,
        genericName: m.generic_name,
        dosage: m.dosage,
        form: m.form,
        categoryId: m.category_id,
        category: m.categories?.name || 'General',
        isPrescriptionRequired: m.is_prescription_required,
        barcode: m.barcode,
        price: Number(m.price),
        costPrice: Number(m.cost_price),
        stock: totalStock,
        minStockLevel: m.min_stock_level,
        batchNumber: primaryBatch?.batchNumber || 'N/A',
        expiryDate: primaryBatch?.expiryDate || 'N/A',
        manufacturer: m.manufacturer,
        requiresRefrigeration: m.requires_refrigeration,
        active: m.active,
        batches: activeBatches,
      };
    });
  },

  /**
   * Add medication and initial inventory batch (Admin only)
   */
  async addMedication(med: Medication, initialBatchNumber: string, initialExpiry: string, initialStock: number): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    // 1. Insert medication master
    const { data: newMed, error: medError } = await client
      .from('medications')
      .insert({
        name: med.name.trim(),
        generic_name: med.genericName.trim(),
        dosage: med.dosage.trim(),
        form: med.form,
        barcode: med.barcode.trim(),
        is_prescription_required: med.isPrescriptionRequired,
        price: med.price,
        cost_price: med.costPrice,
        manufacturer: med.manufacturer.trim(),
        min_stock_level: med.minStockLevel || 10,
        requires_refrigeration: med.requiresRefrigeration || false,
        active: true,
      })
      .select('id')
      .single();

    if (medError || !newMed) throw new Error(medError?.message || 'Failed to insert medication catalog item.');

    // 2. Insert initial inventory batch if stock provided
    if (initialStock > 0 && initialBatchNumber && initialExpiry) {
      const { data: batch, error: batchError } = await client
        .from('inventory_batches')
        .insert({
          medication_id: newMed.id,
          batch_number: initialBatchNumber.trim(),
          expiry_date: initialExpiry,
          quantity_on_hand: initialStock,
          unit_cost: med.costPrice,
          active: true,
        })
        .select('id')
        .single();

      if (batchError || !batch) {
        console.error('Batch creation warning', batchError);
      } else {
        // Record initial receipt movement
        await client.from('inventory_movements').insert({
          medication_id: newMed.id,
          batch_id: batch.id,
          quantity_change: initialStock,
          movement_type: 'RECEIPT',
          reference_type: 'INITIAL_STOCK',
          reason: 'Initial stock intake upon catalog creation',
        });
      }
    }
  },

  /**
   * Update medication master record (Admin only)
   */
  async updateMedication(med: Medication): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    const { error } = await client
      .from('medications')
      .update({
        name: med.name.trim(),
        generic_name: med.genericName.trim(),
        dosage: med.dosage.trim(),
        form: med.form,
        price: med.price,
        cost_price: med.costPrice,
        manufacturer: med.manufacturer.trim(),
        min_stock_level: med.minStockLevel,
        is_prescription_required: med.isPrescriptionRequired,
        requires_refrigeration: med.requiresRefrigeration || false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', med.id);

    if (error) throw new Error(error.message);
  },

  /**
   * Adjust inventory level for a batch via atomic RPC function (Admin only)
   */
  async adjustInventoryRpc(batchId: string, quantityChange: number, reason: string): Promise<any> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    const { data, error } = await client.rpc('adjust_inventory', {
      p_batch_id: batchId,
      p_quantity_change: quantityChange,
      p_reason: reason,
    });

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Complete Sale via Transaction-Safe PostgreSQL RPC (Phases 19 & 20)
   */
  async completeSaleRpc(params: {
    clientOperationId: string;
    receiptNumber: string;
    items: Array<{
      medication_id: string;
      batch_id?: string;
      quantity: number;
      unit_price: number;
      discount_percent?: number;
      prescription_item_id?: string;
    }>;
    paymentMethod: string;
    total: number;
    subtotal: number;
    tax: number;
    discount: number;
    amountTendered?: number;
    patientId?: string;
    prescriptionId?: string;
    paymentReference?: string;
    isOffline?: boolean;
  }): Promise<{ success: boolean; saleId: string; receiptNumber: string; idempotent: boolean }> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    // Map UI payment method string to uppercase DB payment method enum
    let dbMethod = 'CASH';
    const pm = params.paymentMethod.toLowerCase();
    if (pm.includes('m-pesa') || pm.includes('mpesa')) {
      dbMethod = pm.includes('partial') ? 'SPLIT' : 'MPESA';
    } else if (pm.includes('card')) {
      dbMethod = 'CARD';
    } else if (pm.includes('insurance')) {
      dbMethod = 'INSURANCE';
    }

    const { data, error } = await client.rpc('complete_sale', {
      p_operation_id: params.clientOperationId,
      p_receipt_number: params.receiptNumber,
      p_items: params.items,
      p_payment_method: dbMethod,
      p_total: params.total,
      p_subtotal: params.subtotal,
      p_tax: params.tax,
      p_discount: params.discount,
      p_amount_tendered: params.amountTendered || null,
      p_patient_id: params.patientId || null,
      p_prescription_id: params.prescriptionId || null,
      p_payment_reference: params.paymentReference || null,
      p_is_offline: Boolean(params.isOffline),
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      success: data.success,
      saleId: data.sale_id,
      receiptNumber: data.receipt_number,
      idempotent: Boolean(data.idempotent),
    };
  },

  /**
   * Completes a sale transaction using the atomic PostgreSQL complete_sale RPC
   */
  async completeSale(transaction: SaleTransaction): Promise<{ success: boolean; saleId?: string; receiptNumber?: string }> {
    const clientOpId = transaction.clientOperationId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'op-' + Date.now());

    // Format items for RPC
    const items = transaction.items.map((it) => ({
      medication_id: it.medicationId,
      batch_id: it.batchId,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      discount_percent: it.discountPercent || 0,
      prescription_item_id: it.prescriptionItemId,
    }));

    const result = await this.completeSaleRpc({
      clientOperationId: clientOpId,
      receiptNumber: transaction.receiptNumber,
      items,
      paymentMethod: transaction.paymentMethod,
      total: transaction.total,
      subtotal: transaction.subtotal,
      tax: transaction.tax,
      discount: transaction.discount,
      patientId: transaction.patientId,
      prescriptionId: transaction.prescriptionId,
      paymentReference: transaction.mpesaReference,
      isOffline: Boolean(transaction.isOffline),
    });

    return result;
  },

  /**
   * Offline sale queue management (Phase 27)
   */
  getOfflineQueue(): SaleTransaction[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('pharmapos_offline_queue');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  enqueueOfflineSale(transaction: SaleTransaction): void {
    if (typeof window === 'undefined') return;
    try {
      const queue = this.getOfflineQueue();
      const withOpId: SaleTransaction = {
        ...transaction,
        clientOperationId: transaction.clientOperationId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'op-' + Date.now()),
        isOffline: true,
        synced: false,
      };
      // Deduplicate by receipt number or clientOperationId
      const exists = queue.some((q) => q.receiptNumber === withOpId.receiptNumber || (q.clientOperationId && q.clientOperationId === withOpId.clientOperationId));
      if (!exists) {
        queue.push(withOpId);
        localStorage.setItem('pharmapos_offline_queue', JSON.stringify(queue));
      }
    } catch (e) {
      console.error('Failed to enqueue offline sale', e);
    }
  },

  clearOfflineQueue(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pharmapos_offline_queue');
    }
  },

  async syncOfflineSales(): Promise<{ synced: number; failed: number; conflicts: string[] }> {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) {
      return { synced: 0, failed: 0, conflicts: [] };
    }

    let synced = 0;
    let failed = 0;
    const conflicts: string[] = [];
    const remainingQueue: SaleTransaction[] = [];

    for (const tx of queue) {
      try {
        const res = await this.completeSale({
          ...tx,
          isOffline: true,
        });
        if (res.success) {
          synced++;
        } else {
          failed++;
          conflicts.push(`Receipt ${tx.receiptNumber}: could not be reconciled.`);
          remainingQueue.push(tx);
        }
      } catch (err: unknown) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        conflicts.push(`Receipt ${tx.receiptNumber}: ${msg}`);
        remainingQueue.push(tx);
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('pharmapos_offline_queue', JSON.stringify(remainingQueue));
    }

    return { synced, failed, conflicts };
  },

  /**
   * Fetch sales transactions for reports
   */
  async fetchSales(limit = 100): Promise<SaleTransaction[]> {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('sales')
      .select(`
        id,
        receipt_number,
        client_operation_id,
        subtotal,
        tax,
        discount,
        total,
        status,
        is_offline,
        created_at,
        patient_id,
        prescription_id,
        cashier_id,
        profiles ( full_name, role ),
        patients ( full_name ),
        sale_items (
          id,
          medication_id,
          batch_id,
          quantity,
          unit_price,
          total_price,
          medications ( name, generic_name, dosage, is_prescription_required ),
          inventory_batches ( batch_number, expiry_date )
        ),
        payments (
          payment_method,
          amount,
          reference_code,
          metadata
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch sales from Supabase', error);
      return [];
    }

    return (data || []).map((s: any) => {
      const cashierName = s.profiles?.full_name || 'Cashier';
      const cashierRole: UserRole = (s.profiles?.role?.toLowerCase() as UserRole) || 'cashier';
      const patientName = s.patients?.full_name || undefined;

      const items = (s.sale_items || []).map((it: any) => ({
        medicationId: it.medication_id,
        batchId: it.batch_id,
        name: it.medications?.name || 'Medication',
        genericName: it.medications?.generic_name || '',
        dosage: it.medications?.dosage || '',
        isPrescription: Boolean(it.medications?.is_prescription_required),
        quantity: it.quantity,
        unitPrice: Number(it.unit_price),
        totalPrice: Number(it.total_price),
        batchNumber: it.inventory_batches?.batch_number,
        expiryDate: it.inventory_batches?.expiry_date,
      }));

      const primaryPayment = s.payments?.[0];
      let displayMethod: SaleTransaction['paymentMethod'] = 'Cash';
      if (primaryPayment) {
        if (primaryPayment.payment_method === 'MPESA') displayMethod = 'M-Pesa';
        else if (primaryPayment.payment_method === 'CARD') displayMethod = 'Credit/Debit Card';
        else if (primaryPayment.payment_method === 'INSURANCE') displayMethod = 'Insurance';
        else if (primaryPayment.payment_method === 'SPLIT') displayMethod = 'Partial (Cash + M-Pesa)';
      }

      return {
        id: s.id,
        clientOperationId: s.client_operation_id,
        receiptNumber: s.receipt_number,
        timestamp: s.created_at,
        cashierName,
        cashierRole,
        items,
        subtotal: Number(s.subtotal),
        tax: Number(s.tax),
        discount: Number(s.discount),
        total: Number(s.total),
        paymentMethod: displayMethod,
        patientName,
        patientId: s.patient_id,
        prescriptionId: s.prescription_id,
        mpesaReference: primaryPayment?.reference_code,
        isOffline: s.is_offline,
        synced: true,
        syncTimestamp: s.created_at,
      };
    });
  },

  /**
   * Fetch multi-item prescriptions
   */
  async fetchPrescriptions(): Promise<Prescription[]> {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('prescriptions')
      .select(`
        id,
        prescription_number,
        barcode,
        patient_id,
        clinician_id,
        status,
        notes,
        issued_at,
        expiry_date,
        patients (
          full_name,
          date_of_birth,
          phone
        ),
        profiles (
          full_name,
          license_number
        ),
        prescription_items (
          id,
          medication_id,
          dosage,
          frequency,
          duration,
          quantity,
          instructions,
          dispensing_status,
          quantity_dispensed,
          medications ( name )
        )
      `)
      .order('issued_at', { ascending: false });

    if (error) {
      console.error('Failed to load prescriptions from Supabase', error);
      return [];
    }

    return (data || []).map((rx: any) => {
      const firstItem = rx.prescription_items?.[0];
      const items: PrescriptionItem[] = (rx.prescription_items || []).map((it: any) => ({
        id: it.id,
        prescriptionId: rx.id,
        medicationId: it.medication_id,
        medicationName: it.medications?.name || 'Medication',
        dosage: it.dosage,
        frequency: it.frequency,
        duration: it.duration,
        quantity: it.quantity,
        instructions: it.instructions,
        dispensingStatus: it.dispensing_status,
        quantityDispensed: it.quantity_dispensed,
      }));

      let statusDisplay: Prescription['status'] = 'Active';
      if (rx.status === 'DISPENSED') statusDisplay = 'Dispensed';
      else if (rx.status === 'PARTIALLY_DISPENSED') statusDisplay = 'Partially Dispensed';
      else if (rx.status === 'CANCELLED') statusDisplay = 'Cancelled';
      else if (rx.status === 'EXPIRED') statusDisplay = 'Expired';

      return {
        id: rx.id,
        rxNumber: rx.prescription_number,
        barcode: rx.barcode,
        patientId: rx.patient_id,
        patientName: rx.patients?.full_name || 'Patient',
        patientDOB: rx.patients?.date_of_birth || '1990-01-01',
        patientPhone: rx.patients?.phone || '',
        doctorName: rx.profiles?.full_name || 'Dr. Clinician',
        doctorLicense: rx.profiles?.license_number || 'MED-0000',
        doctorClinic: 'RG Apothecary & Clinic',
        medicationId: firstItem?.medication_id || '',
        medicationName: firstItem?.medications?.name || (items.length > 1 ? `${items.length} Medications` : 'Unspecified'),
        dosageInstructions: firstItem ? `${firstItem.dosage}, ${firstItem.frequency} (${firstItem.instructions})` : '',
        quantityPrescribed: firstItem?.quantity || 0,
        quantityDispensedSoFar: firstItem?.quantity_dispensed || 0,
        refillsAllowed: 1,
        refillsRemaining: rx.status === 'DISPENSED' ? 0 : 1,
        dateIssued: rx.issued_at.split('T')[0],
        expiryDate: rx.expiry_date,
        status: statusDisplay,
        items,
      };
    });
  },

  /**
   * Create prescription with multi-item support (Clinician/Admin only)
   */
  async createPrescription(rx: Prescription, itemsList?: Partial<PrescriptionItem>[]): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    // 1. Ensure patient exists in patients table
    let patientId = rx.patientId;
    if (!patientId) {
      const patientNumber = 'PAT-' + Math.floor(10000 + Math.random() * 90000);
      const { data: newPatient, error: patientError } = await client
        .from('patients')
        .insert({
          patient_number: patientNumber,
          full_name: rx.patientName.trim(),
          date_of_birth: rx.patientDOB || '1990-01-01',
          phone: rx.patientPhone || null,
        })
        .select('id')
        .single();

      if (patientError || !newPatient) {
        throw new Error(patientError?.message || 'Failed to create patient record.');
      }
      patientId = newPatient.id;
    }

    const { data: { session } } = await client.auth.getSession();
    const clinicianId = session?.user?.id;
    if (!clinicianId) throw new Error('Clinician session not found.');

    // 2. Insert prescription master
    const { data: newRx, error: rxError } = await client
      .from('prescriptions')
      .insert({
        prescription_number: rx.rxNumber.trim(),
        barcode: rx.barcode ? rx.barcode.trim() : rx.rxNumber.trim(),
        patient_id: patientId,
        clinician_id: clinicianId,
        status: 'ISSUED',
        notes: rx.dosageInstructions,
        expiry_date: rx.expiryDate,
      })
      .select('id')
      .single();

    if (rxError || !newRx) throw new Error(rxError?.message || 'Failed to create prescription master record.');

    // 3. Insert prescription items
    const rawItems = itemsList && itemsList.length > 0 ? itemsList : [
      {
        medicationId: rx.medicationId,
        dosage: rx.dosageInstructions.split(',')[0] || 'Standard',
        frequency: 'Daily',
        duration: '7 days',
        quantity: rx.quantityPrescribed || 1,
        instructions: rx.dosageInstructions,
      },
    ];

    for (const it of rawItems) {
      if (!it.medicationId) continue;
      await client.from('prescription_items').insert({
        prescription_id: newRx.id,
        medication_id: it.medicationId,
        dosage: it.dosage || 'Standard',
        frequency: it.frequency || 'Daily',
        duration: it.duration || '7 days',
        quantity: it.quantity || 1,
        instructions: it.instructions || rx.dosageInstructions,
        dispensing_status: 'PENDING',
        quantity_dispensed: 0,
      });
    }
  },

  /**
   * Fetch clinical tests
   */
  async fetchTests(): Promise<MedicalTest[]> {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('test_orders')
      .select(`
        id,
        test_number,
        test_type,
        notes,
        date_ordered,
        status,
        patients (
          full_name,
          date_of_birth,
          phone
        ),
        profiles (
          full_name,
          license_number
        ),
        test_results (
          result_summary,
          recorded_at
        )
      `)
      .order('date_ordered', { ascending: false });

    if (error) {
      console.error('Failed to load tests from Supabase', error);
      return [];
    }

    return (data || []).map((t: any) => {
      let statusDisplay: MedicalTest['status'] = 'Ordered';
      if (t.status === 'IN_PROGRESS') statusDisplay = 'In Progress';
      else if (t.status === 'COMPLETED') statusDisplay = 'Completed';
      else if (t.status === 'CANCELLED') statusDisplay = 'Cancelled';

      const result = t.test_results?.[0];

      return {
        id: t.id,
        testNumber: t.test_number,
        patientName: t.patients?.full_name || 'Patient',
        patientDOB: t.patients?.date_of_birth || '1990-01-01',
        patientPhone: t.patients?.phone || '',
        clinicianName: t.profiles?.full_name || 'Dr. Clinician',
        clinicianLicense: t.profiles?.license_number || 'MED-0000',
        testType: t.test_type,
        notes: t.notes || '',
        dateOrdered: t.date_ordered,
        status: statusDisplay,
        resultSummary: result?.result_summary,
        resultDate: result?.recorded_at ? result.recorded_at.split('T')[0] : undefined,
      };
    });
  },

  /**
   * Create new test order (Clinician/Admin only)
   */
  async createTestOrder(test: MedicalTest): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    // 1. Ensure patient exists
    const patientNumber = 'PAT-' + Math.floor(10000 + Math.random() * 90000);
    const { data: patient } = await client
      .from('patients')
      .insert({
        patient_number: patientNumber,
        full_name: test.patientName.trim(),
        date_of_birth: test.patientDOB || '1990-01-01',
        phone: test.patientPhone || null,
      })
      .select('id')
      .single();

    const { data: { session } } = await client.auth.getSession();
    const clinicianId = session?.user?.id;
    if (!clinicianId) throw new Error('Clinician session not found.');

    const { error } = await client.from('test_orders').insert({
      test_number: test.testNumber.trim(),
      patient_id: patient?.id,
      clinician_id: clinicianId,
      test_type: test.testType.trim(),
      notes: test.notes?.trim() || null,
      date_ordered: test.dateOrdered,
      status: 'ORDERED',
    });

    if (error) throw new Error(error.message);
  },

  /**
   * Record test result (Clinician/Admin only)
   */
  async recordTestResult(testOrderId: string, resultSummary: string, status: 'Completed' | 'In Progress' | 'Cancelled'): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    const { data: { session } } = await client.auth.getSession();
    const clinicianId = session?.user?.id;
    if (!clinicianId) throw new Error('Clinician session not found.');

    const dbStatus = status === 'Completed' ? 'COMPLETED' : status === 'In Progress' ? 'IN_PROGRESS' : 'CANCELLED';

    // Update order status
    await client
      .from('test_orders')
      .update({ status: dbStatus, updated_at: new Date().toISOString() })
      .eq('id', testOrderId);

    // Upsert test result
    const { error } = await client.from('test_results').upsert(
      {
        test_order_id: testOrderId,
        result_summary: resultSummary.trim(),
        recorded_by: clinicianId,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: 'test_order_id' }
    );

    if (error) throw new Error(error.message);
  },

  /**
   * Fetch database-backed Audit Logs (Admin only)
   */
  async fetchAuditLogs(limit = 200): Promise<AuditLog[]> {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('audit_logs')
      .select(`
        id,
        user_id,
        role,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        profiles ( full_name )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to load audit logs', error);
      return [];
    }

    return (data || []).map((a: any) => ({
      id: a.id,
      timestamp: a.created_at,
      userId: a.user_id,
      userName: a.profiles?.full_name || 'System / Automated',
      userRole: (a.role?.toLowerCase() as UserRole) || 'cashier',
      action: a.action,
      details: a.metadata ? JSON.stringify(a.metadata) : `${a.action} on ${a.entity_type} ${a.entity_id || ''}`,
      category: (a.entity_type as any) || 'SYSTEM',
      metadata: a.metadata,
    }));
  },

  /**
   * Append database-backed audit log
   */
  async logAuditEvent(action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>): Promise<void> {
    const client = getSupabase();
    if (!client) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      const userId = session?.user?.id;
      let role: any = null;

      if (userId) {
        const { data: profile } = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
        role = profile?.role;
      }

      await client.from('audit_logs').insert({
        user_id: userId || null,
        role: role || null,
        action,
        entity_type: entityType,
        entity_id: entityId || null,
        metadata: metadata || {},
      });
    } catch (e) {
      console.warn('Audit logging notice', e);
    }
  },

  /**
   * Fetch receipt & pharmacy settings from database
   */
  async fetchSettings(): Promise<ReceiptSettings | null> {
    const client = getSupabase();
    if (!client) return null;

    const { data, error } = await client
      .from('settings')
      .select('*')
      .eq('id', 'default_settings')
      .maybeSingle();

    if (error || !data) return null;

    return {
      pharmacyName: data.pharmacy_name,
      tagline: data.tagline || '',
      addressLine1: data.address_line1 || '',
      addressLine2: data.address_line2 || '',
      phone: data.phone || '',
      email: data.email || '',
      licenseNumber: data.license_number || '',
      taxId: data.tax_id || '',
      taxRate: Number(data.tax_rate) || 0.16,
      paperWidth: data.paper_width === '58mm' ? '58mm' : '80mm',
      headerMessage: data.header_message || '',
      footerMessage: data.footer_message || '',
      returnPolicy: data.return_policy || '',
      emergencyPhone: data.emergency_phone || '',
      showGenericName: Boolean(data.show_generic_name),
      showBatchAndExpiry: Boolean(data.show_batch_and_expiry),
      showPrescriptionDetails: Boolean(data.show_prescription_details),
      showPharmacistName: Boolean(data.show_pharmacist_name),
      showBarcode: Boolean(data.show_barcode),
      showTaxBreakdown: Boolean(data.show_tax_breakdown),
      currencySymbol: data.currency_symbol || 'KSh',
    };
  },

  /**
   * Update receipt & pharmacy settings in database (Admin only)
   */
  async updateSettings(settings: ReceiptSettings): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    const { error } = await client.from('settings').upsert({
      id: 'default_settings',
      pharmacy_name: settings.pharmacyName,
      tagline: settings.tagline,
      address_line1: settings.addressLine1,
      address_line2: settings.addressLine2,
      phone: settings.phone,
      email: settings.email,
      license_number: settings.licenseNumber,
      tax_id: settings.taxId,
      tax_rate: settings.taxRate,
      paper_width: settings.paperWidth,
      header_message: settings.headerMessage,
      footer_message: settings.footerMessage,
      return_policy: settings.returnPolicy,
      emergency_phone: settings.emergencyPhone,
      show_generic_name: settings.showGenericName,
      show_batch_and_expiry: settings.showBatchAndExpiry,
      show_prescription_details: settings.showPrescriptionDetails,
      show_pharmacist_name: settings.showPharmacistName,
      show_barcode: settings.showBarcode,
      show_tax_breakdown: settings.showTaxBreakdown,
      currency_symbol: settings.currencySymbol,
      updated_at: new Date().toISOString(),
    });

    if (error) throw new Error(error.message);
  },

  /**
   * Fetch all user accounts (Admin only)
   */
  async fetchUsers(): Promise<User[]> {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load users from Supabase', error);
      return [];
    }

    return (data || []).map((p: any) => mapProfileToUser({ id: p.id, email: p.email } as any, p));
  },

  /**
   * Admin Create User via secure RPC (Phase 45)
   */
  async adminCreateUser(params: {
    email: string;
    password: string;
    fullName: string;
    role: 'ADMIN' | 'CLINICIAN' | 'CASHIER';
    phone?: string;
    licenseNumber?: string;
  }): Promise<any> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    const { data, error } = await client.rpc('admin_create_user', {
      p_email: params.email,
      p_password: params.password,
      p_full_name: params.fullName,
      p_role: params.role,
      p_phone: params.phone || null,
      p_license_number: params.licenseNumber || null,
    });

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Admin Update User via secure RPC (Phase 5 & 45)
   */
  async adminUpdateUser(params: {
    targetUserId: string;
    fullName: string;
    role: 'ADMIN' | 'CLINICIAN' | 'CASHIER';
    status: 'ACTIVE' | 'INACTIVE';
    phone?: string;
    licenseNumber?: string;
  }): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    const { error } = await client.rpc('admin_update_user', {
      p_target_user_id: params.targetUserId,
      p_full_name: params.fullName,
      p_role: params.role,
      p_status: params.status,
      p_phone: params.phone || null,
      p_license_number: params.licenseNumber || null,
    });

    if (error) throw new Error(error.message);
  },

  /**
   * Admin Reset Password via secure RPC
   */
  async adminResetPassword(targetUserId: string, newPassword: string): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error('Database client not configured.');

    const { error } = await client.rpc('admin_reset_password', {
      p_target_user_id: targetUserId,
      p_new_password: newPassword,
    });

    if (error) throw new Error(error.message);
  },
};
