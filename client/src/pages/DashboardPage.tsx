import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SOP, SOPStatuses } from '../types';
import { SOPStatusBadge } from '../components/common/Badge';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  FilePlus,
  ArrowRight,
  TrendingUp,
  Building,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const DashboardPage: React.FC = () => {
  const { user, canCreateSOP } = useAuth();
  const [sops, setSops] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const res = await api.get('/sops');
        setSops(res.data.sops || []);
      } catch (err) {
        console.error('Failed to load SOPs for dashboard', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  const totalSOPs = sops.length;
  const draftSOPs = sops.filter(
    (s) => s.status === SOPStatuses.DRAFT || s.status === SOPStatuses.REVISION_DRAFT
  ).length;
  const inReviewSOPs = sops.filter(
    (s) =>
      s.status === SOPStatuses.UNDER_REVIEW ||
      s.status === SOPStatuses.DEPARTMENT_DISCUSSION ||
      s.status === SOPStatuses.REMARKS_CONSOLIDATION
  ).length;
  const pendingApprovalSOPs = sops.filter(
    (s) =>
      s.status === SOPStatuses.PENDING_DEPARTMENT_APPROVAL ||
      s.status === SOPStatuses.PENDING_FINAL_REVIEW
  ).length;
  const changesRequestedSOPs = sops.filter(
    (s) => s.status === SOPStatuses.CHANGES_REQUESTED
  ).length;
  const finalizedSOPs = sops.filter((s) => s.status === SOPStatuses.FINALIZED).length;

  // Identify SOPs that might require current user's department attention
  const myActionSOPs = sops.filter((s) => {
    if (!user?.departmentId) return false;
    const version = s.currentVersion || (s.versions && s.versions[0]);
    if (!version || !version.participants) return false;

    const myParticipant = version.participants.find(
      (p) => p.departmentId === user.departmentId
    );
    if (!myParticipant) return false;

    // If I am Required Approver and status is PENDING_DEPARTMENT_APPROVAL and my dept hasn't approved
    if (
      myParticipant.participationType === 'REQUIRED_APPROVER' &&
      s.status === SOPStatuses.PENDING_DEPARTMENT_APPROVAL &&
      myParticipant.status !== 'APPROVED'
    ) {
      return true;
    }

    // If I am Required Reviewer and SOP is in review/discussion and my dept hasn't reviewed
    if (
      (myParticipant.participationType === 'REQUIRED_REVIEWER' ||
        myParticipant.participationType === 'REQUIRED_APPROVER') &&
      (s.status === SOPStatuses.UNDER_REVIEW || s.status === SOPStatuses.DEPARTMENT_DISCUSSION) &&
      myParticipant.status === 'PENDING'
    ) {
      return true;
    }

    return false;
  });

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-nkb-navy to-slate-800 rounded-2xl p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold mb-2">
            <span>ISO 9001:2015 Compliant Workflow</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Welcome back, {user?.firstName} {user?.lastName}
          </h1>
          <p className="text-slate-300 text-sm mt-1">
            {user?.department
              ? `${user.department.name} • Standard Operating Procedure Portal`
              : 'Cross-Department Executive Oversight Portal'}
          </p>
        </div>

        {canCreateSOP && (
          <Link
            to="/sops/create"
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm shadow-md transition-all flex-shrink-0"
          >
            <FilePlus className="w-4 h-4" />
            <span>Create New SOP</span>
          </Link>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total SOPs</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">{totalSOPs}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Active repository</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Drafts</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-700 mt-2">{draftSOPs}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">In authoring</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">In Review</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-600 mt-2">{inReviewSOPs}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Discussion / remarks</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 uppercase">Awaiting Signoff</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-2">{pendingApprovalSOPs}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Required Approvers</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 uppercase">Changes Req.</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 mt-2">{changesRequestedSOPs}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Returned to creator</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 uppercase">Finalized</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-2">{finalizedSOPs}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Official & active</span>
        </div>
      </div>

      {/* Actionable Tasks & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Action Items Column */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>Requires Department Attention</span>
                {myActionSOPs.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    {myActionSOPs.length}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Procedures where your department is a Required Approver or Reviewer.
              </p>
            </div>
            <Link to="/sops" className="text-xs font-semibold text-blue-600 hover:underline">
              View All Procedures →
            </Link>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {myActionSOPs.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                All caught up! No pending sign-offs or reviews awaiting your department.
              </div>
            ) : (
              myActionSOPs.map((sop) => (
                <div key={sop.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {sop.sopNumber}
                      </span>
                      <span className="text-xs text-slate-400">v{sop.currentVersionNumber}</span>
                      <SOPStatusBadge status={sop.status} />
                    </div>
                    <Link
                      to={`/sops/${sop.id}`}
                      className="text-sm font-semibold text-slate-800 hover:text-blue-600 truncate block"
                    >
                      {sop.title}
                    </Link>
                    <span className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      Owner: {sop.department.name}
                    </span>
                  </div>

                  <Link
                    to={`/sops/${sop.id}`}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-1"
                  >
                    Review <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recently Updated Procedures */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-800">Recent Procedures</h2>
            <Link to="/sops" className="text-xs text-blue-600 font-semibold hover:underline">
              See list
            </Link>
          </div>

          <div className="mt-4 space-y-4">
            {sops.slice(0, 5).map((sop) => (
              <div key={sop.id} className="text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800">{sop.sopNumber}</span>
                  <SOPStatusBadge status={sop.status} />
                </div>
                <Link
                  to={`/sops/${sop.id}`}
                  className="font-medium text-slate-700 hover:text-blue-600 mt-1 block truncate"
                >
                  {sop.title}
                </Link>
                <div className="text-[11px] text-slate-400 mt-1">
                  Updated {formatDistanceToNow(new Date(sop.updatedAt), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
