import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SOP, Department, SOPStatuses } from '../types';
import { SOPStatusBadge } from '../components/common/Badge';
import {
  Search,
  Filter,
  FilePlus,
  Building,
  Printer,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

export const SOPListPage: React.FC = () => {
  const { user, canCreateSOP } = useAuth();
  const [sops, setSops] = useState<SOP[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [sopRes, deptRes] = await Promise.all([
          api.get('/sops'),
          api.get('/departments'),
        ]);
        setSops(sopRes.data.sops || []);
        setDepartments(deptRes.data.departments || []);
      } catch (err) {
        console.error('Failed to load SOPs', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredSOPs = sops.filter((sop) => {
    // Search filter
    const q = search.toLowerCase().trim();
    if (
      q &&
      !sop.sopNumber.toLowerCase().includes(q) &&
      !sop.title.toLowerCase().includes(q) &&
      !sop.department.name.toLowerCase().includes(q)
    ) {
      return false;
    }

    // Department filter
    if (departmentFilter !== 'ALL' && sop.departmentId !== departmentFilter) {
      return false;
    }

    // Status / Tab filter
    if (statusFilter === 'MY_DEPT') {
      return sop.departmentId === user?.departmentId;
    }
    if (statusFilter === 'DRAFT') {
      return sop.status === SOPStatuses.DRAFT || sop.status === SOPStatuses.REVISION_DRAFT;
    }
    if (statusFilter === 'IN_REVIEW') {
      return (
        sop.status === SOPStatuses.UNDER_REVIEW ||
        sop.status === SOPStatuses.DEPARTMENT_DISCUSSION ||
        sop.status === SOPStatuses.REMARKS_CONSOLIDATION
      );
    }
    if (statusFilter === 'AWAITING_APPROVAL') {
      return (
        sop.status === SOPStatuses.PENDING_DEPARTMENT_APPROVAL ||
        sop.status === SOPStatuses.PENDING_FINAL_REVIEW
      );
    }
    if (statusFilter === 'CHANGES_REQUESTED') {
      return sop.status === SOPStatuses.CHANGES_REQUESTED;
    }
    if (statusFilter === 'FINALIZED') {
      return sop.status === SOPStatuses.FINALIZED;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Standard Operating Procedures
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse, manage, review, and verify standard procedures across all departments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print SOP List</span>
          </button>

          {canCreateSOP && (
            <Link
              to="/sops/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <FilePlus className="w-4 h-4" />
              <span>Create Procedure</span>
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2">
        {[
          { id: 'ALL', label: 'All Procedures' },
          { id: 'MY_DEPT', label: 'My Department' },
          { id: 'IN_REVIEW', label: 'In Review & Discussion' },
          { id: 'AWAITING_APPROVAL', label: 'Awaiting Approvals' },
          { id: 'CHANGES_REQUESTED', label: 'Changes Requested' },
          { id: 'FINALIZED', label: 'Finalized & Effective' },
          { id: 'DRAFT', label: 'Drafts' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`pb-3 px-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              statusFilter === tab.id
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by SOP number, title, or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Loading procedures...</div>
        ) : filteredSOPs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No procedures found matching the current criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">SOP Number</th>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSOPs.map((sop) => (
                  <tr key={sop.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      <Link to={`/sops/${sop.id}`} className="hover:text-blue-600">
                        {sop.sopNumber}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800 max-w-xs truncate">
                      <Link to={`/sops/${sop.id}`} className="hover:text-blue-600">
                        {sop.title}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        {sop.department.name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      v{sop.currentVersionNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <SOPStatusBadge status={sop.status} />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {format(new Date(sop.updatedAt), 'MMM dd, yyyy')}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/sops/${sop.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Print ISO 9001 Format (opens in printable window)"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600" />
                          <span>Print</span>
                        </a>
                        <Link
                          to={`/sops/${sop.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 ml-1"
                        >
                          <span>Open</span>
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
