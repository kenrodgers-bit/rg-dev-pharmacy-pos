import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileCheck,
  FilePlus,
  FileText,
  Filter,
  HeartPulse,
  Microscope,
  Pill,
  Plus,
  Search,
  Shield,
  Stethoscope,
  Trash2,
  User as UserIcon,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  ClinicalTest,
  Consultation,
  Medication,
  Patient,
  Prescription,
  PrescriptionItem,
  User,
} from '../types';
import {
  insertConsultationToSupabase,
  upsertClinicalTestToSupabase,
  upsertPatientToSupabase,
  upsertPrescriptionToSupabase,
} from '../services/supabase';

interface ClinicalWorkflowViewProps {
  currentUser: User;
  patients: Patient[];
  consultations: Consultation[];
  clinicalTests: ClinicalTest[];
  prescriptions: Prescription[];
  medications: Medication[];
  onRefreshClinicalData: () => void;
  onShowToast: (message: string, type: 'success' | 'warning' | 'info') => void;
}

export const ClinicalWorkflowView: React.FC<ClinicalWorkflowViewProps> = ({
  currentUser,
  patients,
  consultations,
  clinicalTests,
  prescriptions,
  medications,
  onRefreshClinicalData,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'consultations' | 'patients' | 'tests'>('consultations');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [isConsultationModalOpen, setIsConsultationModalOpen] = useState(false);
  const [isTestOrderModalOpen, setIsTestOrderModalOpen] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);

  // New Patient Form
  const [patientFullName, setPatientFullName] = useState('');
  const [patientDob, setPatientDob] = useState('');
  const [patientGender, setPatientGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [patientAllergies, setPatientAllergies] = useState('');
  const [patientInsurance, setPatientInsurance] = useState('');
  const [patientPolicyNumber, setPatientPolicyNumber] = useState('');

  // New Consultation Form
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [bp, setBp] = useState('120/80');
  const [temp, setTemp] = useState('36.8');
  const [heartRate, setHeartRate] = useState('74');
  const [weight, setWeight] = useState('68');
  const [oxygenSat, setOxygenSat] = useState('98%');

  // Prescribed items within consultation
  const [rxItems, setRxItems] = useState<
    {
      medicationId: string;
      medicationName: string;
      dosageInstructions: string;
      quantity: number;
    }[]
  >([]);
  const [selectedMedId, setSelectedMedId] = useState('');
  const [medDosageInstruction, setMedDosageInstruction] = useState('Take 1 tablet twice daily after meals for 5 days');
  const [medQuantity, setMedQuantity] = useState(1);

  // Test Order Form
  const [testPatientId, setTestPatientId] = useState('');
  const [testName, setTestName] = useState('Complete Blood Count (CBC)');
  const [testCategory, setTestCategory] = useState<
    'Hematology' | 'Biochemistry' | 'Microbiology' | 'Rapid Diagnostic' | 'Urinalysis' | 'Other'
  >('Hematology');
  const [testNotes, setTestNotes] = useState('');

  // Test Result Recording
  const [editingTest, setEditingTest] = useState<ClinicalTest | null>(null);
  const [testResultText, setTestResultText] = useState('');
  const [testRefRange, setTestRefRange] = useState('');

  // Filtering
  const filteredPatients = patients.filter(
    (p) =>
      p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm) ||
      (p.insurancePolicyNumber && p.insurancePolicyNumber.includes(searchTerm))
  );

  const filteredConsultations = consultations.filter((c) => {
    return (
      c.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.diagnosis.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.clinicianName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const filteredTests = clinicalTests.filter((t) => {
    return (
      (t.patientName && t.patientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      t.testName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Handle Save Patient
  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientFullName.trim() || !patientPhone.trim() || !patientDob) {
      onShowToast('Please fill in Full Name, Date of Birth, and Phone Number.', 'warning');
      return;
    }

    const allergiesArray = patientAllergies
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const newPatient: Patient = {
      id: `pat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      fullName: patientFullName.trim(),
      dob: patientDob,
      gender: patientGender,
      phone: patientPhone.trim(),
      email: patientEmail.trim() || undefined,
      address: patientAddress.trim() || undefined,
      allergies: allergiesArray,
      insuranceProvider: patientInsurance.trim() || undefined,
      insurancePolicyNumber: patientPolicyNumber.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const success = await upsertPatientToSupabase(newPatient);
    if (success) {
      onShowToast(`Patient ${newPatient.fullName} registered successfully.`, 'success');
      setIsNewPatientModalOpen(false);
      // Reset form
      setPatientFullName('');
      setPatientDob('');
      setPatientPhone('');
      setPatientEmail('');
      setPatientAddress('');
      setPatientAllergies('');
      setPatientInsurance('');
      setPatientPolicyNumber('');
      onRefreshClinicalData();
    } else {
      onShowToast('Failed to save patient to Supabase.', 'warning');
    }
  };

  // Add drug item to prescription in consultation
  const handleAddDrugToRx = () => {
    if (!selectedMedId) {
      onShowToast('Please select a medication from catalog.', 'warning');
      return;
    }
    const med = medications.find((m) => m.id === selectedMedId);
    if (!med) return;

    setRxItems([
      ...rxItems,
      {
        medicationId: med.id,
        medicationName: `${med.name} (${med.dosage})`,
        dosageInstructions: medDosageInstruction,
        quantity: medQuantity,
      },
    ]);

    setSelectedMedId('');
    setMedQuantity(1);
    setMedDosageInstruction('Take 1 tablet twice daily after meals for 5 days');
  };

  // Handle Save Consultation & Issue Prescription
  const handleSaveConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !symptoms.trim() || !diagnosis.trim()) {
      onShowToast('Please select a patient, symptoms, and diagnosis.', 'warning');
      return;
    }

    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient) return;

    const consultationId = `cons-${Date.now()}`;
    const newConsultation: Consultation = {
      id: consultationId,
      patientId: patient.id,
      patientName: patient.fullName,
      clinicianId: currentUser.id,
      clinicianName: currentUser.name,
      date: new Date().toISOString(),
      symptoms: symptoms.trim(),
      diagnosis: diagnosis.trim(),
      notes: clinicalNotes.trim() || undefined,
      vitals: {
        bp,
        temperature: temp,
        heartRate,
        weight,
        oxygenSat,
      },
      createdAt: new Date().toISOString(),
    };

    await insertConsultationToSupabase(newConsultation);

    // If prescription items were attached, generate official Prescription records
    if (rxItems.length > 0) {
      for (const item of rxItems) {
        const rxNumber = `RX-${Math.floor(100000 + Math.random() * 900000)}`;
        const officialRx: Prescription = {
          id: `rx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          rxNumber,
          barcode: rxNumber,
          patientId: patient.id,
          patientName: patient.fullName,
          patientDOB: patient.dob,
          patientPhone: patient.phone,
          doctorName: currentUser.name,
          doctorLicense: currentUser.licenseNumber || 'REG-CLINICIAN',
          doctorClinic: 'Outpatient Clinic & Dispensary',
          medicationId: item.medicationId,
          medicationName: item.medicationName,
          dosageInstructions: item.dosageInstructions,
          quantityPrescribed: item.quantity,
          quantityDispensedSoFar: 0,
          refillsAllowed: 0,
          refillsRemaining: 0,
          dateIssued: new Date().toISOString().split('T')[0],
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'Issued',
          insuranceProvider: patient.insuranceProvider,
          insuranceCoPayRate: patient.insuranceProvider ? 0.2 : 0,
          notes: `Consultation diagnosis: ${diagnosis}`,
        };
        await upsertPrescriptionToSupabase(officialRx);
      }
    }

    onShowToast(`Consultation recorded. ${rxItems.length} prescription(s) issued to pharmacy dispensary.`, 'success');
    setIsConsultationModalOpen(false);
    // Reset form
    setSelectedPatientId('');
    setSymptoms('');
    setDiagnosis('');
    setClinicalNotes('');
    setRxItems([]);
    onRefreshClinicalData();
  };

  // Order Test
  const handleOrderTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPatientId || !testName.trim()) {
      onShowToast('Please select a patient and test name.', 'warning');
      return;
    }

    const patient = patients.find((p) => p.id === testPatientId);
    if (!patient) return;

    const newTest: ClinicalTest = {
      id: `test-${Date.now()}`,
      patientId: patient.id,
      patientName: patient.fullName,
      testName: testName.trim(),
      category: testCategory,
      status: 'Pending',
      notes: testNotes.trim() || undefined,
      requestedBy: currentUser.name,
      createdAt: new Date().toISOString(),
    };

    await upsertClinicalTestToSupabase(newTest);
    onShowToast(`Lab test "${testName}" ordered for ${patient.fullName}.`, 'success');
    setIsTestOrderModalOpen(false);
    setTestNotes('');
    onRefreshClinicalData();
  };

  // Record Test Results
  const handleSaveTestResults = async () => {
    if (!editingTest) return;
    const updatedTest: ClinicalTest = {
      ...editingTest,
      results: testResultText.trim(),
      referenceRanges: testRefRange.trim() || undefined,
      status: 'Completed',
      conductedAt: new Date().toISOString(),
    };

    await upsertClinicalTestToSupabase(updatedTest);
    onShowToast(`Clinical test result recorded for ${editingTest.testName}.`, 'success');
    setEditingTest(null);
    setTestResultText('');
    setTestRefRange('');
    onRefreshClinicalData();
  };

  return (
    <div className="flex-1 bg-slate-50 flex flex-col min-h-0 overflow-y-auto">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                Clinical Workflow & Consultations
              </h1>
              <p className="text-xs text-slate-500">
                Integrated Outpatient Care: Patient Intake &rarr; Consultation &rarr; Lab Tests &rarr; Prescription
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsNewPatientModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-teal-700" />
            <span>Register Patient</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTestOrderModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <Microscope className="w-4 h-4 text-blue-700" />
            <span>Order Lab Test</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConsultationModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
          >
            <FilePlus className="w-4 h-4" />
            <span>New Consultation</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs & Search */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('consultations')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'consultations'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Consultations ({consultations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('patients')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'patients'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Patients Directory ({patients.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tests')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'tests'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Microscope className="w-3.5 h-3.5" />
            <span>Lab & Diagnostics ({clinicalTests.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search records..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-6 space-y-4">
        {/* SUBTAB 1: CONSULTATIONS */}
        {activeSubTab === 'consultations' && (
          <div className="space-y-3">
            {filteredConsultations.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <Stethoscope className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800">No Consultations Recorded</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  Start a clinical consultation to record symptoms, vitals, diagnosis, and issue prescriptions to the pharmacy.
                </p>
                <button
                  type="button"
                  onClick={() => setIsConsultationModalOpen(true)}
                  className="px-4 py-2 bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-teal-800"
                >
                  Start First Consultation
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredConsultations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedConsultation(c)}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:border-teal-400 transition cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                        <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                          <UserIcon className="w-3.5 h-3.5 text-teal-600" />
                          <span>{c.patientName}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(c.date).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Diagnosis
                          </span>
                          <p className="font-bold text-slate-800 line-clamp-1">{c.diagnosis}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Symptoms
                          </span>
                          <p className="text-slate-600 line-clamp-2 text-[11px]">{c.symptoms}</p>
                        </div>

                        {c.vitals && (
                          <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-500 flex-wrap">
                            {c.vitals.bp && (
                              <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                BP: {c.vitals.bp}
                              </span>
                            )}
                            {c.vitals.temperature && (
                              <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                {c.vitals.temperature}&deg;C
                              </span>
                            )}
                            {c.vitals.heartRate && (
                              <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                {c.vitals.heartRate} bpm
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Clinician: {c.clinicianName}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: PATIENTS DIRECTORY */}
        {activeSubTab === 'patients' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-700 text-[11px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Patient Name</th>
                    <th className="py-2.5 px-3">DOB / Gender</th>
                    <th className="py-2.5 px-3">Phone</th>
                    <th className="py-2.5 px-3">Allergies</th>
                    <th className="py-2.5 px-3">Insurance</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No patients found. Click &quot;Register Patient&quot; above to create a record.
                      </td>
                    </tr>
                  ) : (
                    filteredPatients.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{p.fullName}</td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600">
                          {p.dob} • {p.gender}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">{p.phone}</td>
                        <td className="py-2.5 px-3">
                          {p.allergies && p.allergies.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {p.allergies.map((a, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold"
                                >
                                  {a}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">None Known</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {p.insuranceProvider ? (
                            <span className="font-semibold text-teal-800">
                              {p.insuranceProvider} ({p.insurancePolicyNumber || '—'})
                            </span>
                          ) : (
                            <span className="text-slate-400">Self-Pay</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPatientId(p.id);
                              setIsConsultationModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[11px] transition cursor-pointer"
                          >
                            Consult
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 3: LAB TESTS & DIAGNOSTICS */}
        {activeSubTab === 'tests' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-700 text-[11px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Test Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Results / Reference</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No lab diagnostic tests requested yet.
                      </td>
                    </tr>
                  ) : (
                    filteredTests.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{t.testName}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            {t.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{t.patientName || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.status === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : t.status === 'In Progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {t.results ? (
                            <div>
                              <span className="font-semibold text-slate-900">{t.results}</span>
                              {t.referenceRanges && (
                                <div className="text-[10px] text-slate-400">Ref: {t.referenceRanges}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Pending analysis</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTest(t);
                              setTestResultText(t.results || '');
                              setTestRefRange(t.referenceRanges || '');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                          >
                            {t.results ? 'Update' : 'Enter Results'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: REGISTER PATIENT */}
      {isNewPatientModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Register Outpatient</h2>
                  <p className="text-[11px] text-slate-500">Record new patient demographics & medical insurance</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPatientModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePatient} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={patientFullName}
                  onChange={(e) => setPatientFullName(e.target.value)}
                  placeholder="e.g., Arthur Dent"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    value={patientDob}
                    onChange={(e) => setPatientDob(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Gender</label>
                  <select
                    value={patientGender}
                    onChange={(e) => setPatientGender(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="+254 700 123 456"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    placeholder="patient@email.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Drug Allergies (comma-separated)
                </label>
                <input
                  type="text"
                  value={patientAllergies}
                  onChange={(e) => setPatientAllergies(e.target.value)}
                  placeholder="e.g., Penicillin, Sulfa drugs"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Insurance Provider</label>
                  <input
                    type="text"
                    value={patientInsurance}
                    onChange={(e) => setPatientInsurance(e.target.value)}
                    placeholder="e.g., Jubilee / AAR / NHIF"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Policy / Member No.</label>
                  <input
                    type="text"
                    value={patientPolicyNumber}
                    onChange={(e) => setPatientPolicyNumber(e.target.value)}
                    placeholder="POL-88219"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewPatientModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-xs"
                >
                  Save Patient Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW CONSULTATION & PRESCRIPTION */}
      {isConsultationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Clinical Outpatient Consultation</h2>
                  <p className="text-[11px] text-slate-500">
                    Conduct consultation, log vitals, diagnose, and issue dispensary prescriptions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConsultationModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConsultation} className="space-y-4">
              {/* Select Patient */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Select Patient *</label>
                <select
                  required
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.phone} • DOB: {p.dob})
                    </option>
                  ))}
                </select>
              </div>

              {/* Vitals */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <HeartPulse className="w-4 h-4 text-rose-600" />
                  <span>Clinical Vitals</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500">BP (mmHg)</label>
                    <input
                      type="text"
                      value={bp}
                      onChange={(e) => setBp(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Temp (&deg;C)</label>
                    <input
                      type="text"
                      value={temp}
                      onChange={(e) => setTemp(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Pulse (bpm)</label>
                    <input
                      type="text"
                      value={heartRate}
                      onChange={(e) => setHeartRate(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Weight (kg)</label>
                    <input
                      type="text"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">SpO2 (%)</label>
                    <input
                      type="text"
                      value={oxygenSat}
                      onChange={(e) => setOxygenSat(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Symptoms & Diagnosis */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Presenting Complaints & Symptoms *
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder="Patient reports acute headache, fever for 3 days, body aches..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Clinical Diagnosis & Impression *
                  </label>
                  <input
                    type="text"
                    required
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="e.g., Acute Bacterial Sinusitis, Essential Hypertension"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Prescriptions Section */}
              <div className="p-3 bg-teal-50/50 rounded-2xl border border-teal-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-teal-900 flex items-center gap-1.5">
                    <Pill className="w-4 h-4 text-teal-700" />
                    <span>Issue Prescriptions (Dispensary Queue)</span>
                  </div>
                  <span className="text-[10px] text-teal-700 font-semibold">
                    {rxItems.length} item{rxItems.length === 1 ? '' : 's'} added
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6">
                    <select
                      value={selectedMedId}
                      onChange={(e) => setSelectedMedId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-teal-200 rounded-xl text-xs font-semibold"
                    >
                      <option value="">-- Select Drug from Inventory --</option>
                      {medications.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.dosage}) - Stock: {m.stock}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <input
                      type="text"
                      value={medDosageInstruction}
                      onChange={(e) => setMedDosageInstruction(e.target.value)}
                      placeholder="Dosage instruction..."
                      className="w-full px-2.5 py-1.5 bg-white border border-teal-200 rounded-xl text-xs font-semibold"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      value={medQuantity}
                      onChange={(e) => setMedQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-14 px-2 py-1.5 bg-white border border-teal-200 rounded-xl text-xs font-bold text-center"
                    />
                    <button
                      type="button"
                      onClick={handleAddDrugToRx}
                      className="p-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {rxItems.length > 0 && (
                  <div className="divide-y divide-teal-100 bg-white rounded-xl border border-teal-100 overflow-hidden">
                    {rxItems.map((item, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{item.medicationName}</span>
                          <span className="text-[11px] text-slate-500 ml-2">Qty: {item.quantity}</span>
                          <div className="text-[10px] text-teal-700 italic">{item.dosageInstructions}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRxItems(rxItems.filter((_, i) => i !== idx))}
                          className="text-rose-600 hover:text-rose-800 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsConsultationModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-xs"
                >
                  Save Consultation & Issue Rx
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ORDER LAB TEST */}
      {isTestOrderModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                  <Microscope className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Order Diagnostic Lab Test</h2>
                  <p className="text-[11px] text-slate-500">Send diagnostic order to laboratory</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTestOrderModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOrderTest} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Select Patient *</label>
                <select
                  required
                  value={testPatientId}
                  onChange={(e) => setTestPatientId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Diagnostic Category</label>
                <select
                  value={testCategory}
                  onChange={(e) => setTestCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="Hematology">Hematology (CBC, ESR, Blood Group)</option>
                  <option value="Biochemistry">Biochemistry (Liver, Renal, Lipids, FBS)</option>
                  <option value="Microbiology">Microbiology (Culture, Staining)</option>
                  <option value="Rapid Diagnostic">Rapid Diagnostic (Malaria, Typhoid, HIV)</option>
                  <option value="Urinalysis">Urinalysis</option>
                  <option value="Other">Other Diagnostic Test</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Test Name *</label>
                <input
                  type="text"
                  required
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="e.g., Complete Blood Count (CBC)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Clinical Indication / Notes</label>
                <textarea
                  rows={2}
                  value={testNotes}
                  onChange={(e) => setTestNotes(e.target.value)}
                  placeholder="Suspected acute infection..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTestOrderModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs"
                >
                  Confirm Lab Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: RECORD TEST RESULT */}
      {editingTest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Record Test Result</h2>
                <p className="text-[11px] text-slate-500">
                  {editingTest.testName} &bull; Patient: {editingTest.patientName || 'Unknown'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTest(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Observed Result Value *</label>
                <input
                  type="text"
                  value={testResultText}
                  onChange={(e) => setTestResultText(e.target.value)}
                  placeholder="e.g., Hb: 14.2 g/dL, WBC: 7.8 x10^9/L (Negative)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Reference Range</label>
                <input
                  type="text"
                  value={testRefRange}
                  onChange={(e) => setTestRefRange(e.target.value)}
                  placeholder="e.g., 12.0 - 16.0 g/dL"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTest(null)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTestResults}
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-xs"
                >
                  Save & Complete Test
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
