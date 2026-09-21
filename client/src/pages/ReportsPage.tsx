import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { SOP, Department, SOPStatuses } from '../types';
import { SOPStatusBadge } from '../components/common/Badge';
import { BarChart3, PieChart, ShieldCheck, Clock, CheckCircle2, AlertCircle, Printer } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [sops, setSops] = useState<SOP[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

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
        console.error('Failed to load reports data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalSOPs = sops.length;
  const finalizedSOPs = sops.filter((s) => s.status === SOPStatuses.FINALIZED).length;
  const pendingApprovals = sops.filter(
    (s) =>
      s.status === SOPStatuses.PENDING_DEPARTMENT_APPROVAL ||
      s.status === SOPStatuses.PENDING_FINAL_REVIEW
  ).length;
  const inDiscussion = sops.filter(
    (s) =>
      s.status === SOPStatuses.UNDER_REVIEW ||
      s.status === SOPStatuses.DEPARTMENT_DISCUSSION ||
      s.status === SOPStatuses.REMARKS_CONSOLIDATION
  ).length;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            QMS Reports & Compliance Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            ISO 9001:2015 controlled document compliance, review progress, and department performance metrics.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-sm transition-colors no-print"
        >
          <Printer className="w-4 h-4 text-slate-500" />
          <span>Print Report</span>
        </button>
      </div>

      {/* High-level Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase">
            Document Repository
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalSOPs}</div>
          <span className="text-[11px] text-slate-400">Total registered procedures</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-emerald-700 uppercase">
            Finalized & Effective
          </span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{finalizedSOPs}</div>
          <span className="text-[11px] text-slate-400">
            {totalSOPs > 0 ? `${Math.round((finalizedSOPs / totalSOPs) * 100)}% compliance` : '0%'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-amber-700 uppercase">
            Pending Sign-Offs
          </span>
          <div className="text-2xl font-black text-amber-600 mt-1">{pendingApprovals}</div>
          <span className="text-[11px] text-slate-400">Awaiting department approval</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-blue-700 uppercase">
            In Review & Discussion
          </span>
          <div className="text-2xl font-black text-blue-600 mt-1">{inDiscussion}</div>
          <span className="text-[11px] text-slate-400">Collaborative stages</span>
        </div>
      </div>

      {/* Department Breakdown Matrix */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-800">
            Department SOP Ownership & Workload
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Overview of procedure volume across the 22 verified corporate departments.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Department Name</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Department Head</th>
                <th className="py-3 px-4 text-center">Owned SOPs</th>
                <th className="py-3 px-4 text-center">Active Members</th>
                <th className="py-3 px-4 text-right">Compliance Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map((d) => {
                const ownedCount = sops.filter((s) => s.departmentId === d.id).length;
                return (
                  <tr key={d.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-800">{d.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{d.code}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {d.head ? `${d.head.firstName} ${d.head.lastName}` : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-800">
                      {ownedCount}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600">
                      {d._count?.users || 0}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Synchronized
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
