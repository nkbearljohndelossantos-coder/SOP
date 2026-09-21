import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Department, ParticipationTypes, ParticipationType } from '../types';
import {
  FileText,
  Users,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';

export const SOPCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [sopNumber, setSopNumber] = useState('');
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [scope, setScope] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [procedure, setProcedure] = useState('');
  const [relatedForms, setRelatedForms] = useState('');
  const [references, setReferences] = useState('');

  // Matrix State: map departmentId -> ParticipationType
  const [participantMatrix, setParticipantMatrix] = useState<Record<string, ParticipationType>>({});

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        setLoading(true);
        const res = await api.get('/departments');
        const depts: Department[] = res.data.departments || [];
        setDepartments(depts);

        if (depts.length > 0) {
          const initialDeptId = depts[0].id;
          setDepartmentId(initialDeptId);

          // Default: Owner is REQUIRED_APPROVER, others default to NOT_INVOLVED
          const initMatrix: Record<string, ParticipationType> = {};
          depts.forEach((d) => {
            initMatrix[d.id] = d.id === initialDeptId ? ParticipationTypes.REQUIRED_APPROVER : ParticipationTypes.NOT_INVOLVED;
          });
          setParticipantMatrix(initMatrix);
        }
      } catch (err) {
        console.error('Failed to load departments', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDepartments();
  }, []);

  const handleOwnerChange = (newDeptId: string) => {
    setDepartmentId(newDeptId);
    setParticipantMatrix((prev) => ({
      ...prev,
      [newDeptId]: ParticipationTypes.REQUIRED_APPROVER,
    }));
  };

  const handleMatrixChange = (deptId: string, type: ParticipationType) => {
    setParticipantMatrix((prev) => ({
      ...prev,
      [deptId]: type,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sopNumber.trim() || !title.trim() || !departmentId) {
      setError('SOP Number, Title, and Owning Department are strictly required.');
      return;
    }

    if (!purpose.trim() || !scope.trim() || !responsibilities.trim() || !procedure.trim()) {
      setError('Purpose, Scope, Responsibilities, and Procedure sections are required for an SOP.');
      return;
    }

    // Build participants payload
    const participants = Object.entries(participantMatrix).map(([deptId, type]) => ({
      departmentId: deptId,
      participationType: type,
    }));

    // Ensure at least one REQUIRED_APPROVER
    const hasApprover = participants.some((p) => p.participationType === ParticipationTypes.REQUIRED_APPROVER);
    if (!hasApprover) {
      setError('At least one department (typically the owning department) must be assigned as REQUIRED_APPROVER.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/sops', {
        sopNumber: sopNumber.trim(),
        title: title.trim(),
        departmentId,
        ownerDeptId: departmentId,
        category: 'Standard Operating Procedure',
        purpose,
        scope,
        responsibilities,
        procedure,
        relatedForms: relatedForms || undefined,
        references: references || undefined,
        participants,
      });

      const newSopId = res.data.sop?.id || res.data.data?.sop?.id || res.data.id;
      navigate(`/sops/${newSopId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create Standard Operating Procedure.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentDept = departments.find((d) => d.id === departmentId);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading organizational structure...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Create Standard Operating Procedure
          </h1>
          <p className="text-xs text-slate-500">
            Author a new controlled procedure and define its department-specific review & approval matrix.
          </p>
        </div>
      </div>

      {departments.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
          <div>
            <span className="font-bold block">No Departments Configured</span>
            Before creating an SOP, please add at least one department under Departments.
            <button
              type="button"
              onClick={() => navigate('/departments')}
              className="mt-1 text-xs font-semibold text-blue-600 hover:underline block"
            >
              Go to Departments Management →
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-blue-600" />
            General Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5 min-h-[26px]">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Owning Department *
                </label>
              </div>
              <select
                value={departmentId}
                onChange={(e) => handleOwnerChange(e.target.value)}
                disabled={departments.length === 0}
                className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm disabled:bg-slate-100 disabled:text-slate-400"
              >
                {departments.length === 0 ? (
                  <option value="">No departments configured</option>
                ) : (
                  departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))
                )}
              </select>
              <span className="text-[11px] text-slate-400 mt-1.5 block">Department originating this procedure</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 min-h-[26px]">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  SOP Number *
                </label>
              </div>
              <input
                type="text"
                required
                value={sopNumber}
                onChange={(e) => setSopNumber(e.target.value)}
                placeholder="e.g. SOP-WH-001 or SOP-QC-002"
                className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm"
              />
              <span className="text-[11px] text-slate-400 mt-1.5 block">
                Unique controlled document code (e.g. SOP-WH-001)
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Procedure Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Quarantine and Non-Conforming Material Segregation Protocol"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Document Content Sections */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-blue-600" />
            Procedure Content (Version 1.0)
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              1. Purpose *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Explain why this procedure exists and the organizational objective it fulfills..."
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              2. Scope *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Define which facilities, departments, shifts, or operations this procedure applies to..."
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              3. Responsibilities *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Enumerate the designated roles, heads, and staff responsible for executing and enforcing this procedure..."
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              4. Step-by-Step Procedure *
            </label>
            <textarea
              required
              rows={8}
              placeholder="Detail each procedural step sequentially (Step 1, Step 2, Step 3...)"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                5. Related Forms & Records
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Form QC-012, Receiving Inspection Log"
                value={relatedForms}
                onChange={(e) => setRelatedForms(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                6. References & Standards
              </label>
              <textarea
                rows={2}
                placeholder="e.g. ISO 9001:2015 Clause 8.5.2, Company Safety Policy"
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Department Participation Matrix Configuration */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Department Participation Matrix
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Departments are NOT automatically required to approve every procedure. Configure specific participation roles below:
              </p>
            </div>
          </div>

          {/* Explanation Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div>
              <span className="font-bold text-rose-700 block">REQUIRED APPROVER</span>
              <span className="text-slate-600">Must formally approve current version before finalization can occur.</span>
            </div>
            <div>
              <span className="font-bold text-sky-700 block">REQUIRED REVIEWER</span>
              <span className="text-slate-600">Must review, attend discussions, and complete review signoff.</span>
            </div>
            <div>
              <span className="font-bold text-blue-700 block">CONSULTED</span>
              <span className="text-slate-600">Can provide remarks and recommendations, but can NEVER block finalization.</span>
            </div>
            <div>
              <span className="font-bold text-slate-500 block">NOT INVOLVED (N/A)</span>
              <span className="text-slate-600">Marked as N/A. Cannot block workflow.</span>
            </div>
          </div>

          {/* Department List */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            {departments.map((dept) => {
              const currentType = participantMatrix[dept.id] || ParticipationTypes.NOT_INVOLVED;
              const isOwner = dept.id === departmentId;

              return (
                <div key={dept.id} className="p-3 flex items-center justify-between gap-4 hover:bg-slate-50/70">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-800 block">
                      {dept.name} <span className="font-mono text-slate-400 font-normal">({dept.code})</span>
                      {isOwner && (
                        <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-full">
                          Owning Department
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Head: {dept.head ? `${dept.head.firstName} ${dept.head.lastName}` : 'Unassigned'}
                    </span>
                  </div>

                  <div className="flex-shrink-0">
                    <select
                      value={currentType}
                      onChange={(e) => handleMatrixChange(dept.id, e.target.value as ParticipationType)}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-2 ${
                        currentType === ParticipationTypes.REQUIRED_APPROVER
                          ? 'border-rose-300 bg-rose-50 text-rose-800'
                          : currentType === ParticipationTypes.REQUIRED_REVIEWER
                          ? 'border-sky-300 bg-sky-50 text-sky-800'
                          : currentType === ParticipationTypes.CONSULTED
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-300 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <option value={ParticipationTypes.REQUIRED_APPROVER}>REQUIRED APPROVER</option>
                      <option value={ParticipationTypes.REQUIRED_REVIEWER}>REQUIRED REVIEWER</option>
                      <option value={ParticipationTypes.CONSULTED}>CONSULTED</option>
                      <option value={ParticipationTypes.NOT_INVOLVED}>NOT INVOLVED (N/A)</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow transition-colors disabled:opacity-50"
          >
            {submitting ? 'Creating Procedure...' : 'Create Draft Procedure'}
          </button>
        </div>
      </form>
    </div>
  );
};
