import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Department, ParticipationTypes, ParticipationType } from '../types';
import {
  SOPImportPreviewModal,
  DocumentImportResult,
  CurrentFormValues,
  ExtractedSOPFields,
} from '../components/SOPImportPreviewModal';
import { SOPDocumentViewer, StagedDocumentInfo } from '../components/SOPDocumentViewer';
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
  Eye,
} from 'lucide-react';

export const SOPCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  // Primary Procedure Document & Staged Preview State
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [stagedDoc, setStagedDoc] = useState<StagedDocumentInfo | null>(null);
  const [stagedDocUploadStatus, setStagedDocUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [stagedDocError, setStagedDocError] = useState<string | null>(null);

  // Smart Document Import State
  const [importingDoc, setImportingDoc] = useState(false);
  const [importResult, setImportResult] = useState<DocumentImportResult | null>(null);
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedSourceName, setImportedSourceName] = useState<string | null>(null);
  const [autoFilledKeys, setAutoFilledKeys] = useState<Record<string, boolean>>({});
  const [loadingNextNum, setLoadingNextNum] = useState(false);

  // Supporting File Attachments State
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

  useEffect(() => {
    if (!loading && searchParams.get('import') === 'true') {
      const timer = setTimeout(() => {
        smartImportInputRef.current?.click();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [loading, searchParams]);

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
        const importData: DocumentImportResult = res.data.data;
        setImportResult(importData);
        setImportedFile(file);

        // Immediately populate form fields with extracted values
        const ext = importData.fields || ({} as Partial<ExtractedSOPFields>);
        handleApplyImportedFields({
          departmentId: ext.departmentId || undefined,
          sopNumber: ext.sopNumber || undefined,
          title: ext.title || undefined,
          purpose: ext.purpose || undefined,
          scope: ext.scope || undefined,
          responsibilities: ext.responsibilities || undefined,
          procedure: ext.procedure || undefined,
          relatedForms: ext.relatedForms || undefined,
          references: ext.references || undefined,
          effectiveDate: ext.effectiveDate ? ext.effectiveDate.slice(0, 10) : undefined,
          reviewDate: ext.reviewDate ? ext.reviewDate.slice(0, 10) : undefined,
          revisionReason: ext.revisionReason || undefined,
        });

        setImportedSourceName(file.name);
        setIsImportModalOpen(false);
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

  const stagePrimaryDocument = async (file: File) => {
    try {
      setStagedDocUploadStatus('uploading');
      setStagedDocError(null);
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/attachments/stage', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success && res.data?.data) {
        setStagedDoc(res.data.data);
        setStagedDocUploadStatus('success');
      }
    } catch (err: any) {
      console.error('Failed to stage document on server:', err);
      setStagedDocUploadStatus('error');
      setStagedDocError(
        err.response?.data?.message || 'Server upload failed. You can retry uploading the document.'
      );
    }
  };

  const handleFilesSelected = async (
    selectedFiles: FileList | File[],
    autoTriggerImport = true
  ) => {
    const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.webp'];
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
          `File "${file.name}" has an unsupported format. Allowed: PDF, DOCX, XLSX, JPG, PNG, WEBP.`
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

      // Select first eligible procedure document as primary preview file if none selected
      const procedureCandidate = newFiles.find((f) => {
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        return ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp'].includes(ext);
      });

      const chosenFile = procedureCandidate || newFiles[0];
      if (!primaryFile) {
        setPrimaryFile(chosenFile);
        stagePrimaryDocument(chosenFile);
      }

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
        purpose: purpose.trim() || undefined,
        scope: scope.trim() || undefined,
        responsibilities: responsibilities.trim() || undefined,
        procedure: procedure.trim() || undefined,
        relatedForms: relatedForms.trim() || undefined,
        references: references.trim() || undefined,
        effectiveDate: effectiveDate || null,
        reviewDate: reviewDate || null,
        revisionReason: revisionReason.trim() || undefined,
        changeSummary: importedSourceName
          ? `Imported from source document: ${importedSourceName}`
          : undefined,
        stagedAttachmentIds: stagedDoc ? [stagedDoc.id] : undefined,
        participants,
      });

      const newSopId = res.data.sop?.id || res.data.data?.sop?.id || res.data.id;
      const newVersionId = res.data.version?.id || res.data.data?.version?.id;

      // Upload remaining queued attachments if any (excluding the primary document already committed via staging)
      const remainingAttachments = stagedDoc
        ? attachments.filter((a) => a !== primaryFile && a.name !== stagedDoc.originalFilename)
        : attachments;

      if (remainingAttachments.length > 0 && newVersionId) {
        setUploadStatus(
          `Uploading ${remainingAttachments.length} additional attached SOP file${remainingAttachments.length > 1 ? 's' : ''}...`
        );

        try {
          const formData = new FormData();
          remainingAttachments.forEach((file) => {
            formData.append('files', file);
          });
          await api.post(`/attachments/versions/${newVersionId}/batch`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          // Fallback to sequential uploads if batch route fails
          for (let i = 0; i < remainingAttachments.length; i++) {
            setUploadStatus(`Uploading file ${i + 1} of ${remainingAttachments.length}...`);
            const singleFormData = new FormData();
            singleFormData.append('file', remainingAttachments[i]);
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
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <span className="font-bold text-sm block text-emerald-950">
                Pumasok na agad ang laman ng &quot;{importedSourceName}&quot; sa form!
              </span>
              <span className="text-emerald-800">
                Awtomatikong na-fill ang mga fields sa ibaba mula sa dokumento. Pwede mo itong baguhin o i-preview ang orihinal na format.
              </span>
            </div>
          </div>
          {importResult && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-emerald-100 text-emerald-900 font-bold rounded-lg border border-emerald-300 shadow-sm text-xs transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-700" />
              <span>Preview Original Document / Format</span>
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
        {/* SOP Controlled Procedure Document & Real-Time Preview */}
        <div className="space-y-4">
          <SOPDocumentViewer
            sopNumber={sopNumber || 'SOP-DRAFT'}
            sopTitle={title || 'New Procedure Document'}
            localFile={primaryFile}
            stagedDocument={stagedDoc}
            uploadStatus={stagedDocUploadStatus}
            uploadErrorMessage={stagedDocError}
            onFileSelect={(file) => {
              handleFilesSelected([file], true);
            }}
            onRetryUpload={() => {
              if (primaryFile) {
                stagePrimaryDocument(primaryFile);
              }
            }}
            onRemoveDocument={() => {
              setPrimaryFile(null);
              setStagedDoc(null);
              setStagedDocUploadStatus('idle');
              setStagedDocError(null);
              setAttachments((prev) => prev.filter((f) => f !== primaryFile));
            }}
            isUnsavedDraft={true}
          />

          {/* Supplementary Supporting Attachments */}
          {attachments.filter((a) => a !== primaryFile).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-blue-600" />
                <span>Additional Supporting Files ({attachments.filter((a) => a !== primaryFile).length})</span>
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                {attachments
                  .filter((a) => a !== primaryFile)
                  .map((file, idx) => {
                    const ext = file.name.split('.').pop()?.toLowerCase();
                    const isExcel = ext === 'xlsx' || ext === 'xls';
                    const isImg = ['png', 'jpg', 'jpeg', 'webp'].includes(ext || '');

                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-2 bg-slate-100 text-slate-600 rounded-lg flex-shrink-0">
                            {isExcel ? (
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                            ) : isImg ? (
                              <ImageIcon className="w-4 h-4 text-purple-600" />
                            ) : (
                              <Paperclip className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{file.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {formatFileSize(file.size)} • Supplementary Supporting File
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setPrimaryFile(file);
                              stagePrimaryDocument(file);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                          >
                            Set as Primary Document
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAttachments((prev) => prev.filter((a) => a !== file));
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
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

        {/* Optional Explanatory Notes / Abstract */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Explanatory Notes / Abstract (Optional)
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Optional administrative overview or remarks to accompany the official document attachment.
            </p>
          </div>
          <textarea
            rows={3}
            placeholder="Optional overview or administrative summary for this procedure..."
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
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
