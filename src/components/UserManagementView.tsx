import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { User, UserRole, UserStatus } from '../types';
import { storageService } from '../services/storage';
import { adminCreateUser, adminDeleteUser, adminResetPassword, updateUserProfileInSupabase, supabaseConfig } from '../services/supabase';

interface UserManagementViewProps {
  currentUser: User;
  users: User[];
  onRefreshUsers: () => void;
  onShowToast: (message: string, type: 'success' | 'warning' | 'info') => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  users,
  onRefreshUsers,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Role display helpers (admin / clinician / cashier)
  const roleBadgeClass = (role: UserRole) =>
    role === 'admin'
      ? 'bg-purple-100 text-purple-800 border border-purple-200'
      : role === 'clinician'
      ? 'bg-blue-100 text-blue-800 border border-blue-200'
      : 'bg-emerald-100 text-emerald-800 border border-emerald-200';

  const roleAvatarClass = (role: UserRole) =>
    role === 'admin' ? 'bg-teal-700' : role === 'clinician' ? 'bg-blue-600' : 'bg-emerald-600';

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);

  // Form states for Create User
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('cashier');
  const [newPassword, setNewPassword] = useState('');
  const [newLicense, setNewLicense] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Reset password state
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Delete explicit confirmation input
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.phone && u.phone.includes(searchTerm));

    if (!matchesSearch) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    return true;
  });

  // Handle Create User
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      setFormError('Please fill in all required fields: Name, Email, and Initial Password.');
      return;
    }

    if (!supabaseConfig.isConfigured()) {
      setFormError('Cannot create a staff account: no database is configured. Configure Supabase in Settings first.');
      return;
    }

    setIsSubmitting(true);
    const res = await adminCreateUser({
      name: newName,
      email: newEmail,
      password: newPassword,
      role: newRole,
      phone: newPhone,
      license: newLicense,
    });
    setIsSubmitting(false);

    if (!res.ok) {
      setFormError(
        res.error ||
          'Failed to create user account. Make sure the admin-manage-user Edge Function is deployed.'
      );
      return;
    }

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'USER_CREATED',
      details: `Created new ${newRole.toUpperCase()} account for ${newName} (${newEmail})`,
      category: 'USERS',
    });

    onShowToast(`Created staff account for ${newName} successfully.`, 'success');
    setIsCreateModalOpen(false);
    // Reset form
    setNewName('');
    setNewUsername('');
    setNewEmail('');
    setNewPhone('');
    setNewRole('cashier');
    setNewPassword('');
    setNewLicense('');
    onRefreshUsers();
  };

  // Handle Edit User
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFormError(null);

    if (!supabaseConfig.isConfigured()) {
      setFormError('Cannot update this account: no database is configured.');
      return;
    }

    setIsSubmitting(true);
    const res = await updateUserProfileInSupabase(editingUser.id, {
      name: editingUser.name,
      email: editingUser.email,
      phone: editingUser.phone,
      licenseNumber: editingUser.licenseNumber,
      role: editingUser.role,
      status: editingUser.status,
    });
    setIsSubmitting(false);

    if (!res.ok) {
      setFormError(res.error || 'Failed to update user account.');
      return;
    }

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'USER_UPDATED',
      details: `Updated account details for ${editingUser.name}`,
      category: 'USERS',
    });

    onShowToast(`Updated account details for ${editingUser.name}.`, 'success');
    setEditingUser(null);
    onRefreshUsers();
  };

  // Handle Deactivate / Activate
  const handleConfirmToggleStatus = async () => {
    if (!deactivatingUser) return;

    if (deactivatingUser.id === currentUser.id) {
      onShowToast('You cannot deactivate your own account.', 'warning');
      setDeactivatingUser(null);
      return;
    }

    const newStatus: UserStatus = deactivatingUser.status === 'active' ? 'inactive' : 'active';
    const res = await updateUserProfileInSupabase(deactivatingUser.id, { status: newStatus });

    if (!res.ok) {
      onShowToast(res.error || 'Failed to update user status.', 'warning');
    } else {
      storageService.addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: newStatus === 'active' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        details: `Account for ${deactivatingUser.name} was ${newStatus === 'active' ? 'activated' : 'deactivated'}`,
        category: 'USERS',
      });
      onShowToast(
        `Account for ${deactivatingUser.name} has been ${newStatus === 'active' ? 'activated' : 'deactivated'}.`,
        'info'
      );
      onRefreshUsers();
    }
    setDeactivatingUser(null);
  };

  // Handle Delete
  const handleConfirmDelete = async () => {
    if (!deletingUser) return;

    if (deleteConfirmText.toLowerCase() !== 'delete') {
      onShowToast('Please type "DELETE" to confirm permanent removal.', 'warning');
      return;
    }

    if (deletingUser.id === currentUser.id) {
      onShowToast('You cannot delete your own account.', 'warning');
      setDeletingUser(null);
      return;
    }

    const res = await adminDeleteUser(deletingUser.id);
    if (!res.ok) {
      onShowToast(
        res.error || 'Failed to delete user account. Make sure the admin-manage-user Edge Function is deployed.',
        'warning'
      );
    } else {
      storageService.addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'USER_DELETED',
        details: `Permanently deleted account for ${deletingUser.name}`,
        category: 'USERS',
      });
      onShowToast(`Permanently deleted account for ${deletingUser.name}.`, 'info');
      onRefreshUsers();
    }
    setDeletingUser(null);
    setDeleteConfirmText('');
  };

  // Handle Password Reset
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser || !newPasswordInput) return;

    const res = await adminResetPassword(resetPasswordUser.id, newPasswordInput);
    if (!res.ok) {
      onShowToast(
        res.error || 'Failed to reset password. Make sure the admin-manage-user Edge Function is deployed.',
        'warning'
      );
      return;
    }

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PASSWORD_RESET',
      details: `Reset password for ${resetPasswordUser.name}`,
      category: 'USERS',
    });

    onShowToast(`Password reset for ${resetPasswordUser.name} successfully updated.`, 'success');
    setResetPasswordUser(null);
    setNewPasswordInput('');
    onRefreshUsers();
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 uppercase tracking-wider">
              Admin Access
            </span>
            <span className="text-xs text-slate-500">• {users.length} Total Registered Accounts</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Staff & Role Management</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Authorize pharmacy staff, manage account credentials, activate/deactivate personnel access, and enforce system security.
          </p>
        </div>

        <button
          id="btn-create-staff-account"
          onClick={() => {
            setFormError(null);
            setIsCreateModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-md shadow-teal-900/10 transition active:scale-98 shrink-0 min-h-[44px]"
        >
          <UserPlus className="w-4 h-4" />
          <span>New Staff Account</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="staff-search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, username, email or phone..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-teal-600 outline-none transition"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                roleFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Roles
            </button>
            <button
              onClick={() => setRoleFilter('admin')}
              className={`px-3 py-1.5 rounded-lg transition ${
                roleFilter === 'admin' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admins
            </button>
            <button
              onClick={() => setRoleFilter('clinician')}
              className={`px-3 py-1.5 rounded-lg transition ${
                roleFilter === 'clinician' ? 'bg-blue-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Clinicians
            </button>
            <button
              onClick={() => setRoleFilter('cashier')}
              className={`px-3 py-1.5 rounded-lg transition ${
                roleFilter === 'cashier' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cashiers
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'active' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'inactive' ? 'bg-rose-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {/* Responsive Users Presentation: Mobile Cards (<md) vs Desktop Table (md+) */}
      
      {/* Mobile Card List (<md) */}
      <div className="block md:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
            No staff accounts found matching your criteria.
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isSelf = user.id === currentUser.id;
            const isActive = user.status === 'active';

            return (
              <div
                key={user.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-xs shrink-0 ${
                        user.avatarColor || roleAvatarClass(user.role)
                      }`}
                    >
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{user.name}</h3>
                        {isSelf && (
                          <span className="bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-mono">@{user.username}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${roleBadgeClass(
                        user.role
                      )}`}
                    >
                      {user.role}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isActive
                          ? 'bg-teal-50 text-teal-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-teal-500' : 'bg-rose-500'}`} />
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {user.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{user.phone}</span>
                    </div>
                  )}
                  {user.licenseNumber && (
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono">{user.licenseNumber}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-400">
                    <span>Created: {new Date(user.createdAt || Date.now()).toLocaleDateString()}</span>
                    <span>
                      {user.lastLogin
                        ? `Last seen ${new Date(user.lastLogin).toLocaleDateString()}`
                        : 'Never logged in'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setEditingUser(user)}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold min-h-[44px] flex items-center justify-center transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setResetPasswordUser(user);
                      setNewPasswordInput('');
                    }}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold min-h-[44px] flex items-center justify-center gap-1 transition"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset Pass</span>
                  </button>

                  {!isSelf && (
                    <>
                      <button
                        onClick={() => setDeactivatingUser(user)}
                        className={`p-2.5 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center transition ${
                          isActive
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title={isActive ? 'Deactivate Account' : 'Activate Account'}
                      >
                        {isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => {
                          setDeletingUser(user);
                          setDeleteConfirmText('');
                        }}
                        className="p-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center transition"
                        title="Delete Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table (md+) */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-5">Staff Member</th>
                <th className="py-3.5 px-4">Contact Info</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Created / Activity</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No staff or admin accounts match your search or filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSelf = user.id === currentUser.id;
                  const isActive = user.status === 'active';

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0 ${
                              user.avatarColor || roleAvatarClass(user.role)
                            }`}
                          >
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{user.name}</span>
                              {isSelf && (
                                <span className="bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-mono text-slate-500">@{user.username}</span>
                            {user.licenseNumber && (
                              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <ShieldCheck className="w-3 h-3 text-slate-400" />
                                {user.licenseNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-xs text-slate-600">
                        <div>{user.email || '—'}</div>
                        <div className="text-slate-400 font-mono mt-0.5">{user.phone || 'No phone'}</div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${roleBadgeClass(
                            user.role
                          )}`}
                        >
                          <Shield className="w-3 h-3" />
                          {user.role}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-teal-50 text-teal-700 border border-teal-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-teal-500' : 'bg-rose-500'}`} />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-xs text-slate-500">
                        <div>Created: {new Date(user.createdAt || Date.now()).toLocaleDateString()}</div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          {user.lastLogin
                            ? `Last login: ${new Date(user.lastLogin).toLocaleDateString()}`
                            : 'No logins recorded'}
                        </div>
                      </td>

                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setResetPasswordUser(user);
                              setNewPasswordInput('');
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                            title="Reset Credentials"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Reset</span>
                          </button>

                          {/* Destructive actions hidden for self */}
                          {!isSelf && (
                            <>
                              <button
                                onClick={() => setDeactivatingUser(user)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                                  isActive
                                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                                title={isActive ? 'Deactivate Account' : 'Activate Account'}
                              >
                                {isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                onClick={() => {
                                  setDeletingUser(user);
                                  setDeleteConfirmText('');
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="Delete Staff Account"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE STAFF MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create Staff Account</h3>
                  <p className="text-xs text-slate-500">Provide staff details & login credentials</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Amina Kamau"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g., akamau"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g., akamau@afyacare.co.ke"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+254 7XX XXX XXX"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Initial Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 4 characters"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">PPB / Tech License No.</label>
                  <input
                    type="text"
                    value={newLicense}
                    onChange={(e) => setNewLicense(e.target.value)}
                    placeholder="e.g., PPB-TECH-90124"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Role Permission Level</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewRole('cashier')}
                    className={`p-3 rounded-xl border-2 text-left transition ${
                      newRole === 'cashier'
                        ? 'border-emerald-700 bg-emerald-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                      <Shield className="w-3.5 h-3.5 text-emerald-700" />
                      <span>CASHIER</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      POS checkout, Rx dispensing, product viewing
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewRole('clinician')}
                    className={`p-3 rounded-xl border-2 text-left transition ${
                      newRole === 'clinician'
                        ? 'border-blue-700 bg-blue-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                      <Shield className="w-3.5 h-3.5 text-blue-700" />
                      <span>CLINICIAN</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Orders tests, writes prescriptions
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewRole('admin')}
                    className={`p-3 rounded-xl border-2 text-left transition ${
                      newRole === 'admin'
                        ? 'border-purple-700 bg-purple-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                      <ShieldAlert className="w-3.5 h-3.5 text-purple-700" />
                      <span>ADMIN</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Full access to users, settings, inventory & logs
                    </p>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-800 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs min-h-[44px]"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Staff Account</h3>
                <p className="text-xs text-slate-500">Modify details for @{editingUser.username}</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={editingUser.email || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={editingUser.phone || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">License Number</label>
                  <input
                    type="text"
                    value={editingUser.licenseNumber || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, licenseNumber: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                  />
                </div>

                {/* Role Switcher (Disabled if editing own account to prevent self-downgrade) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Role Assignment</label>
                  {editingUser.id === currentUser.id ? (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
                      <span className="font-bold text-purple-800">ADMINISTRATOR (Current User)</span>
                      <span className="text-[11px] text-slate-400">Cannot downgrade self</span>
                    </div>
                  ) : (
                    <select
                      value={editingUser.role}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, role: e.target.value as UserRole })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none bg-white font-semibold"
                    >
                      <option value="cashier">CASHIER (POS checkout & Rx dispensing)</option>
                      <option value="clinician">CLINICIAN (Tests & Prescriptions)</option>
                      <option value="admin">ADMIN (Full System Management)</option>
                    </select>
                  )}
                </div>

                {/* Account Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Account Status</label>
                  {editingUser.id === currentUser.id ? (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
                      <span className="font-bold text-teal-700">ACTIVE (Current User)</span>
                      <span className="text-[11px] text-slate-400">Cannot deactivate self</span>
                    </div>
                  ) : (
                    <select
                      value={editingUser.status}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, status: e.target.value as UserStatus })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none bg-white font-semibold"
                    >
                      <option value="active">Active (Permitted to log in)</option>
                      <option value="inactive">Inactive / Deactivated (Access revoked)</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-800 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs min-h-[44px]"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DEACTIVATE / ACTIVATE MODAL */}
      {deactivatingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {deactivatingUser.status === 'active' ? 'Deactivate Staff Account?' : 'Reactivate Staff Account?'}
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {deactivatingUser.status === 'active'
                  ? `Deactivating ${deactivatingUser.name}'s account will immediately revoke their ability to sign in, operate the POS, or access any pharmacy records.`
                  : `Reactivating ${deactivatingUser.name}'s account will restore their POS and dispensary access with their existing credentials.`}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div>
                <strong className="text-slate-900">Target Account:</strong> {deactivatingUser.name} (@{deactivatingUser.username})
              </div>
              <div>
                <strong className="text-slate-900">Current Role:</strong> {deactivatingUser.role.toUpperCase()}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeactivatingUser(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmToggleStatus}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs min-h-[44px] ${
                  deactivatingUser.status === 'active'
                    ? 'bg-amber-700 hover:bg-amber-800'
                    : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                {deactivatingUser.status === 'active' ? 'Yes, Deactivate Account' : 'Yes, Reactivate Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPLICIT CONFIRM DELETE MODAL */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-rose-200 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Permanently Delete Account?</h3>
              <p className="text-sm text-slate-600 mt-1">
                This action is destructive and irreversible. The account for{' '}
                <strong className="text-slate-900">{deletingUser.name}</strong> will be permanently wiped.
              </p>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-800">
              <p className="font-semibold">
                To confirm deletion, please type <span className="font-mono bg-white px-1 py-0.5 rounded border border-rose-300">DELETE</span> below:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setDeletingUser(null);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteConfirmText.toLowerCase() !== 'delete'}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs min-h-[44px] transition ${
                  deleteConfirmText.toLowerCase() === 'delete'
                    ? 'bg-rose-700 hover:bg-rose-800 cursor-pointer'
                    : 'bg-rose-300 cursor-not-allowed'
                }`}
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET CREDENTIALS MODAL */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Reset Credentials</h3>
              <p className="text-sm text-slate-600 mt-1">
                Assign a new password for <strong className="text-slate-900">{resetPasswordUser.name}</strong> (@{resetPasswordUser.username}).
              </p>
            </div>

            <form onSubmit={handleConfirmResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Min 4 characters"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordUser(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newPasswordInput.length < 4}
                  className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-xs min-h-[44px]"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
