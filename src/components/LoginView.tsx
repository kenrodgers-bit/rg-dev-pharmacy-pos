import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { User } from '../types';
import {
  signInWithSupabase,
  signUpInitialAdmin,
  supabaseConfig,
} from '../services/supabase';

interface LoginViewProps {
  onLogin: (user: User) => void;
  pharmacyName?: string;
  isBootstrapAvailable?: boolean;
  inactivityMessage?: string | null;
  onConfigureDatabase?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLogin,
  pharmacyName = 'RG Pharma-POS',
  isBootstrapAvailable = false,
  inactivityMessage = null,
  onConfigureDatabase,
}) => {
  // Sign In Form State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bootstrap Admin Setup State
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminLicense, setAdminLicense] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password.trim()) {
      setError('Please provide your email or username and password.');
      return;
    }

    setIsSubmitting(true);

    if (!supabaseConfig.isConfigured()) {
      setIsSubmitting(false);
      setError('Supabase is not configured yet. Please configure database credentials in Settings.');
      return;
    }

    const result = await signInWithSupabase(identifier, password);

    setIsSubmitting(false);
    if (!result.ok || !result.user) {
      setError(result.error || 'Invalid credentials or user not authorized.');
      return;
    }

    onLogin(result.user);
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setError('Please complete all required fields: Name, Email, and Master Password.');
      return;
    }

    if (adminPassword.length < 8) {
      setError('Password must be at least 8 characters long for clinical and pharmaceutical security.');
      return;
    }

    if (adminPassword !== adminConfirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);

    const result = await signUpInitialAdmin({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      phone: adminPhone,
      license: adminLicense,
    });

    setIsSubmitting(false);

    if (!result.ok || !result.user) {
      setError(result.error || 'Failed to initialize Administrator account.');
      return;
    }

    onLogin(result.user);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Pharmacy Branding Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-teal-500/20 mb-3 border border-teal-400/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-teal-100"
            >
              <path d="M19 10.5h-5.5V5a1.5 1.5 0 00-3 0v5.5H5a1.5 1.5 0 000 3h5.5V19a1.5 1.5 0 003 0v-5.5H19a1.5 1.5 0 000-3z" />
            </svg>
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">{pharmacyName}</h1>
          <p className="text-xs text-teal-300/80 font-medium mt-1">
            Pharmacy & Clinical Point-of-Sale System
          </p>
        </div>

        {/* Authentication Card */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8 space-y-5">
          {/* Inactivity Notice */}
          {inactivityMessage && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold leading-relaxed">{inactivityMessage}</div>
            </div>
          )}

          {isBootstrapAvailable ? (
            /* First-Run Initial Admin Bootstrap Flow */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[10px] font-bold uppercase tracking-wider mb-1">
                    <ShieldCheck className="w-3 h-3" />
                    First-Run System Setup
                  </div>
                  <h2 className="text-base font-bold text-slate-900">Create Administrator</h2>
                  <p className="text-xs text-slate-500">
                    Set up the initial Master Administrator account for this pharmacy.
                  </p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
              </div>

              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium leading-relaxed">{error}</div>
                </div>
              )}

              <form onSubmit={handleBootstrapSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Administrator Full Name *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="e.g., Dr. Sarah Jenkins"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Administrator Email *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@pharmacy.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      placeholder="+254 700 000 000"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      License / PPB Reg
                    </label>
                    <input
                      type="text"
                      value={adminLicense}
                      onChange={(e) => setAdminLicense(e.target.value)}
                      placeholder="PPB-PH-2026"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Master Password (min 8 characters) *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Confirm Master Password *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 py-3 px-4 bg-teal-700 hover:bg-teal-800 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Creating Administrator...' : 'Initialize System & Log In'}</span>
                </button>
              </form>
            </div>
          ) : (
            /* Standard Sign In Form (No Public Self-Registration) */
            <>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Staff Sign In</h2>
                  <p className="text-xs text-slate-500">
                    Sign in with your authorized credentials to access your terminal
                  </p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
              </div>

              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium leading-relaxed">{error}</div>
                </div>
              )}

              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Email or Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="user@pharmacy.com or username"
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-teal-700 hover:bg-teal-800 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isSubmitting ? 'Authenticating...' : 'Sign In to Account'}</span>
                </button>
              </form>
            </>
          )}

          {/* Access Security Badge */}
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-teal-800 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Restricted Healthcare POS</span>
              </div>
              {onConfigureDatabase && (
                <button
                  type="button"
                  onClick={onConfigureDatabase}
                  className="text-teal-700 hover:underline font-semibold cursor-pointer text-[10px]"
                >
                  Database Settings
                </button>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Accounts can only be created by an authorized Administrator. Contact your system admin for access credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
