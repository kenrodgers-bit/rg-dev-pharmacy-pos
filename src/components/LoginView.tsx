import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { User } from '../types';
import { getSupabase, mapProfileToUser } from '../services/supabase';
import { pharmacyService } from '../services/pharmacyService';

interface LoginViewProps {
  onLogin: (user: User) => void;
  pharmacyName?: string;
  timeoutMessage?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLogin,
  pharmacyName = 'RG Pharma-POS',
  timeoutMessage,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(timeoutMessage || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bootstrap initial admin state if database has no users yet
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [adminFullName, setAdminFullName] = useState('');

  useEffect(() => {
    if (timeoutMessage) {
      setError(timeoutMessage);
    }
  }, [timeoutMessage]);

  useEffect(() => {
    async function checkFirstTimeSetup() {
      try {
        const hasExistingUsers = await pharmacyService.hasUsers();
        if (!hasExistingUsers) {
          setNeedsBootstrap(true);
        }
      } catch (e) {
        console.warn('Initial setup check', e);
      }
    }
    checkFirstTimeSetup();
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const client = getSupabase();
    if (!client) {
      setError('Supabase connection is not configured. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      setIsSubmitting(false);
      return;
    }

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const { data: authData, error: authError } = await client.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError || !authData.user) {
        setError(authError?.message || 'Invalid credentials. Please verify your email and password.');
        setIsSubmitting(false);
        return;
      }

      // Query public.profiles to verify role and ACTIVE status (Phase 4 & 5)
      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await client.auth.signOut();
        setError('No healthcare profile associated with this account. Please contact your system administrator.');
        setIsSubmitting(false);
        return;
      }

      // Strict enforcement of ACTIVE status
      if (profile.status !== 'ACTIVE') {
        await client.auth.signOut();
        setError('This account has been deactivated. Please contact your system administrator.');
        setIsSubmitting(false);
        return;
      }

      // Record last login
      await client
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', profile.id);

      const user = mapProfileToUser(authData.user, profile);
      setIsSubmitting(false);
      onLogin(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'An error occurred during authentication.');
      setIsSubmitting(false);
    }
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        setIsSubmitting(false);
        return;
      }

      const user = await pharmacyService.bootstrapFirstAdmin(
        email.trim().toLowerCase(),
        password,
        adminFullName.trim() || 'System Administrator'
      );

      setIsSubmitting(false);
      onLogin(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to initialize administrator account.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Pharmacy Branding Card */}
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
            Clinical Pharmacy & Point-of-Sale System
          </p>
        </div>

        {/* Authentication Card */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {needsBootstrap ? 'System Bootstrap' : 'Account Sign In'}
              </h2>
              <p className="text-xs text-slate-500">
                {needsBootstrap
                  ? 'Create the initial system Administrator account'
                  : 'Sign in with your designated credentials to access your account'}
              </p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              {needsBootstrap ? <UserPlus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>
          )}

          {needsBootstrap && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">
                Initial deployment detected: No existing user profiles. Complete this form to establish the primary system Administrator account.
              </div>
            </div>
          )}

          <form onSubmit={needsBootstrap ? handleBootstrapAdmin : handleSignIn} className="space-y-4">
            {needsBootstrap && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Admin Full Name
                </label>
                <input
                  type="text"
                  required
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="e.g., Dr. Sarah Admin"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@pharmacy.com"
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
              {needsBootstrap ? <CheckCircle2 className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              <span>
                {isSubmitting
                  ? (needsBootstrap ? 'Bootstrapping Admin...' : 'Authenticating...')
                  : (needsBootstrap ? 'Establish Administrator Account' : 'Sign In to Account')}
              </span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
            <div className="flex items-center gap-1.5 text-teal-800 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Restricted Clinical Access</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Authorized clinical and dispensing personnel only. Accounts are managed by the System Administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
