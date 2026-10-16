import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Department, ParticipationTypes, ParticipationType } from '../types';
import {
  SOPImportPreviewModal,
  DocumentImportResult,
  CurrentFormValues,
} from '../components/SOPImportPreviewModal';
import {
  FileText,
  Users,
  AlertCircle,
  ArrowLeft,
  UploadCloud,
  FileSpreadsheet,
  Image as ImageIcon,
  Paperclip,
  X,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Calendar,
} from 'lucide-react';

export const SOPCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const smartImportInputRef = useRef<HTMLInputElement | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
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
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [revisionReason, setRevisionReason] = useState('');

  // Smart Document Import State
  const [importingDoc, setImportingDoc] = useState(false);
  const [importResult, setImportResult] = useState<DocumentImportResult | null>(null);
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedSourceName, setImportedSourceName] = useState<string | null>(null);
  const [autoFilledKeys, setAutoFilledKeys] = useState<Record<string, boolean>>({});
  const [loadingNextNum, setLoadingNextNum] = useState(false);

  // File Upload State
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

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
            initMatrix[d.id] =
              d.id === initialDeptId
                ? ParticipationTypes.REQUIRED_APPROVER
                : ParticipationTypes.NOT_INVOLVED;
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

  const fetchNextSopNumberForDept = async (targetDeptId: string): Promise<string | null> => {
    if (!targetDeptId) return null;
    try {
      setLoadingNextNum(true);
      const res = await api.get(`/sops/next-number/${targetDeptId}`);
      const nextNum = res.data?.sopNumber || res.data?.nextNumber || null;
      return nextNum;
    } catch {
      return null;
    } finally {
      setLoadingNextNum(false);
    }
  };

  const handleGenerateNextSopNumberClick = async () => {
    const nextNum = await fetchNextSopNumberForDept(departmentId);
    if (nextNum) {
      setSopNumber(nextNum);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const runSmartDocumentExtraction = async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (ext !== '.docx' && ext !== '.pdf') {
      setError(
        `Smart Document Import supports Word (.docx) and PDF (.pdf) documents. "${file.name}" cannot be parsed for text extraction.`
      );
      return;
    }

    try {
      setImportingDoc(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/sops/import-document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success && res.data?.data) {
        setImportResult(res.data.data);
        setImportedFile(file);
        setIsImportModalOpen(true);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          `Failed to extract SOP content from "${file.name}". Please verify the file is a valid .docx or .pdf document.`
      );
    } finally {
      setImportingDoc(false);
    }
  };

  const handleFilesSelected = async (
    selectedFiles: FileList | File[],
    autoTriggerImport = true
  ) => {
    const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.xls', '.jpg', '.jpeg', '.png'];
    const newFiles: File[] = [];
    const maxSizeBytes = 25 * 1024 * 1024; // 25 MB

    for (const file of Array.from(selectedFiles)) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (ext === '.doc') {
        setError(
          `File "${file.name}" uses legacy binary .doc format. Please save as .docx or .pdf for secure upload and smart auto-fill.`
        );
        continue;
      }
      if (!allowedExtensions.includes(ext)) {
        setError(
          `File "${file.name}" has an unsupported format. Allowed: PDF, DOCX, XLSX, JPG, PNG.`
        );
        continue;
      }
      if (file.size > maxSizeBytes) {
        setError(`File "${file.name}" exceeds the 25 MB limit.`);
        continue;
      }
      if (!attachments.some((a) => a.name === file.name && a.size === file.size)) {
        newFiles.push(file);
      }
    }

    if (newFiles.length > 0) {
      setAttachments((prev) => [...prev, ...newFiles]);
      setError(null);

      // Automatically trigger Smart Import Preview if a .docx or .pdf was selected
      if (autoTriggerImport) {
        const importableFile = newFiles.find((f) => {
          const ext = '.' + f.name.split('.').pop()?.toLowerCase();
          return ext === '.docx' || ext === '.pdf';
        });
        if (importableFile) {
          await runSmartDocumentExtraction(importableFile);
        }
      }
    }
  };

  const handleApplyImportedFields = (applied: Partial<CurrentFormValues>) => {
    const updatedKeys: Record<string, boolean> = { ...autoFilledKeys };

    if (applied.departmentId) {
      handleOwnerChange(applied.departmentId);
      updatedKeys.departmentId = true;
    }
    if (applied.sopNumber !== undefined) {
      setSopNumber(applied.sopNumber);
      updatedKeys.sopNumber = true;
    }
    if (applied.title !== undefined) {
      setTitle(applied.title);
      updatedKeys.title = true;
    }
    if (applied.purpose !== undefined) {
      setPurpose(applied.purpose);
      updatedKeys.purpose = true;
    }
    if (applied.scope !== undefined) {
      setScope(applied.scope);
      updatedKeys.scope = true;
    }
    if (applied.responsibilities !== undefined) {
      setResponsibilities(applied.responsibilities);
      updatedKeys.responsibilities = true;
    }
    if (applied.procedure !== undefined) {
      setProcedure(applied.procedure);
      updatedKeys.procedure = true;
    }
    if (applied.relatedForms !== undefined) {
      setRelatedForms(applied.relatedForms);
      updatedKeys.relatedForms = true;
    }
    if (applied.references !== undefined) {
      setReferences(applied.references);
      updatedKeys.references = true;
    }
    if (applied.effectiveDate !== undefined) {
      setEffectiveDate(applied.effectiveDate);
      updatedKeys.effectiveDate = true;
    }
    if (applied.reviewDate !== undefined) {
      setReviewDate(applied.reviewDate);
      updatedKeys.reviewDate = true;
    }
    if (applied.revisionReason !== undefined) {
      setRevisionReason(applied.revisionReason);
      updatedKeys.revisionReason = true;
    }

    setAutoFilledKeys(updatedKeys);
    if (importResult?.fileName) {
      setImportedSourceName(importResult.fileName);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files, true);
    }
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sopNumber.trim() || !title.trim() || !departmentId) {
      setError('SOP Number, Title, and Owning Department are strictly required.');
      return;
    }

    const finalPurpose = purpose.trim();
    const finalScope = scope.trim();
    const finalResponsibilities = responsibilities.trim();
    const finalProcedure = procedure.trim();

    if (!finalPurpose || !finalScope || !finalResponsibilities || !finalProcedure) {
      setError(
        'Purpose, Scope, Responsibilities, and Procedure sections are required (minimum 10 characters each). Please review and complete any missing sections before saving.'
      );
      return;
    }

    if (
      finalPurpose.length < 10 ||
      finalScope.length < 10 ||
      finalResponsibilities.length < 10 ||
      finalProcedure.length < 10
    ) {
      setError(
        'Purpose, Scope, Responsibilities, and Procedure must each contain at least 10 characters.'
      );
      return;
    }

    // Build participants payload
    const participants = Object.entries(participantMatrix).map(([deptId, type]) => ({
      departmentId: deptId,
      participationType: type,
    }));

    // Ensure at least one REQUIRED_APPROVER
    const hasApprover = participants.some(
      (p) => p.participationType === ParticipationTypes.REQUIRED_APPROVER
    );
    if (!hasApprover) {
      setError(
        'At least one department (typically the owning department) must be assigned as REQUIRED_APPROVER.'
      );
      return;
    }

    setSubmitting(true);
    setUploadStatus('Creating SOP draft version 1.0...');

    try {
      const res = await api.post('/sops', {
        sopNumber: sopNumber.trim(),
        title: title.trim(),
        departmentId,
        ownerDeptId: departmentId,
        category: 'Standard Operating Procedure',
        purpose: finalPurpose,
        scope: finalScope,
        responsibilities: finalResponsibilities,
        procedure: finalProcedure,
        relatedForms: relatedForms.trim() || undefined,
        references: references.trim() || undefined,
        effectiveDate: effectiveDate || null,
        reviewDate: reviewDate || null,
        revisionReason: revisionReason.trim() || undefined,
        changeSummary: importedSourceName
          ? `Imported from source document: ${importedSourceName}`
          : undefined,
        participants,
      });

      const newSopId = res.data.sop?.id || res.data.data?.sop?.id || res.data.id;
      const newVersionId = res.data.version?.id || res.data.data?.version?.id;

      // Upload queued attachments if any (retaining the original imported DOCX/PDF as official source attachment)
      if (attachments.length > 0 && newVersionId) {
        setUploadStatus(
          `Uploading ${attachments.length} attached SOP file${attachments.length > 1 ? 's' : ''}...`
        );

        try {
          const formData = new FormData();
          attachments.forEach((file) => {
            formData.append('files', file);
          });
          await api.post(`/attachments/versions/${newVersionId}/batch`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          // Fallback to sequential uploads if batch route fails
          for (let i = 0; i < attachments.length; i++) {
            setUploadStatus(`Uploading file ${i + 1} of ${attachments.length}...`);
            const singleFormData = new FormData();
            singleFormData.append('file', attachments[i]);
            await api.post(`/attachments/versions/${newVersionId}`, singleFormData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          }
        }
      }

      navigate(`/sops/${newSopId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create Standard Operating Procedure.');
    } finally {
      setSubmitting(false);
      setUploadStatus(null);
    }
  };

  const renderAutoFilledBadge = (fieldKey: string) => {
    if (!autoFilledKeys[fieldKey]) return null;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <Sparkles className="w-2.5 h-2.5" />
        Auto-filled from document
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading organizational structure...</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              Author a new controlled procedure or import from an existing Word (.docx) or PDF file.
            </p>
          </div>
        </div>

        {/* Dedicated Quick Smart Import Button */}
        <div>
          <input
            ref={smartImportInputRef}
            type="file"
            accept=".docx,.pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFilesSelected(e.target.files, true);
                e.target.value = '';
              }
            }}
            className="hidden"
          />
          <button
            type="button"
            disabled={importingDoc}
            onClick={() => smartImportInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-60"
          >
            {importingDoc ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Analyzing Document...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Smart Import & Auto-Fill (.docx / .pdf)</span>
              </>
            )}
          </button>
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

      {importedSourceName && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              Form populated from <strong>{importedSourceName}</strong>. Please review and edit all fields before saving as a Draft.
            </span>
          </div>
          {importResult && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs font-bold text-emerald-800 hover:underline"
            >
              Re-open Import Preview →
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SOP File Upload & Smart Import Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-blue-600" />
                Smart Document Import & Controlled File Attachments
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a Word (<strong>.docx</strong>) or <strong>.pdf</strong> (digital or scanned) file to automatically extract and populate the SOP fields below, while preserving the original file as an official attachment.
              </p>
            </div>
            {attachments.length > 0 && (
              <span className="self-start sm:self-auto px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {attachments.length} file{attachments.length === 1 ? '' : 's'} queued
              </span>
            )}
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2.5 ${
              isDragging
                ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesSelected(e.target.files, true);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
            <div
              className={`p-3 rounded-full ${
                isDragging ? 'bg-blue-200 text-blue-700' : 'bg-blue-100 text-blue-600'
              }`}
            >
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">
                <span className="text-blue-600 hover:underline">Click to browse</span> or drag and drop your SOP document (.docx / .pdf) here
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Uploading a <strong className="text-slate-600">.docx</strong> or <strong className="text-slate-600">.pdf</strong> automatically opens the Smart Auto-Fill Preview (Up to 25 MB)
              </p>
            </div>
          </div>

          {/* Queued Attachments List */}
          {attachments.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                <span>Queued Source & Supporting Files ({attachments.length})</span>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                {attachments.map((file, idx) => {
                  const ext = file.name.split('.').pop()?.toLowerCase();
                  const isPdf = ext === 'pdf';
                  const isDocx = ext === 'docx';
                  const isExcel = ext === 'xlsx' || ext === 'xls';
                  const isImg = ext === 'png' || ext === 'jpg' || ext === 'jpeg';
                  const canSmartImport = isPdf || isDocx;

                  return (
                    <div
                      key={`${file.name}-${idx}`}
                      className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`p-2 rounded-lg flex-shrink-0 ${
                            isPdf
                              ? 'bg-rose-50 text-rose-600'
                              : isDocx
                              ? 'bg-blue-50 text-blue-600'
                              : isExcel
                              ? 'bg-emerald-50 text-emerald-600'
                              : isImg
                              ? 'bg-purple-50 text-purple-600'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isPdf || isDocx ? (
                            <FileText className="w-4 h-4" />
                          ) : isExcel ? (
                            <FileSpreadsheet className="w-4 h-4" />
                          ) : isImg ? (
                            <ImageIcon className="w-4 h-4" />
                          ) : (
                            <Paperclip className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {formatFileSize(file.size)} •{' '}
                            <span className="text-emerald-600 font-medium">
                              Retained as Official Source Attachment on Draft V1.0
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {canSmartImport && (
                          <button
                            type="button"
                            disabled={importingDoc}
                            onClick={() => runSmartDocumentExtraction(file)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              {importingDoc ? 'Extracting...' : 'Smart Extract & Auto-Fill'}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

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
                {renderAutoFilledBadge('departmentId')}
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
              <span className="text-[11px] text-slate-400 mt-1.5 block">
                Department originating this procedure
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 min-h-[26px]">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  SOP Number *
                </label>
                <div className="flex items-center gap-2">
                  {renderAutoFilledBadge('sopNumber')}
                  <button
                    type="button"
                    disabled={!departmentId || loadingNextNum}
                    onClick={handleGenerateNextSopNumberClick}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    title="Generate next sequential SOP number for the selected department"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingNextNum ? 'animate-spin' : ''}`} />
                    Auto-Number
                  </button>
                </div>
              </div>
              <input
                type="text"
                required
                value={sopNumber}
                onChange={(e) => setSopNumber(e.target.value)}
                placeholder="e.g. SOP-QAD-006 or SOP-WH-001"
                className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm"
              />
              <span className="text-[11px] text-slate-400 mt-1.5 block">
                Unique controlled document code (e.g. SOP-QAD-006)
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Procedure Title *
              </label>
              {renderAutoFilledBadge('title')}
            </div>
            <input
              type="text"
              required
              placeholder="e.g. GMP Inspection and Production Line GMP Monitoring"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Optional Document Control Dates & Revision Reason (Populated when present in imported SOP) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Effective Date
                </label>
                {renderAutoFilledBadge('effectiveDate')}
              </div>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Review Date
                </label>
                {renderAutoFilledBadge('reviewDate')}
              </div>
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Revision Reason / History Note
                </label>
                {renderAutoFilledBadge('revisionReason')}
              </div>
              <input
                type="text"
                placeholder="e.g. Initial Issue"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Document Content Sections */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Procedure Content (Version 1.0)
            </h2>
            <span className="text-[11px] text-slate-400">
              All fields remain editable before saving
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                1. Purpose *
              </label>
              {renderAutoFilledBadge('purpose')}
            </div>
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                2. Scope *
              </label>
              {renderAutoFilledBadge('scope')}
            </div>
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                3. Responsibilities *
              </label>
              {renderAutoFilledBadge('responsibilities')}
            </div>
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                4. Step-by-Step Procedure *
              </label>
              {renderAutoFilledBadge('procedure')}
            </div>
            <textarea
              required
              rows={10}
              placeholder="Detail each procedural step sequentially (Step 1, Step 2, Step 3...)"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  5. Related Forms & Records
                </label>
                {renderAutoFilledBadge('relatedForms')}
              </div>
              <textarea
                rows={3}
                placeholder="e.g. Form QC-012, Receiving Inspection Log"
                value={relatedForms}
                onChange={(e) => setRelatedForms(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  6. References & Standards
                </label>
                {renderAutoFilledBadge('references')}
              </div>
              <textarea
                rows={3}
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
              <span className="text-slate-600">
                Must formally approve current version before finalization can occur.
              </span>
            </div>
            <div>
              <span className="font-bold text-sky-700 block">REQUIRED REVIEWER</span>
              <span className="text-slate-600">
                Must review, attend discussions, and complete review signoff.
              </span>
            </div>
            <div>
              <span className="font-bold text-blue-700 block">CONSULTED</span>
              <span className="text-slate-600">
                Can provide remarks and recommendations, but can NEVER block finalization.
              </span>
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
                <div
                  key={dept.id}
                  className="p-3 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-800 block">
                      {dept.name}{' '}
                      <span className="font-mono text-slate-400 font-normal">({dept.code})</span>
                      {isOwner && (
                        <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-full">
                          Owning Department
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Head:{' '}
                      {dept.head ? `${dept.head.firstName} ${dept.head.lastName}` : 'Unassigned'}
                    </span>
                  </div>

                  <div className="flex-shrink-0">
                    <select
                      value={currentType}
                      onChange={(e) =>
                        handleMatrixChange(dept.id, e.target.value as ParticipationType)
                      }
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
                      <option value={ParticipationTypes.REQUIRED_APPROVER}>
                        REQUIRED APPROVER
                      </option>
                      <option value={ParticipationTypes.REQUIRED_REVIEWER}>
                        REQUIRED REVIEWER
                      </option>
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
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{uploadStatus || 'Creating Procedure...'}</span>
              </>
            ) : (
              <span>Create Draft Procedure</span>
            )}
          </button>
        </div>
      </form>

      {/* Smart Document Import Preview & Confirmation Modal */}
      <SOPImportPreviewModal
        isOpen={isImportModalOpen}
        importResult={importResult}
        uploadedFile={importedFile}
        currentValues={{
          sopNumber,
          title,
          departmentId,
          purpose,
          scope,
          responsibilities,
          procedure,
          relatedForms,
          references,
          effectiveDate,
          reviewDate,
          revisionReason,
        }}
        departments={departments}
        onClose={() => setIsImportModalOpen(false)}
        onApplyFields={handleApplyImportedFields}
        onRequestNextSopNumber={fetchNextSopNumberForDept}
        onNavigateToSop={(id) => navigate(`/sops/${id}`)}
      />
    </div>
  );
};
