import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { AuditLog } from '../types';
import { ShieldCheck, Filter, Clock, User as UserIcon, Globe, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { format } from 'date-fns';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const res = await api.get('/audit-logs');
        setLogs(res.data.logs || []);
      } catch (err) {
        console.error('Failed to load audit logs', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    if (actionFilter === 'ALL') return true;
    return l.action === actionFilter;
  });

  const getActionBadgeColor = (action: string) => {
    if (action.includes('APPROVED') || action.includes('FINALIZED')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (action.includes('REJECTED') || action.includes('CHANGES_REQUESTED')) {
      return 'bg-rose-50 text-rose-800 border-rose-200';
    }
    if (action.includes('REVISION')) {
      return 'bg-purple-50 text-purple-800 border-purple-200';
    }
    return 'bg-blue-50 text-blue-800 border-blue-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Compliance Audit Trail
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Immutable, append-only security log of all document creations, revisions, reviews, approvals, and system state transitions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-sm transition-colors no-print"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print Audit Log</span>
          </button>

          <div className="flex items-center gap-2 no-print">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Actions</option>
            <option value="SOP_CREATED">SOP Created</option>
            <option value="SOP_SUBMITTED_FOR_REVIEW">Submitted For Review</option>
            <option value="SOP_ADVANCED_TO_DISCUSSION">Advanced to Discussion</option>
            <option value="SOP_AGREEMENT_CONFIRMED">Agreement Confirmed</option>
            <option value="SOP_APPROVED">SOP Approved</option>
            <option value="SOP_CHANGES_REQUESTED">Changes Requested</option>
            <option value="SOP_FINALIZED">SOP Finalized</option>
            <option value="SOP_REVISION_CREATED">Revision Created</option>
            <option value="MEETING_RECORDED">Meeting Recorded</option>
            <option value="AUTH_LOGIN">User Login</option>
          </select>
        </div>
      </div>
    </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading audit log stream...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No audit records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Entity</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedRow === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadgeColor(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {log.entity} <span className="text-slate-400 font-sans">({log.entityId.slice(0, 8)}...)</span>
                        </td>
                        <td className="py-3 px-4 text-slate-800 font-medium">
                          {log.user ? (
                            <span>
                              {log.user.firstName} {log.user.lastName}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">System</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {log.ipAddress || '127.0.0.1'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                          >
                            <span>Payload</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/75">
                          <td colSpan={6} className="p-4 border-b border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                              {log.oldValue && (
                                <div>
                                  <span className="font-sans font-bold text-slate-500 block mb-1">
                                    Previous State:
                                  </span>
                                  <pre className="p-2.5 bg-slate-900 text-slate-200 rounded-lg overflow-x-auto text-[11px]">
                                    {JSON.stringify(log.oldValue, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.newValue && (
                                <div>
                                  <span className="font-sans font-bold text-slate-500 block mb-1">
                                    New State / Payload:
                                  </span>
                                  <pre className="p-2.5 bg-slate-900 text-slate-200 rounded-lg overflow-x-auto text-[11px]">
                                    {JSON.stringify(log.newValue, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
