import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Department, User } from '../types';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/common/Modal';
import { Building2, Users, UserCheck, Plus, AlertCircle, CheckCircle, Printer } from 'lucide-react';

export const DepartmentManagementPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Assign Head Modal
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [newHeadId, setNewHeadId] = useState('');
  const [showHeadModal, setShowHeadModal] = useState(false);

  // Add Dept Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [deptRes, userRes] = await Promise.all([
        api.get('/departments'),
        api.get('/users'),
      ]);
      setDepartments(deptRes.data.departments || []);
      setUsers(userRes.data.users || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load department directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDept || !newHeadId) return;
    try {
      await api.patch(`/departments/${selectedDept.id}/head`, { headId: newHeadId });
      setShowHeadModal(false);
      setSuccess(`Department Head updated for ${selectedDept.name}.`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update department head.');
    }
  };

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/departments', deptForm);
      setShowAddModal(false);
      setDeptForm({ name: '', code: '', description: '' });
      setSuccess(`Department ${deptForm.name} successfully created.`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create department.');
    }
  };

  const handleDeleteDept = async (dept: Department) => {
    if (!window.confirm(`Are you sure you want to delete department "${dept.name} (${dept.code})"?`)) {
      return;
    }
    try {
      await api.delete(`/departments/${dept.id}`);
      setSuccess(`Department "${dept.name}" has been deleted.`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete department.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Organizational Structure & Departments
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {departments.length} corporate department{departments.length === 1 ? '' : 's'} configured for NKB Manufacturing Corp.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-sm transition-colors no-print"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print Directory</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm no-print"
            >
              <Plus className="w-4 h-4" /> Add Department
            </button>
          )}
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

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading organizational structure...</div>
      ) : departments.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Departments Configured</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            You have reset the organizational structure. Click &quot;Add Department&quot; above to set up your company's departments.
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add First Department
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {dept.code}
                    </span>
                    <h3 className="font-bold text-sm text-slate-800 mt-2">{dept.name}</h3>
                  </div>
                  <Building2 className="w-5 h-5 text-slate-400" />
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-400">Department Head:</span>
                    <span className="font-semibold text-slate-800">
                      {dept.head ? `${dept.head.firstName} ${dept.head.lastName}` : 'Unassigned'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-400">Assigned Staff:</span>
                    <span className="font-medium">{dept._count?.users || 0} members</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-400">Owned SOPs:</span>
                    <span className="font-medium">{dept._count?.ownedSOPs || 0} procedures</span>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => handleDeleteDept(dept)}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDept(dept);
                      setNewHeadId(dept.headId || '');
                      setShowHeadModal(true);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Assign Head →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assign Head Modal */}
      <Modal
        isOpen={showHeadModal}
        onClose={() => setShowHeadModal(false)}
        title={`Assign Department Head for ${selectedDept?.name}`}
      >
        <form onSubmit={handleAssignHead} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Department Head</label>
            <select
              value={newHeadId}
              onChange={(e) => setNewHeadId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
            >
              <option value="">-- Choose User --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.email}) - {u.role}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowHeadModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
            >
              Confirm Assignment
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Department Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Create New Department"
      >
        <form onSubmit={handleCreateDept} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Department Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Environmental Health and Safety"
              value={deptForm.name}
              onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Department Code *</label>
            <input
              type="text"
              required
              placeholder="e.g. EHS"
              value={deptForm.code}
              onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="Department function..."
              value={deptForm.description}
              onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
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
              Create Department
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
