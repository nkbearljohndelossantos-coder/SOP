import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  FileText,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Table as TableIcon,
  History,
  Download,
  FileCode,
  Layers,
} from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { Department } from '../types';

export type FieldConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
export type ExtractionMethod = 'DETERMINISTIC' | 'OCR' | 'HYBRID';

export interface ExtractedSOPFields {
  sopNumber: string | null;
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  category: string;
  purpose: string | null;
  scope: string | null;
  responsibilities: string | null;
  procedure: string | null;
  relatedForms: string | null;
  references: string | null;
  effectiveDate: string | null;
  reviewDate: string | null;
  issueDate: string | null;
  revisionNumber: string | null;
  revisionReason: string | null;
  changeSummary: string | null;
}

export interface RevisionHistoryEntry {
  serialNo: string;
  description: string;
  revision: string;
  date: string;
  section: string;
  author: string;
}

export interface DocumentImportResult {
  fileName: string;
  fileSize: number;
  fileType: 'DOCX' | 'PDF';
  pageCount: number;
  extractionMethod: ExtractionMethod;
  ocrConfidence: number | null;
  fields: ExtractedSOPFields;
  fieldConfidence: Record<keyof ExtractedSOPFields, FieldConfidence>;
  missingRequiredFields: string[];
  warnings: string[];
  uncertainTextFlags: string[];
  duplicateSop: {
    id: string;
    sopNumber: string;
    title: string;
    status: string;
  } | null;
  revisionHistory: RevisionHistoryEntry[];
  extraSections: {
    materialsAndEquipment: string | null;
    definitions: string | null;
  };
  tablesExtracted: number;
  sourcePreviewText: string;
}

export interface CurrentFormValues {
  sopNumber?: string;
  title: string;
  departmentId?: string;
  purpose: string;
  scope: string;
  responsibilities: string;
  procedure: string;
  relatedForms: string;
  references: string;
  effectiveDate?: string;
  reviewDate?: string;
  revisionReason?: string;
}

interface SOPImportPreviewModalProps {
  isOpen: boolean;
  importResult: DocumentImportResult | null;
  uploadedFile?: File | null;
  currentValues: CurrentFormValues;
  departments: Department[];
  isDraftEditMode?: boolean;
  onClose: () => void;
  onApplyFields: (applied: Partial<CurrentFormValues>) => void;
  onRequestNextSopNumber?: (deptId: string) => Promise<string | null>;
  onNavigateToSop?: (sopId: string) => void;
}

type MappableFieldKey = keyof CurrentFormValues;

export const SOPImportPreviewModal: React.FC<SOPImportPreviewModalProps> = ({
  isOpen,
  importResult,
  uploadedFile = null,
  currentValues,
  departments,
  isDraftEditMode = false,
  onClose,
  onApplyFields,
  onRequestNextSopNumber,
  onNavigateToSop,
}) => {
  const [selectedFields, setSelectedFields] = useState<Record<MappableFieldKey, boolean>>({
    sopNumber: false,
    title: false,
    departmentId: false,
    purpose: false,
    scope: false,
    responsibilities: false,
    procedure: false,
    relatedForms: false,
    references: false,
    effectiveDate: false,
    reviewDate: false,
    revisionReason: false,
  });

  const [editableFields, setEditableFields] = useState<CurrentFormValues>({
    sopNumber: '',
    title: '',
    departmentId: '',
    purpose: '',
    scope: '',
    responsibilities: '',
    procedure: '',
    relatedForms: '',
    references: '',
    effectiveDate: '',
    reviewDate: '',
    revisionReason: '',
  });

  const [activeTab, setActiveTab] = useState<'fields' | 'preview'>('fields');
  const [previewMode, setPreviewMode] = useState<'formatted' | 'raw'>('formatted');
  const [confirmOverwriteExisting, setConfirmOverwriteExisting] = useState(false);
  const [generatingAutoNumber, setGeneratingAutoNumber] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [docxRendering, setDocxRendering] = useState(false);
  const [docxRenderError, setDocxRenderError] = useState<string | null>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  // Manage object URL for original PDF preview
  useEffect(() => {
    if (uploadedFile) {
      const url = URL.createObjectURL(uploadedFile);
      setPdfBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPdfBlobUrl(null);
    }
  }, [uploadedFile]);

  // Render formatted DOCX layout into DOM container when Preview tab is active
  useEffect(() => {
    if (
      activeTab === 'preview' &&
      previewMode === 'formatted' &&
      importResult?.fileType === 'DOCX' &&
      uploadedFile &&
      docxContainerRef.current
    ) {
      let isMounted = true;
      setDocxRendering(true);
      setDocxRenderError(null);

      uploadedFile
        .arrayBuffer()
        .then(async (arrayBuffer) => {
          if (!isMounted || !docxContainerRef.current) return;
          docxContainerRef.current.innerHTML = '';
          await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
            className: 'docx',
            inWrapper: false,
            ignoreWidth: false,
            ignoreHeight: true,
            breakPages: true,
            renderHeaders: true,
            renderFooters: true,
          });
        })
        .catch((err) => {
          console.error('Docx render error:', err);
          if (isMounted) {
            setDocxRenderError(
              'Could not render full DOCX visual layout. You can still inspect the extracted text and download the original file.'
            );
          }
        })
        .finally(() => {
          if (isMounted) setDocxRendering(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [activeTab, previewMode, importResult?.fileType, uploadedFile]);

  useEffect(() => {
    if (!importResult) return;
    const f = importResult.fields;

    const nextEditable: CurrentFormValues = {
      sopNumber: f.sopNumber || '',
      title: f.title || '',
      departmentId: f.departmentId || '',
      purpose: f.purpose || '',
      scope: f.scope || '',
      responsibilities: f.responsibilities || '',
      procedure: f.procedure || '',
      relatedForms: f.relatedForms || '',
      references: f.references || '',
      effectiveDate: f.effectiveDate || '',
      reviewDate: f.reviewDate || '',
      revisionReason: f.revisionReason || '',
    };
    setEditableFields(nextEditable);

    // By default, select fields that were extracted AND do not overwrite existing non-empty form fields unless empty
    const hasExisting = (key: MappableFieldKey): boolean => {
      if (key === 'departmentId') return false; // department always has default selection on create page
      const cur = (currentValues[key] || '').trim();
      return cur.length > 0;
    };

    setSelectedFields({
      sopNumber: !isDraftEditMode && Boolean(f.sopNumber) && !hasExisting('sopNumber'),
      title: Boolean(f.title) && !hasExisting('title'),
      departmentId: !isDraftEditMode && Boolean(f.departmentId),
      purpose: Boolean(f.purpose) && !hasExisting('purpose'),
      scope: Boolean(f.scope) && !hasExisting('scope'),
      responsibilities: Boolean(f.responsibilities) && !hasExisting('responsibilities'),
      procedure: Boolean(f.procedure) && !hasExisting('procedure'),
      relatedForms: Boolean(f.relatedForms) && !hasExisting('relatedForms'),
      references: Boolean(f.references) && !hasExisting('references'),
      effectiveDate: Boolean(f.effectiveDate) && !hasExisting('effectiveDate'),
      reviewDate: Boolean(f.reviewDate) && !hasExisting('reviewDate'),
      revisionReason: Boolean(f.revisionReason) && !hasExisting('revisionReason'),
    });

    setConfirmOverwriteExisting(false);
  }, [importResult, currentValues, isDraftEditMode]);

  if (!isOpen || !importResult) return null;

  const handleToggleOverwriteAll = (checked: boolean) => {
    setConfirmOverwriteExisting(checked);
    const f = importResult.fields;
    if (checked) {
      setSelectedFields({
        sopNumber: !isDraftEditMode && Boolean(editableFields.sopNumber || f.sopNumber),
        title: Boolean(editableFields.title || f.title),
        departmentId: !isDraftEditMode && Boolean(editableFields.departmentId || f.departmentId),
        purpose: Boolean(editableFields.purpose || f.purpose),
        scope: Boolean(editableFields.scope || f.scope),
        responsibilities: Boolean(editableFields.responsibilities || f.responsibilities),
        procedure: Boolean(editableFields.procedure || f.procedure),
        relatedForms: Boolean(editableFields.relatedForms || f.relatedForms),
        references: Boolean(editableFields.references || f.references),
        effectiveDate: Boolean(editableFields.effectiveDate || f.effectiveDate),
        reviewDate: Boolean(editableFields.reviewDate || f.reviewDate),
        revisionReason: Boolean(editableFields.revisionReason || f.revisionReason),
      });
    }
  };

  const handleUseNextSopNumber = async () => {
    const targetDeptId =
      editableFields.departmentId || importResult.fields.departmentId || currentValues.departmentId;
    if (!targetDeptId || !onRequestNextSopNumber) return;

    try {
      setGeneratingAutoNumber(true);
      const nextNum = await onRequestNextSopNumber(targetDeptId);
      if (nextNum) {
        setEditableFields((prev) => ({ ...prev, sopNumber: nextNum }));
        setSelectedFields((prev) => ({ ...prev, sopNumber: true }));
      }
    } finally {
      setGeneratingAutoNumber(false);
    }
  };

  const renderConfidenceBadge = (conf: FieldConfidence) => {
    switch (conf) {
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            High Confidence
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3" />
            Medium Confidence
          </span>
        );
      case 'LOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3" />
            Low Confidence (Verify)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
            Not Found in Document
          </span>
        );
    }
  };

  const fieldDefinitions: Array<{
    key: MappableFieldKey;
    label: string;
    required?: boolean;
    multiline?: boolean;
    rows?: number;
    hideInDraftEdit?: boolean;
    type?: 'text' | 'date' | 'department';
  }> = [
    { key: 'sopNumber', label: 'SOP Document Number', required: true, hideInDraftEdit: true, type: 'text' },
    { key: 'departmentId', label: 'Owning Department', required: true, hideInDraftEdit: true, type: 'department' },
    { key: 'title', label: 'Procedure Title', required: true, type: 'text' },
    { key: 'effectiveDate', label: 'Effective Date (From Document)', type: 'date' },
    { key: 'reviewDate', label: 'Review Date (From Document)', type: 'date' },
    { key: 'revisionReason', label: 'Revision Reason / Document History', type: 'text' },
  ];

  const visibleFields = fieldDefinitions.filter(
    (def) => !(isDraftEditMode && def.hideInDraftEdit)
  );

  // Check if any non-empty existing field is about to be overwritten
  const fieldsOverwritingExisting = visibleFields.filter((def) => {
    if (def.key === 'departmentId') return false;
    const currentVal = (currentValues[def.key] || '').trim();
    const extractedVal = (editableFields[def.key] || '').trim();
    return (
      selectedFields[def.key] &&
      currentVal.length > 0 &&
      extractedVal.length > 0 &&
      currentVal !== extractedVal
    );
  });

  const handleConfirmApply = () => {
    const payload: Partial<CurrentFormValues> = {};
    for (const def of visibleFields) {
      if (selectedFields[def.key]) {
        const val = editableFields[def.key];
        if (val !== undefined && val !== null) {
          payload[def.key] = val;
        }
      }
    }
    onApplyFields(payload);
    onClose();
  };

  const selectedCount = visibleFields.filter((d) => selectedFields[d.key]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
                Smart SOP Document Import & Auto-Fill
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase rounded bg-blue-500/30 text-blue-200 border border-blue-400/30">
                  {importResult.fileType}
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Source: <span className="font-semibold text-white">{importResult.fileName}</span> • Inspect the formatted original document or review extracted fields.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher Tabs: View A (Editable Form) vs View B (Original Document Preview) */}
        <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('fields')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'fields'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>View A: Extracted Fields & Form Auto-Fill</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  activeTab === 'fields'
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {selectedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'preview'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View B: Original Formatted Document</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'preview'
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {importResult.fileType}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {uploadedFile && (
              <a
                href={pdfBlobUrl || undefined}
                download={uploadedFile.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm"
                title="Download original file"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Download Original File</span>
              </a>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          {activeTab === 'preview' ? (
            /* View B: Original Formatted Document Preview */
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <span className="font-bold text-slate-800">
                    {importResult.fileType === 'DOCX' ? 'Microsoft Word Document' : 'PDF Document'}:
                  </span>
                  <span className="text-slate-600">{importResult.fileName}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500">{(importResult.fileSize / 1024).toFixed(1)} KB</span>
                  {importResult.pageCount > 0 && (
                    <>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{importResult.pageCount} Page{importResult.pageCount === 1 ? '' : 's'}</span>
                    </>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {importResult.fileType === 'DOCX'
                      ? 'Format Engine Active: Fonts, Tables, Borders & Margins Preserved'
                      : 'Native PDF Engine Active: Exact Page Geometry & Styling Preserved'}
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('formatted')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                      previewMode === 'formatted'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Formatted Layout
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('raw')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                      previewMode === 'raw'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Raw Extracted Text
                  </button>
                </div>
              </div>

              {previewMode === 'formatted' ? (
                importResult.fileType === 'DOCX' ? (
                  <div className="bg-slate-200/80 p-4 sm:p-6 rounded-xl overflow-auto max-h-[64vh] border border-slate-300">
                    {docxRendering && (
                      <div className="py-16 text-center space-y-3">
                        <span className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs font-semibold text-slate-600">
                          Rendering formatted Microsoft Word layout with tables, borders, and margins...
                        </p>
                      </div>
                    )}
                    {docxRenderError && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 mb-4">
                        <p className="font-semibold">{docxRenderError}</p>
                      </div>
                    )}
                    <div
                      ref={docxContainerRef}
                      className="docx-preview-container shadow-xl mx-auto min-h-[300px]"
                    />
                  </div>
                ) : (
                  <div className="bg-slate-100 rounded-xl overflow-hidden border border-slate-300 shadow-inner">
                    {pdfBlobUrl ? (
                      <iframe
                        src={`${pdfBlobUrl}#toolbar=1&navpanes=1`}
                        title="Original PDF Document"
                        className="w-full h-[64vh] border-0"
                      />
                    ) : (
                      <div className="py-16 text-center text-xs text-slate-500">
                        PDF preview is loading or unavailable. Use the Download button above to inspect the file.
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-600">
                    Verbatim text and table tokens extracted by the document parsing engine:
                  </div>
                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-auto max-h-[60vh] leading-relaxed whitespace-pre-wrap selection:bg-blue-600">
                    {importResult.sourcePreviewText || 'No source text available.'}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            /* View A: Extracted Fields & Form Auto-Fill */
            <>
              {/* Extraction Summary Bar */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  {importResult.extractionMethod === 'OCR' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                      OCR Scanned Document ({importResult.ocrConfidence ?? 0}% Confidence)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      Deterministic Structure Extraction
                    </span>
                  )}

                  {importResult.tablesExtracted > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      <TableIcon className="w-3.5 h-3.5 text-slate-500" />
                      {importResult.tablesExtracted} Table{importResult.tablesExtracted === 1 ? '' : 's'} Parsed
                    </span>
                  )}

                  <span className="text-slate-500">
                    Original file is preserved and will be attached to Version 1.0.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  Inspect Original Document
                </button>
              </div>

          {/* Duplicate SOP Warning Banner */}
          {importResult.duplicateSop && !isDraftEditMode && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2.5">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <p className="font-bold text-sm text-amber-900">
                    Existing SOP Number Detected: {importResult.duplicateSop.sopNumber}
                  </p>
                  <p className="text-amber-800">
                    An SOP with code <strong>{importResult.duplicateSop.sopNumber}</strong> (&ldquo;{importResult.duplicateSop.title}&rdquo;, Status: <strong>{importResult.duplicateSop.status}</strong>) already exists in the database. You can open the existing SOP or generate the next available sequence number for this new draft.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-7">
                {onNavigateToSop && (
                  <button
                    type="button"
                    onClick={() => onNavigateToSop(importResult.duplicateSop!.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Existing SOP ({importResult.duplicateSop.sopNumber})
                  </button>
                )}
                {onRequestNextSopNumber && (
                  <button
                    type="button"
                    disabled={generatingAutoNumber}
                    onClick={handleUseNextSopNumber}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold hover:bg-amber-800 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generatingAutoNumber ? 'animate-spin' : ''}`} />
                    Use Next Available SOP Number
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Extraction Warnings & Missing Required Fields */}
          {importResult.warnings.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Extraction Notes & Verification Warnings ({importResult.warnings.length})
              </div>
              <ul className="list-disc list-inside space-y-1 text-amber-800">
                {importResult.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Extracted Revision History Table (if found) */}
          {importResult.revisionHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <History className="w-4 h-4 text-blue-600" />
                Document Revision History Detected in Source ({importResult.revisionHistory.length} row
                {importResult.revisionHistory.length === 1 ? '' : 's'})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-left">
                      <th className="py-1.5 px-2 font-semibold">S/No</th>
                      <th className="py-1.5 px-2 font-semibold">Reason / Description</th>
                      <th className="py-1.5 px-2 font-semibold">Rev</th>
                      <th className="py-1.5 px-2 font-semibold">Date</th>
                      <th className="py-1.5 px-2 font-semibold">Section</th>
                      <th className="py-1.5 px-2 font-semibold">Author</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importResult.revisionHistory.map((row, i) => (
                      <tr key={i} className="text-slate-700">
                        <td className="py-1.5 px-2 font-mono">{row.serialNo}</td>
                        <td className="py-1.5 px-2 font-medium">{row.description}</td>
                        <td className="py-1.5 px-2 font-mono">{row.revision}</td>
                        <td className="py-1.5 px-2">{row.date}</td>
                        <td className="py-1.5 px-2">{row.section}</td>
                        <td className="py-1.5 px-2">{row.author}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Overwrite Confirmation Toggle if form already has content */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white px-4 py-3 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-700">
              <span className="font-bold">Select Fields to Auto-Fill</span>
              <span className="text-slate-500 ml-2">
                You can edit any extracted value below before applying it to the SOP form.
              </span>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmOverwriteExisting}
                onChange={(e) => handleToggleOverwriteAll(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Select all extracted fields (including overwriting non-empty fields)</span>
            </label>
          </div>

          {/* Field Mapping Cards */}
          <div className="space-y-3">
            {visibleFields.map((def) => {
              const conf =
                importResult.fieldConfidence[def.key as keyof ExtractedSOPFields] || 'MISSING';
              const val = editableFields[def.key] || '';
              const existingVal = (currentValues[def.key] || '').trim();
              const willOverwrite =
                def.key !== 'departmentId' &&
                existingVal.length > 0 &&
                val.trim().length > 0 &&
                existingVal !== val.trim();

              return (
                <div
                  key={def.key}
                  className={`bg-white rounded-xl border p-4 transition-colors ${
                    selectedFields[def.key]
                      ? 'border-blue-300 ring-1 ring-blue-100'
                      : 'border-slate-200 opacity-85'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label className="inline-flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedFields[def.key])}
                        onChange={(e) =>
                          setSelectedFields((prev) => ({
                            ...prev,
                            [def.key]: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        {def.label}
                        {def.required && <span className="text-rose-500 ml-0.5">*</span>}
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      {willOverwrite && selectedFields[def.key] && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                          Replaces current form value
                        </span>
                      )}
                      {renderConfidenceBadge(conf)}
                    </div>
                  </div>

                  {def.type === 'department' ? (
                    <select
                      value={val}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setEditableFields((prev) => ({ ...prev, departmentId: newVal }));
                        if (newVal) {
                          setSelectedFields((prev) => ({ ...prev, departmentId: true }));
                        }
                      }}
                      className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="">-- Select Owning Department --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  ) : def.type === 'date' ? (
                    <input
                      type="date"
                      value={val}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setEditableFields((prev) => ({ ...prev, [def.key]: newVal }));
                        setSelectedFields((prev) => ({
                          ...prev,
                          [def.key]: Boolean(newVal),
                        }));
                      }}
                      className="w-full sm:w-64 h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  ) : def.multiline ? (
                    <textarea
                      rows={def.rows || 3}
                      value={val}
                      placeholder={`Not detected in uploaded document — you can enter ${def.label} here or after applying...`}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setEditableFields((prev) => ({ ...prev, [def.key]: newVal }));
                        if (newVal.trim().length > 0 && !selectedFields[def.key]) {
                          setSelectedFields((prev) => ({ ...prev, [def.key]: true }));
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed"
                    />
                  ) : (
                    <input
                      type="text"
                      value={val}
                      placeholder={`Not detected in uploaded document...`}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setEditableFields((prev) => ({ ...prev, [def.key]: newVal }));
                        if (newVal.trim().length > 0 && !selectedFields[def.key]) {
                          setSelectedFields((prev) => ({ ...prev, [def.key]: true }));
                        }
                      }}
                      className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {fieldsOverwritingExisting.length > 0 ? (
              <span className="text-amber-700 font-semibold">
                Note: Applying will overwrite {fieldsOverwritingExisting.length} existing non-empty form field
                {fieldsOverwritingExisting.length === 1 ? '' : 's'}.
              </span>
            ) : (
              <span>
                <strong>{selectedCount}</strong> field{selectedCount === 1 ? '' : 's'} selected to populate into the SOP form.
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel Import
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handleConfirmApply}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Apply {selectedCount} Selected Field{selectedCount === 1 ? '' : 's'} to Form
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
