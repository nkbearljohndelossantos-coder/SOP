import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { User, Department, Roles, Role } from '../types';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';
import { Users, UserPlus, Search, Shield, Building, AlertCircle, CheckCircle, Printer } from 'lucide-react';

export const UserManagementPage: React.FC = () => {
  const { user: currentUser, isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add User Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: Roles.REVIEWER as Role,
    departmentId: '',
    employeeId: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, deptRes] = await Promise.all([
        api.get('/users'),
        api.get('/departments'),
      ]);
      setUsers(userRes.data.users || []);
      setDepartments(deptRes.data.departments || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load user list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users', {
        ...form,
        departmentId: form.departmentId || null,
        employeeId: form.employeeId || null,
      });
      setShowAddModal(false);
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        role: Roles.REVIEWER,
        departmentId: '',
        employeeId: '',
      });
      setSuccess('User created successfully.');
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user.');
    }
  };

  const handleToggleActive = async (user: User) => {
    if (user.id === currentUser?.id) {
      setError('You cannot deactivate your own account.');
      return;
    }
    const actionWord = user.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${actionWord} the account for ${user.firstName} ${user.lastName}?`)) {
      return;
    }
    try {
      await api.patch(`/users/${user.id}/status`, { isActive: !user.isActive });
      setSuccess(`User ${user.firstName} ${user.lastName} has been ${user.isActive ? 'deactivated' : 'activated'}.`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update user status.');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      setError('You cannot delete your own account.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user "${user.firstName} ${user.lastName} (${user.email})"? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.delete(`/users/${user.id}`);
      setSuccess(`User "${user.firstName} ${user.lastName}" has been permanently deleted.`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete user.');
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.firstName.toLowerCase().includes(q) ||
      u.lastName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.department?.name.toLowerCase().includes(q) ||
      u.employeeId?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Directory & RBAC</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage enterprise identities, roles, and department assignments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-sm transition-colors no-print"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print User Roster</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm no-print"
          >
            <UserPlus className="w-4 h-4" /> Add New User
          </button>
        </div>
      </div>

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, email, employee ID, or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading user directory...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Name & Email</th>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      <div>
                        {u.firstName} {u.lastName}
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">{u.email}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {u.employeeId || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                        <Shield className="w-3 h-3 text-blue-600" />
                        {u.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {u.department ? (
                        <span className="inline-flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400" />
                          {u.department.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Executive / Global</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {u.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {u.id === currentUser?.id ? (
                        <span className="text-[11px] text-slate-400 italic">Current User</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`text-[11px] font-semibold hover:underline ${
                              u.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'
                            }`}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Create New User Account">
        <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Official Email *</label>
            <input
              type="email"
              required
              placeholder="user@nkb.local"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Temporary Password *</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                {Object.values(Roles).map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Department</label>
              <select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                <option value="">-- None (Executive) --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Employee ID (Optional)</label>
            <input
              type="text"
              placeholder="e.g. EMP-104"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
            >
              Create User
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
