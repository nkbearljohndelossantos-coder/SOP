import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { SOP, SOPVersion } from '../types';
import { Printer, ArrowLeft, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';

export const SOPPrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [sop, setSop] = useState<SOP | null>(null);
  const [version, setVersion] = useState<SOPVersion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSOP = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/sops/${id}`);
        setSop(res.data.sop);
        setVersion(res.data.sop.currentVersion || res.data.sop.versions?.[0]);
      } catch (err) {
        console.error('Failed to load SOP for print', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSOP();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Preparing official print document...</div>;
  }

  if (!sop || !version) {
    return <div className="p-8 text-center text-slate-500">Document not found.</div>;
  }

  return (
    <div className="min-h-screen bg-white text-black p-4 sm:p-8 max-w-5xl mx-auto font-sans">
      {/* Print Controls (Hidden on Print) */}
      <div className="no-print mb-6 p-4 bg-slate-100 rounded-xl flex items-center justify-between border border-slate-200">
        <Link
          to={`/sops/${sop.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Procedure
        </Link>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow transition-colors"
        >
          <Printer className="w-4 h-4" /> Print / Export PDF
        </button>
      </div>

      {/* Official Header Table */}
      <table className="w-full border-2 border-black border-collapse text-xs mb-6">
        <tbody>
          <tr>
            <td className="border-2 border-black p-3 w-1/4 text-center font-bold">
              <div className="text-xl font-black tracking-tighter">NKB</div>
              <div className="text-[10px] uppercase tracking-wide">Manufacturing Corp.</div>
            </td>
            <td className="border-2 border-black p-3 w-2/4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">
                Quality Management System • Controlled Procedure
              </div>
              <div className="text-base font-extrabold uppercase mt-0.5 tracking-tight">
                {sop.title}
              </div>
            </td>
            <td className="border-2 border-black p-2 w-1/4">
              <div className="space-y-1 text-[11px]">
                <div>
                  <strong>Document No:</strong> {sop.sopNumber}
                </div>
                <div>
                  <strong>Version:</strong> {version.versionNumber}
                </div>
                <div>
                  <strong>Status:</strong> {version.status}
                </div>
                <div>
                  <strong>Effective:</strong>{' '}
                  {version.effectiveDate
                    ? format(new Date(version.effectiveDate), 'MMM dd, yyyy')
                    : 'Pending Finalization'}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="border-2 border-black p-2 bg-gray-50">
              <strong>Owning Department:</strong> {sop.department.name} ({sop.department.code})
            </td>
            <td className="border-2 border-black p-2 bg-gray-50">
              <strong>Next Review:</strong>{' '}
              {version.reviewDate ? format(new Date(version.reviewDate), 'MMM dd, yyyy') : 'Annual'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Document Sections */}
      <div className="space-y-6 text-xs leading-relaxed">
        <section>
          <h2 className="font-bold uppercase tracking-wider text-sm border-b-2 border-black pb-1 mb-2">
            1. Purpose
          </h2>
          <p className="whitespace-pre-line text-justify">{version.purpose}</p>
        </section>

        <section>
          <h2 className="font-bold uppercase tracking-wider text-sm border-b-2 border-black pb-1 mb-2">
            2. Scope
          </h2>
          <p className="whitespace-pre-line text-justify">{version.scope}</p>
        </section>

        <section>
          <h2 className="font-bold uppercase tracking-wider text-sm border-b-2 border-black pb-1 mb-2">
            3. Responsibilities
          </h2>
          <p className="whitespace-pre-line text-justify">{version.responsibilities}</p>
        </section>

        <section>
          <h2 className="font-bold uppercase tracking-wider text-sm border-b-2 border-black pb-1 mb-2">
            4. Step-by-Step Procedure
          </h2>
          <div className="whitespace-pre-line font-mono text-[11px] leading-relaxed p-3 border border-gray-300 bg-gray-50 rounded">
            {version.procedure}
          </div>
        </section>

        <section>
          <h2 className="font-bold uppercase tracking-wider text-sm border-b-2 border-black pb-1 mb-2">
            5. Related Forms & Records
          </h2>
          <p className="whitespace-pre-line">{version.relatedForms || 'None.'}</p>
        </section>

        <section>
          <h2 className="font-bold uppercase tracking-wider text-sm border-b-2 border-black pb-1 mb-2">
            6. References & Applicable Regulatory Standards
          </h2>
          <p className="whitespace-pre-line">{version.references || 'None.'}</p>
        </section>

        {/* Formal Department Sign-Offs & Signatures */}
        <section className="pt-4 page-break-inside-avoid">
          <h2 className="font-bold uppercase tracking-wider text-sm border-b-2 border-black pb-1 mb-3">
            7. Controlled Approvals & Digital Signatures (Version {version.versionNumber})
          </h2>

          <table className="w-full border border-black border-collapse text-[10px]">
            <thead>
              <tr className="bg-gray-100 border-b border-black text-left">
                <th className="p-2 border-r border-black">Department</th>
                <th className="p-2 border-r border-black">Role</th>
                <th className="p-2 border-r border-black">Signatory & Decision</th>
                <th className="p-2 border-r border-black">Date & Time</th>
                <th className="p-2">Digital Signature Token (SHA-256)</th>
              </tr>
            </thead>
            <tbody>
              {version.participants
                .filter((p) => p.participationType !== 'NOT_INVOLVED')
                .map((p) => {
                  const approvalRecord = version.approvals?.find(
                    (a) => a.departmentId === p.departmentId
                  );

                  return (
                    <tr key={p.id} className="border-b border-gray-300">
                      <td className="p-2 border-r border-black font-bold">
                        {p.department.name}
                      </td>
                      <td className="p-2 border-r border-black font-semibold">
                        {p.participationType}
                      </td>
                      <td className="p-2 border-r border-black">
                        {p.decisionUser ? (
                          <div>
                            <span className="font-bold">
                              {p.decisionUser.firstName} {p.decisionUser.lastName}
                            </span>
                            <span className="block text-gray-600 font-semibold">
                              [{p.status}]
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Pending Sign-off</span>
                        )}
                      </td>
                      <td className="p-2 border-r border-black whitespace-nowrap">
                        {p.decisionAt
                          ? format(new Date(p.decisionAt), 'yyyy-MM-dd HH:mm')
                          : '-'}
                      </td>
                      <td className="p-2 font-mono text-[9px] break-all">
                        {approvalRecord?.signatureToken ? (
                          <span>{approvalRecord.signatureToken}</span>
                        ) : p.agreementConfirmed ? (
                          <span className="text-gray-500">Agreement Confirmed</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>

        {/* Revision Log */}
        <section className="pt-4 page-break-inside-avoid">
          <h2 className="font-bold uppercase tracking-wider text-sm border-b-2 border-black pb-1 mb-2">
            8. Document Revision History
          </h2>
          <table className="w-full border border-black border-collapse text-[10px]">
            <thead>
              <tr className="bg-gray-100 border-b border-black text-left">
                <th className="p-2 border-r border-black w-16">Version</th>
                <th className="p-2 border-r border-black w-24">Date</th>
                <th className="p-2 border-r border-black">Reason for Revision</th>
                <th className="p-2">Changes Summary</th>
              </tr>
            </thead>
            <tbody>
              {sop.versions?.map((v) => (
                <tr key={v.id} className="border-b border-gray-300">
                  <td className="p-2 border-r border-black font-bold">{v.versionNumber}</td>
                  <td className="p-2 border-r border-black whitespace-nowrap">
                    {format(new Date(v.createdAt), 'yyyy-MM-dd')}
                  </td>
                  <td className="p-2 border-r border-black">{v.revisionReason || 'Initial Release'}</td>
                  <td className="p-2">{v.changeSummary || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Official Footer */}
        <div className="pt-8 text-center text-[10px] text-gray-500 border-t border-gray-300">
          <p className="font-bold text-gray-700">
            NKB MANUFACTURING CORP. • ISO 9001:2015 QUALITY MANAGEMENT SYSTEM
          </p>
          <p className="mt-0.5">
            PROPRIETARY AND CONFIDENTIAL • UNCONTROLLED WHEN PRINTED OR DOWNLOADED • VERIFY CURRENT VERSION ON PORTAL
          </p>
        </div>
      </div>
    </div>
  );
};
