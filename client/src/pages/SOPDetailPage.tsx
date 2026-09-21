import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  SOP,
  SOPVersion,
  SOPStatus,
  SOPStatuses,
  ParticipationTypes,
  ParticipationType,
  SOPRemark,
  SOPReviewMeeting,
  SOPAttachment,
} from '../types';
import {
  SOPStatusBadge,
  ParticipationBadge,
  ParticipantStatusBadge,
} from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import {
  FileText,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  MessageSquare,
  FileCheck,
  Printer,
  History,
  ShieldCheck,
  Paperclip,
  Calendar,
  Send,
  Plus,
  Lock,
  ArrowRight,
  AlertCircle,
  Download,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';

export const SOPDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, isDeptHead } = useAuth();

  const [sop, setSop] = useState<SOP | null>(null);
  const [activeVersion, setActiveVersion] = useState<SOPVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'content' | 'matrix' | 'meetings' | 'remarks' | 'attachments' | 'history' | 'audit'
  >('content');

  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [showEditDraftModal, setShowEditDraftModal] = useState(false);

  // Form states
  const [meetingForm, setMeetingForm] = useState({
    meetingDate: format(new Date(), 'yyyy-MM-dd'),
    meetingMode: 'In-Person (Conference Room A)',
    minutesOfMeeting: '',
    attendees: '',
    decisions: '',
  });

  const [remarkForm, setRemarkForm] = useState({
    departmentId: user?.departmentId || '',
    stepReference: '',
    comment: '',
    recommendation: '',
  });

  const [rejectReason, setRejectReason] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [changeSummary, setChangeSummary] = useState('');

  // Draft edit state
  const [draftForm, setDraftForm] = useState({
    title: '',
    purpose: '',
    scope: '',
    responsibilities: '',
    procedure: '',
    relatedForms: '',
    references: '',
    effectiveDate: '',
    reviewDate: '',
  });

  // Attachments
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const fetchSOP = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/sops/${id}`);
      const data: SOP = res.data.sop;
      setSop(data);
      if (data.currentVersion) {
        setActiveVersion(data.currentVersion);
        setDraftForm({
          title: data.currentVersion.title || data.title,
          purpose: data.currentVersion.purpose || '',
          scope: data.currentVersion.scope || '',
          responsibilities: data.currentVersion.responsibilities || '',
          procedure: data.currentVersion.procedure || '',
          relatedForms: data.currentVersion.relatedForms || '',
          references: data.currentVersion.references || '',
          effectiveDate: data.currentVersion.effectiveDate ? data.currentVersion.effectiveDate.slice(0, 10) : '',
          reviewDate: data.currentVersion.reviewDate ? data.currentVersion.reviewDate.slice(0, 10) : '',
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load SOP details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSOP();
  }, [fetchSOP]);

  const showNotification = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  // Workflow actions
  const handleSubmitForReview = async () => {
    if (!activeVersion) return;
    try {
      await api.post(`/workflow/${activeVersion.id}/submit-for-review`);
      showNotification('Procedure submitted for multi-department review.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit procedure for review.');
    }
  };

  const handleAdvanceToDiscussion = async () => {
    if (!activeVersion) return;
    try {
      await api.post(`/workflow/${activeVersion.id}/advance-to-discussion`);
      showNotification('Workflow advanced to Department Discussion & Meeting phase.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to advance to discussion.');
    }
  };

  const handleAdvanceToApproval = async () => {
    if (!activeVersion) return;
    try {
      await api.post(`/workflow/${activeVersion.id}/advance-to-approval`);
      showNotification('Workflow advanced to Department Approval phase.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to advance to approval phase.');
    }
  };

  const handleConfirmAgreement = async (departmentId: string) => {
    if (!activeVersion) return;
    try {
      await api.post(`/workflow/${activeVersion.id}/confirm-agreement`, { departmentId });
      showNotification('Department agreement successfully confirmed.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to confirm agreement.');
    }
  };

  const handleApprove = async () => {
    if (!activeVersion || !user?.departmentId) return;
    try {
      await api.post(`/workflow/${activeVersion.id}/approve`, {
        departmentId: user.departmentId,
      });
      setShowApproveModal(false);
      showNotification('Department approval formally registered with digital signature token.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to register approval.');
    }
  };

  const handleRejectOrRequestChanges = async () => {
    if (!activeVersion || !user?.departmentId) return;
    if (!rejectReason.trim()) {
      setError('A detailed reason is strictly required when requesting changes or rejecting.');
      return;
    }
    try {
      await api.post(`/workflow/${activeVersion.id}/request-changes`, {
        departmentId: user.departmentId,
        reason: rejectReason.trim(),
      });
      setShowRejectModal(false);
      setRejectReason('');
      showNotification('Changes requested. Procedure returned to author.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to request changes.');
    }
  };

  const handleFinalize = async () => {
    if (!activeVersion) return;
    if (!confirm('Are you sure you want to finalize this procedure? This will permanently freeze Version ' + activeVersion.versionNumber + ' as official company policy.')) {
      return;
    }
    try {
      await api.post(`/workflow/${activeVersion.id}/finalize`);
      showNotification(`SOP Version ${activeVersion.versionNumber} is officially finalized and locked.`);
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to finalize procedure.');
    }
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sop || !activeVersion) return;
    try {
      await api.put(`/sops/${sop.id}`, {
        ...draftForm,
        lockVersion: activeVersion.lockVersion,
      });
      setShowEditDraftModal(false);
      showNotification('Draft updated successfully.');
      await fetchSOP();
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError('Concurrency Conflict: This document was modified by another user. Please reload before saving.');
      } else {
        setError(err.response?.data?.message || 'Failed to save draft.');
      }
    }
  };

  const handleCreateRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sop) return;
    if (!revisionReason.trim()) {
      setError('A revision reason is mandatory.');
      return;
    }
    try {
      const res = await api.post(`/sops/${sop.id}/revisions`, {
        revisionReason: revisionReason.trim(),
        changeSummary: changeSummary.trim() || undefined,
      });
      setShowRevisionModal(false);
      setRevisionReason('');
      setChangeSummary('');
      showNotification(`New revision ${res.data.version.versionNumber} initiated!`);
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initiate revision.');
    }
  };

  const handleRecordMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVersion) return;
    try {
      await api.post(`/workflow/${activeVersion.id}/meetings`, meetingForm);
      setShowMeetingModal(false);
      setMeetingForm({
        meetingDate: format(new Date(), 'yyyy-MM-dd'),
        meetingMode: 'In-Person (Conference Room A)',
        minutesOfMeeting: '',
        attendees: '',
        decisions: '',
      });
      showNotification('Review meeting minutes recorded.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save meeting.');
    }
  };

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVersion) return;
    try {
      await api.post(`/remarks/versions/${activeVersion.id}`, remarkForm);
      setShowRemarkModal(false);
      setRemarkForm({
        departmentId: user?.departmentId || '',
        stepReference: '',
        comment: '',
        recommendation: '',
      });
      showNotification('Department remark submitted.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit remark.');
    }
  };

  const handleResolveRemark = async (remarkId: string) => {
    const note = prompt('Enter resolution details or how this was incorporated into the text:');
    if (!note) return;
    try {
      await api.patch(`/remarks/${remarkId}/resolve`, {
        isAddressed: true,
        resolutionNote: note,
      });
      showNotification('Remark marked as addressed.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resolve remark.');
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVersion || !selectedFile) return;
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setUploadingFile(true);
      await api.post(`/attachments/versions/${activeVersion.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelectedFile(null);
      showNotification('Attachment uploaded successfully.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload attachment.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (attachId: string) => {
    if (!confirm('Are you sure you want to delete this attachment?')) return;
    try {
      await api.delete(`/attachments/${attachId}`);
      showNotification('Attachment removed.');
      await fetchSOP();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to remove attachment.');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading Standard Operating Procedure...</div>;
  }

  if (!sop || !activeVersion) {
    return (
      <div className="p-8 text-center text-slate-500">
        Procedure not found.
        <Link to="/sops" className="text-blue-600 block mt-2">
          Back to list
        </Link>
      </div>
    );
  }

  const isFinalized = activeVersion.status === SOPStatuses.FINALIZED;
  const isDraft = activeVersion.status === SOPStatuses.DRAFT || activeVersion.status === SOPStatuses.REVISION_DRAFT;
  const isChangesRequested = activeVersion.status === SOPStatuses.CHANGES_REQUESTED;
  const isPendingApproval = activeVersion.status === SOPStatuses.PENDING_DEPARTMENT_APPROVAL;
  const isPendingFinalReview = activeVersion.status === SOPStatuses.PENDING_FINAL_REVIEW;

  // Participant checks for the current logged-in user's department
  const myParticipant = activeVersion.participants.find((p) => p.departmentId === user?.departmentId);
  const isMyDeptRequiredApprover = myParticipant?.participationType === ParticipationTypes.REQUIRED_APPROVER;
  const isMyDeptRequiredReviewer = myParticipant?.participationType === ParticipationTypes.REQUIRED_REVIEWER;
  const hasMyDeptAgreed = myParticipant?.agreementConfirmed;
  const hasMyDeptApproved = myParticipant?.status === 'APPROVED';

  // Can the current user perform approval?
  // Only Department Head of a REQUIRED_APPROVER department, in PENDING_DEPARTMENT_APPROVAL, after agreement is confirmed!
  const canUserApproveForMyDept =
    isDeptHead &&
    isMyDeptRequiredApprover &&
    isPendingApproval &&
    hasMyDeptAgreed &&
    !hasMyDeptApproved;

  // Can the user confirm agreement?
  // Dept Head or Dept Rep of participating department
  const canUserConfirmAgreement =
    (isDeptHead || user?.role === 'DEPARTMENT_REPRESENTATIVE') &&
    myParticipant &&
    myParticipant.participationType !== ParticipationTypes.NOT_INVOLVED &&
    !hasMyDeptAgreed &&
    (activeVersion.status === SOPStatuses.DEPARTMENT_DISCUSSION ||
      activeVersion.status === SOPStatuses.REMARKS_CONSOLIDATION ||
      activeVersion.status === SOPStatuses.PENDING_DEPARTMENT_APPROVAL);

  // Can finalize: Admin or Owner Dept Head, when status is PENDING_FINAL_REVIEW or all required approvers have approved
  const requiredApprovers = activeVersion.participants.filter(
    (p) => p.participationType === ParticipationTypes.REQUIRED_APPROVER
  );
  const allRequiredApproved =
    requiredApprovers.length > 0 && requiredApprovers.every((p) => p.status === 'APPROVED');

  const canUserFinalize =
    (isAdmin || (isDeptHead && user?.departmentId === sop.departmentId)) &&
    (isPendingFinalReview || (isPendingApproval && allRequiredApproved));

  // Visual Stepper stages
  const workflowStages = [
    { name: 'Draft', status: SOPStatuses.DRAFT },
    { name: 'Under Review', status: SOPStatuses.UNDER_REVIEW },
    { name: 'Discussion', status: SOPStatuses.DEPARTMENT_DISCUSSION },
    { name: 'Consolidation', status: SOPStatuses.REMARKS_CONSOLIDATION },
    { name: 'Dept Approval', status: SOPStatuses.PENDING_DEPARTMENT_APPROVAL },
    { name: 'Final Review', status: SOPStatuses.PENDING_FINAL_REVIEW },
    { name: 'Finalized', status: SOPStatuses.FINALIZED },
  ];

  const getCurrentStageIndex = () => {
    switch (activeVersion.status) {
      case SOPStatuses.DRAFT:
      case SOPStatuses.REVISION_DRAFT:
        return 0;
      case SOPStatuses.UNDER_REVIEW:
        return 1;
      case SOPStatuses.DEPARTMENT_DISCUSSION:
        return 2;
      case SOPStatuses.REMARKS_CONSOLIDATION:
        return 3;
      case SOPStatuses.PENDING_DEPARTMENT_APPROVAL:
        return 4;
      case SOPStatuses.PENDING_FINAL_REVIEW:
        return 5;
      case SOPStatuses.FINALIZED:
        return 6;
      case SOPStatuses.CHANGES_REQUESTED:
        return -1;
      default:
        return 0;
    }
  };

  const currentStageIndex = getCurrentStageIndex();

  return (
    <div className="space-y-6 pb-16">
      {/* Action alerts */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2 shadow-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-bold text-rose-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap mb-2">
              <span className="font-mono text-base font-black text-nkb-navy bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                {sop.sopNumber}
              </span>
              <span className="text-sm font-semibold text-slate-500">
                Version {activeVersion.versionNumber}
              </span>
              <SOPStatusBadge status={activeVersion.status} />
              {isFinalized && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <Lock className="w-3 h-3" /> Controlled & Frozen
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{sop.title}</h1>

            <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 flex-wrap">
              <span>
                Owning Dept: <strong className="text-slate-800">{sop.department.name}</strong>
              </span>
              <span>•</span>
              <span>
                Authored by:{' '}
                <strong className="text-slate-800">
                  {sop.createdBy.firstName} {sop.createdBy.lastName}
                </strong>
              </span>
              <span>•</span>
              <span>Effective Date: {activeVersion.effectiveDate ? format(new Date(activeVersion.effectiveDate), 'MMM dd, yyyy') : 'Pending Finalization'}</span>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <a
              href={`/sops/${sop.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
              title="Open ISO 9001 Printable Document"
            >
              <Printer className="w-4 h-4 text-blue-400" />
              <span>Print Official SOP</span>
            </a>

            {isDraft && (
              <button
                onClick={() => setShowEditDraftModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-blue-300 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
              >
                Edit Draft
              </button>
            )}

            {(isFinalized || isChangesRequested) && (
              <button
                onClick={() => setShowRevisionModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Revision</span>
              </button>
            )}
          </div>
        </div>

        {/* Visual Stepper */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
            ISO 9001 Procedure Lifecycle Stepper
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-center">
            {workflowStages.map((stage, idx) => {
              const isPast = currentStageIndex >= idx;
              const isCurrent = currentStageIndex === idx;

              return (
                <div
                  key={stage.name}
                  className={`p-2 rounded-lg border text-xs transition-all ${
                    isCurrent
                      ? 'bg-blue-600 text-white border-blue-600 font-bold shadow'
                      : isPast
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  <div className="text-[10px] opacity-75">Step {idx + 1}</div>
                  <div className="truncate">{stage.name}</div>
                </div>
              );
            })}
          </div>

          {activeVersion.status === SOPStatuses.CHANGES_REQUESTED && (
            <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>
                <strong>Changes Requested:</strong> This procedure has been sent back for amendment. Review remarks, update content, or initiate revision.
              </span>
            </div>
          )}
        </div>

        {/* Dynamic Workflow Transition Toolbar */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50 p-4 rounded-xl">
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Workflow Action Center: </span>
            {isDraft && 'Ready for multi-department review.'}
            {activeVersion.status === SOPStatuses.UNDER_REVIEW && 'Reviewers are inspecting procedure.'}
            {activeVersion.status === SOPStatuses.DEPARTMENT_DISCUSSION && 'Conduct meeting and record discussions.'}
            {activeVersion.status === SOPStatuses.REMARKS_CONSOLIDATION && 'Consolidate feedback before formal signoff.'}
            {isPendingApproval && 'Awaiting formal digital approvals from Required Approvers.'}
            {isPendingFinalReview && 'All required approvals granted! Ready for executive finalization lock.'}
            {isFinalized && 'This procedure is finalized and active in production.'}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isDraft && (
              <button
                onClick={handleSubmitForReview}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Submit For Review
              </button>
            )}

            {activeVersion.status === SOPStatuses.UNDER_REVIEW && (
              <button
                onClick={handleAdvanceToDiscussion}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                Advance to Discussion <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {(activeVersion.status === SOPStatuses.DEPARTMENT_DISCUSSION ||
              activeVersion.status === SOPStatuses.REMARKS_CONSOLIDATION) && (
              <button
                onClick={handleAdvanceToApproval}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                Open Department Sign-Offs <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {canUserApproveForMyDept && (
              <button
                onClick={() => setShowApproveModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Grant Formal Approval
              </button>
            )}

            {(isPendingApproval || activeVersion.status === SOPStatuses.DEPARTMENT_DISCUSSION) && isDeptHead && (
              <button
                onClick={() => setShowRejectModal(true)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Request Changes
              </button>
            )}

            {canUserFinalize && (
              <button
                onClick={handleFinalize}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md"
              >
                <Lock className="w-3.5 h-3.5" /> Finalize Procedure (Lock)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2 bg-white px-4 rounded-xl border shadow-sm">
        {[
          { id: 'content', label: 'Procedure Content', icon: FileText },
          {
            id: 'matrix',
            label: 'Participation & Approval Matrix',
            icon: Users,
            badge: `${activeVersion.participants.filter((p) => p.participationType !== 'NOT_INVOLVED').length} depts`,
          },
          {
            id: 'meetings',
            label: 'Review Meetings',
            icon: Calendar,
            badge: activeVersion.meetings?.length ? String(activeVersion.meetings.length) : undefined,
          },
          {
            id: 'remarks',
            label: 'Remarks & Recommendations',
            icon: MessageSquare,
            badge: activeVersion.remarks?.length ? String(activeVersion.remarks.length) : undefined,
          },
          {
            id: 'attachments',
            label: 'Attachments & Forms',
            icon: Paperclip,
            badge: activeVersion.attachments?.length ? String(activeVersion.attachments.length) : undefined,
          },
          {
            id: 'history',
            label: 'Revision History',
            icon: History,
            badge: sop.versions?.length ? `v${sop.currentVersionNumber}` : undefined,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3.5 px-4 text-xs font-semibold whitespace-nowrap border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Content View */}
      {activeTab === 'content' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">Controlled Procedure Specification</h2>
              <p className="text-xs text-slate-500">Document No: {sop.sopNumber} • Version {activeVersion.versionNumber}</p>
            </div>
            <a
              href={`/sops/${sop.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print Procedure</span>
            </a>
          </div>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              1. Purpose
            </h3>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line bg-slate-50/50 p-4 rounded-lg border border-slate-100">
              {activeVersion.purpose}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              2. Scope
            </h3>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line bg-slate-50/50 p-4 rounded-lg border border-slate-100">
              {activeVersion.scope}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              3. Responsibilities
            </h3>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line bg-slate-50/50 p-4 rounded-lg border border-slate-100">
              {activeVersion.responsibilities}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              4. Step-by-Step Procedure
            </h3>
            <div className="text-sm text-slate-800 font-mono leading-relaxed whitespace-pre-line bg-slate-900 text-slate-100 p-5 rounded-lg border border-slate-800 overflow-x-auto">
              {activeVersion.procedure}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                5. Related Forms & Records
              </h3>
              <p className="text-sm text-slate-700 bg-slate-50/50 p-4 rounded-lg border border-slate-100 whitespace-pre-line">
                {activeVersion.relatedForms || 'None recorded.'}
              </p>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                6. References & Applicable Standards
              </h3>
              <p className="text-sm text-slate-700 bg-slate-50/50 p-4 rounded-lg border border-slate-100 whitespace-pre-line">
                {activeVersion.references || 'None recorded.'}
              </p>
            </section>
          </div>
        </div>
      )}

      {/* Tab 2: Participant & Approval Matrix */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Department Participation & Approval Matrix
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Each version specifies its own participant roles. Only REQUIRED_APPROVER departments must approve current version before finalization.
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Version {activeVersion.versionNumber} Matrix
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Participation Role</th>
                  <th className="py-3 px-4">Agreement Status</th>
                  <th className="py-3 px-4">Approval Decision</th>
                  <th className="py-3 px-4">Sign-Off Person</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeVersion.participants.map((p) => {
                  const isMyDept = p.departmentId === user?.departmentId;
                  const canConfirmThisDept =
                    (isDeptHead || user?.role === 'DEPARTMENT_REPRESENTATIVE') &&
                    isMyDept &&
                    p.participationType !== ParticipationTypes.NOT_INVOLVED &&
                    !p.agreementConfirmed &&
                    !isFinalized;

                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/50 ${isMyDept ? 'bg-blue-50/30' : ''}`}>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {p.department.name} <span className="font-mono text-slate-400 font-normal">({p.department.code})</span>
                        {isMyDept && (
                          <span className="ml-2 text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                            Your Dept
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <ParticipationBadge type={p.participationType} />
                      </td>
                      <td className="py-3.5 px-4">
                        {p.participationType === ParticipationTypes.NOT_INVOLVED ? (
                          <span className="text-slate-400">N/A</span>
                        ) : p.agreementConfirmed ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                            <CheckCircle className="w-3.5 h-3.5" /> Agreement Confirmed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
                            <Clock className="w-3.5 h-3.5 text-amber-500" /> Pending Discussion
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <ParticipantStatusBadge
                          status={p.status}
                          agreementConfirmed={p.agreementConfirmed}
                        />
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {p.decisionUser ? (
                          <div>
                            <span className="font-semibold text-slate-800 block">
                              {p.decisionUser.firstName} {p.decisionUser.lastName}
                            </span>
                            {p.decisionAt && (
                              <span className="text-[10px] text-slate-400">
                                {format(new Date(p.decisionAt), 'MMM dd, yyyy HH:mm')}
                              </span>
                            )}
                          </div>
                        ) : p.participationType === ParticipationTypes.NOT_INVOLVED ? (
                          <span className="text-slate-400">N/A</span>
                        ) : (
                          <span className="text-slate-400 italic">Pending</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {canConfirmThisDept && (
                          <button
                            onClick={() => handleConfirmAgreement(p.departmentId)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold transition-colors"
                          >
                            Confirm Agreement
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Meetings */}
      {activeTab === 'meetings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Department Review Meetings</h3>
              <p className="text-xs text-slate-500">Record minutes of inter-department discussions.</p>
            </div>
            {!isFinalized && (
              <button
                onClick={() => setShowMeetingModal(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Record Meeting Minutes
              </button>
            )}
          </div>

          <div className="space-y-4">
            {(!activeVersion.meetings || activeVersion.meetings.length === 0) ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No formal review meetings recorded for Version {activeVersion.versionNumber} yet.
              </div>
            ) : (
              activeVersion.meetings.map((m) => (
                <div key={m.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Date: {format(new Date(m.meetingDate), 'MMMM dd, yyyy')} ({m.meetingMode})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Recorded by: {m.recordedBy.firstName} {m.recordedBy.lastName}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700">
                    <strong className="text-slate-900 block">Attendees:</strong>
                    <span>{m.attendees}</span>
                  </div>
                  <div className="text-xs text-slate-700">
                    <strong className="text-slate-900 block">Minutes of Discussion:</strong>
                    <p className="whitespace-pre-line mt-0.5">{m.minutesOfMeeting}</p>
                  </div>
                  <div className="text-xs text-slate-700">
                    <strong className="text-slate-900 block">Agreed Action Items & Decisions:</strong>
                    <p className="whitespace-pre-line mt-0.5 text-blue-900 bg-blue-50 p-2 rounded border border-blue-200">
                      {m.decisions}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Remarks */}
      {activeTab === 'remarks' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Department Remarks & Recommendations</h3>
              <p className="text-xs text-slate-500">Structured feedback tracking for ISO compliance.</p>
            </div>
            {!isFinalized && (
              <button
                onClick={() => setShowRemarkModal(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Submit Remark
              </button>
            )}
          </div>

          <div className="space-y-4">
            {(!activeVersion.remarks || activeVersion.remarks.length === 0) ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No remarks submitted for Version {activeVersion.versionNumber}.
              </div>
            ) : (
              activeVersion.remarks.map((r) => (
                <div key={r.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{r.department.name}</span>
                      {r.stepReference && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                          Ref: {r.stepReference}
                        </span>
                      )}
                    </div>
                    {r.isAddressed ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle className="w-3 h-3" /> Addressed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        <Clock className="w-3 h-3" /> Open Remark
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-800 whitespace-pre-line">{r.comment}</p>

                  {r.recommendation && (
                    <div className="text-xs text-blue-900 bg-blue-50 p-2.5 rounded border border-blue-200">
                      <strong>Recommendation:</strong> {r.recommendation}
                    </div>
                  )}

                  {r.isAddressed && r.resolutionNote && (
                    <div className="text-xs text-emerald-900 bg-emerald-50 p-2 rounded border border-emerald-200">
                      <strong>Resolution Note:</strong> {r.resolutionNote}
                    </div>
                  )}

                  {!r.isAddressed && (sop.createdById === user?.id || isAdmin) && !isFinalized && (
                    <div className="pt-2 text-right">
                      <button
                        onClick={() => handleResolveRemark(r.id)}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-800"
                      >
                        Mark as Addressed & Enter Resolution Note →
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Attachments */}
      {activeTab === 'attachments' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Controlled Attachments & Forms</h3>
              <p className="text-xs text-slate-500">Supporting forms, flowcharts, and technical sheets.</p>
            </div>
          </div>

          {!isFinalized && (
            <form onSubmit={handleFileUpload} className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                  className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <button
                type="submit"
                disabled={!selectedFile || uploadingFile}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow disabled:opacity-50"
              >
                {uploadingFile ? 'Uploading...' : 'Upload Attachment'}
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-100">
            {(!activeVersion.attachments || activeVersion.attachments.length === 0) ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No attachments uploaded for Version {activeVersion.versionNumber}.
              </div>
            ) : (
              activeVersion.attachments.map((att) => (
                <div key={att.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-slate-400" />
                    <div>
                      <span className="font-semibold text-slate-800 block">{att.fileName}</span>
                      <span className="text-[11px] text-slate-400">
                        {(att.fileSize / 1024).toFixed(1)} KB • Uploaded by {att.uploadedBy?.firstName} {att.uploadedBy?.lastName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <a
                      href={`/uploads/${att.filePath.split(/[\\/]/).pop()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                    {!isFinalized && (isAdmin || att.uploadedBy?.id === user?.id) && (
                      <button
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="text-rose-500 hover:text-rose-700"
                        title="Delete Attachment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 6: Revision History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-800">Revision History Log</h3>
            <p className="text-xs text-slate-500">Immutable audit log of all versions for {sop.sopNumber}.</p>
          </div>

          <div className="space-y-4">
            {sop.versions?.map((ver) => (
              <div
                key={ver.id}
                className={`p-4 rounded-xl border transition-all ${
                  ver.id === activeVersion.id
                    ? 'border-blue-400 bg-blue-50/30 ring-1 ring-blue-400'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900">
                      v{ver.versionNumber}
                    </span>
                    <SOPStatusBadge status={ver.status} />
                    {ver.id === activeVersion.id && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                        Currently Viewing
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400">
                    Created {format(new Date(ver.createdAt), 'MMM dd, yyyy')}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>
                    <strong>Reason for Revision:</strong> {ver.revisionReason || 'Initial Release (1.0)'}
                  </div>
                  {ver.changeSummary && (
                    <div>
                      <strong>Summary of Changes:</strong> {ver.changeSummary}
                    </div>
                  )}
                  {ver.finalizedAt && (
                    <div className="text-emerald-700 font-medium">
                      Finalized on {format(new Date(ver.finalizedAt), 'MMM dd, yyyy HH:mm')} by {ver.finalizedBy?.firstName} {ver.finalizedBy?.lastName}
                    </div>
                  )}
                </div>

                {ver.id !== activeVersion.id && (
                  <div className="mt-3 text-right">
                    <button
                      onClick={() => setActiveVersion(ver)}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Inspect This Version →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Record Meeting */}
      <Modal
        isOpen={showMeetingModal}
        onClose={() => setShowMeetingModal(false)}
        title="Record Inter-Department Review Meeting"
      >
        <form onSubmit={handleRecordMeeting} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Meeting Date *</label>
              <input
                type="date"
                required
                value={meetingForm.meetingDate}
                onChange={(e) => setMeetingForm({ ...meetingForm, meetingDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Meeting Mode *</label>
              <input
                type="text"
                required
                placeholder="In-Person / MS Teams"
                value={meetingForm.meetingMode}
                onChange={(e) => setMeetingForm({ ...meetingForm, meetingMode: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Attendees List *</label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Antonio Cruz (QC Head), Ramon De Leon (Warehouse Head), Maria Santos (Creator)"
              value={meetingForm.attendees}
              onChange={(e) => setMeetingForm({ ...meetingForm, attendees: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Minutes of Discussion *</label>
            <textarea
              required
              rows={4}
              placeholder="Record points raised during discussion..."
              value={meetingForm.minutesOfMeeting}
              onChange={(e) => setMeetingForm({ ...meetingForm, minutesOfMeeting: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Agreed Decisions & Actions *</label>
            <textarea
              required
              rows={3}
              placeholder="Record final agreements reached during meeting..."
              value={meetingForm.decisions}
              onChange={(e) => setMeetingForm({ ...meetingForm, decisions: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowMeetingModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
            >
              Save Meeting Minutes
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Submit Remark */}
      <Modal
        isOpen={showRemarkModal}
        onClose={() => setShowRemarkModal(false)}
        title="Submit Department Remark or Recommendation"
      >
        <form onSubmit={handleAddRemark} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Step or Section Reference</label>
            <input
              type="text"
              placeholder="e.g. Step 3.2 or Section 4"
              value={remarkForm.stepReference}
              onChange={(e) => setRemarkForm({ ...remarkForm, stepReference: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Remark / Comment *</label>
            <textarea
              required
              rows={4}
              placeholder="Enter your department's feedback or observation..."
              value={remarkForm.comment}
              onChange={(e) => setRemarkForm({ ...remarkForm, comment: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Recommended Action / Text (Optional)</label>
            <textarea
              rows={3}
              placeholder="Proposed wording or procedural change..."
              value={remarkForm.recommendation}
              onChange={(e) => setRemarkForm({ ...remarkForm, recommendation: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowRemarkModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
            >
              Submit Remark
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Formal Approval */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        title="Grant Formal Department Approval"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg">
            <strong className="block font-bold">Official Department Sign-Off</strong>
            You are approving on behalf of <strong>{user?.department?.name}</strong>.
            A cryptographic SHA-256 digital signature token will be generated and bound to this approval in the immutable audit trail.
          </div>

          <p className="text-slate-600">
            By clicking "Confirm Formal Approval", you certify that your department has reviewed the procedure, completed discussions, and accepts full operational compliance with this Standard Operating Procedure.
          </p>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setShowApproveModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow"
            >
              Confirm Formal Approval
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Request Changes / Rejection */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Request Changes or Reject Version"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg">
            <strong className="block font-bold">Mandatory Justification Required</strong>
            Requesting changes will return this procedure to the authoring team. You must enter a clear, specific justification.
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Reason & Requested Modifications *
            </label>
            <textarea
              required
              rows={5}
              placeholder="State exactly why this procedure cannot be approved in its current state and what specific changes are needed..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowRejectModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRejectOrRequestChanges}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
            >
              Submit Change Request
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Create New Revision */}
      <Modal
        isOpen={showRevisionModal}
        onClose={() => setShowRevisionModal(false)}
        title={`Initiate New Revision from v${activeVersion.versionNumber}`}
      >
        <form onSubmit={handleCreateRevision} className="space-y-4 text-xs">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg">
            <strong className="block font-bold">Controlled Document Lifecycle</strong>
            The current version ({activeVersion.versionNumber}) will remain frozen and accessible in the revision archive. A new draft (v{(Number(activeVersion.versionNumber) + 0.1).toFixed(1)}) will be created.
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Revision Reason *</label>
            <input
              type="text"
              required
              placeholder="e.g. Annual Periodic Review or Integration of Barcode Scanning"
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Summary of Proposed Changes</label>
            <textarea
              rows={4}
              placeholder="Brief description of updates made in this new revision..."
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowRevisionModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
            >
              Create Revision
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Edit Draft */}
      <Modal
        isOpen={showEditDraftModal}
        onClose={() => setShowEditDraftModal(false)}
        title="Edit Draft Content"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveDraft} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Procedure Title *</label>
            <input
              type="text"
              required
              value={draftForm.title}
              onChange={(e) => setDraftForm({ ...draftForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">1. Purpose *</label>
            <textarea
              required
              rows={3}
              value={draftForm.purpose}
              onChange={(e) => setDraftForm({ ...draftForm, purpose: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">2. Scope *</label>
            <textarea
              required
              rows={3}
              value={draftForm.scope}
              onChange={(e) => setDraftForm({ ...draftForm, scope: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">3. Responsibilities *</label>
            <textarea
              required
              rows={3}
              value={draftForm.responsibilities}
              onChange={(e) => setDraftForm({ ...draftForm, responsibilities: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">4. Step-by-Step Procedure *</label>
            <textarea
              required
              rows={8}
              value={draftForm.procedure}
              onChange={(e) => setDraftForm({ ...draftForm, procedure: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">5. Related Forms</label>
              <textarea
                rows={2}
                value={draftForm.relatedForms}
                onChange={(e) => setDraftForm({ ...draftForm, relatedForms: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">6. References</label>
              <textarea
                rows={2}
                value={draftForm.references}
                onChange={(e) => setDraftForm({ ...draftForm, references: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowEditDraftModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
            >
              Save Draft Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
