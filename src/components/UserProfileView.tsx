import React, { useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  User as UserIcon,
} from 'lucide-react';
import { User } from '../types';
import { storageService } from '../services/storage';
import { updateUserProfileInSupabase, changeOwnPassword, supabaseConfig } from '../services/supabase';

interface UserProfileViewProps {
  currentUser: User;
  onUpdateCurrentUser: (updated: User) => void;
  onShowToast: (message: string, type: 'success' | 'warning' | 'info') => void;
  onLogout?: () => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  currentUser,
  onUpdateCurrentUser,
  onShowToast,
  onLogout,
}) => {
  // Form states for personal details
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [licenseNumber, setLicenseNumber] = useState(currentUser.licenseNumber || '');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  // Form states for password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';
  const normalizedRole = currentUser?.role || 'cashier';

  // Handle Save Personal Info
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);

    if (!supabaseConfig.isConfigured()) {
      onShowToast('Cannot save: no database is configured.', 'warning');
      return;
    }

    const res = await updateUserProfileInSupabase(currentUser.id, {
      name,
      email,
      phone,
      licenseNumber,
      // Strictly no role or status modifications from this self-service screen.
    });

    if (!res.ok) {
      onShowToast(res.error || 'Failed to save profile changes.', 'warning');
      return;
    }

    const updatedUser: User = { ...currentUser, name, email, phone, licenseNumber };
    onUpdateCurrentUser(updatedUser);
    storageService.saveActiveUser(updatedUser);
    onShowToast('Profile information updated successfully.', 'success');
    setProfileMessage('Changes saved.');
    setTimeout(() => setProfileMessage(null), 3000);
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!supabaseConfig.isConfigured()) {
      setPasswordError('Cannot change password: no database is configured.');
      return;
    }

    if (!currentUser.email) {
      setPasswordError('Your account has no email on file - contact an administrator.');
      return;
    }

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    const res = await changeOwnPassword(currentUser.email, currentPassword, newPassword);
    if (!res.ok) {
      setPasswordError(res.error || 'Failed to update password.');
      return;
    }

    setPasswordSuccess('Password successfully updated!');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onShowToast('Your login password has been changed.', 'success');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-extrabold text-2xl shadow-md ${
              currentUser.avatarColor || (isAdmin ? 'bg-teal-700' : 'bg-emerald-600')
            }`}
          >
            {currentUser.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">{currentUser.name}</h1>
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  isAdmin
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {normalizedRole}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">@{currentUser.username}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Member since: {new Date(currentUser.createdAt || '2025-01-01').toLocaleDateString()}
              </span>
              {currentUser.licenseNumber && (
                <span className="flex items-center gap-1 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                  {currentUser.licenseNumber}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-200 text-xs self-stretch sm:self-auto justify-center">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          <span className="font-semibold text-slate-700">Account Status: Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Personal Information Form (7 cols) */}
        <div className="md:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Personal & Contact Details</h2>
            <p className="text-xs text-slate-500">
              Update your display name, official contact info, and pharmacy dispenser license.
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Legal Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@afyacare.co.ke"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pharmacy / Tech License Registration No.
              </label>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g., PPB-RPH-849204"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
              />
            </div>

            {/* Read-only Security Fields */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Security & Authorization Attributes</span>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">Assigned Role:</span>
                  <p className="font-bold text-slate-800">{normalizedRole.toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-slate-400">System Username:</span>
                  <p className="font-mono text-slate-800">@{currentUser.username}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                System role and clearance cannot be self-modified and are strictly managed by system administrators.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              {profileMessage ? (
                <span className="text-xs font-bold text-teal-700 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> {profileMessage}
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs min-h-[44px] transition"
              >
                Save Profile
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Change Password Form (5 cols) */}
        <div className="md:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Change Password</h2>
            <p className="text-xs text-slate-500">Update your personal login credentials</p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 4 characters"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs min-h-[44px] flex items-center justify-center gap-2 transition"
            >
              <KeyRound className="w-4 h-4" />
              <span>Update Password</span>
            </button>
          </form>
        </div>

        {/* Session Security & Sign Out */}
        {onLogout && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800">Account Session</h3>
                <p className="text-[11px] text-slate-500">
                  Signed in as <span className="font-semibold text-slate-700">@{currentUser.username}</span>. Remember to end your session when leaving your station.
                </p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
