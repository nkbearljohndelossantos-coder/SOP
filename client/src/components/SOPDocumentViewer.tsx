import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SOPVersion, SOPAttachment, SOPElectronicSignature } from '../types';
import { useAuth } from '../context/AuthContext';
import { SOPElectronicSignatureModal } from './SOPElectronicSignatureModal';
import { Modal } from './common/Modal';
import api from '../services/api';
import { renderAsync } from 'docx-preview';
import { format } from 'date-fns';
import {
  FileText,
  Download,
  Printer,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldCheck,
  Lock,
  CheckCircle,
  AlertCircle,
  Copy,
  PenTool,
  UploadCloud,
  Loader2,
  Check,
  Calendar,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Image as ImageIcon,
  Paperclip,
  X,
} from 'lucide-react';

export interface StagedDocumentInfo {
  id: string;
  originalFilename: string;
  storedFilename?: string;
  mimeType: string;
  fileSize: number;
  documentHash: string;
  downloadUrl: string;
  isStaged?: boolean;
}

export interface SOPDocumentViewerProps {
  version?: SOPVersion | null;
  sopNumber?: string;
  sopTitle?: string;
  canEdit?: boolean;
  onRefresh?: () => Promise<void>;
  onSignatureAdded?: (sig: SOPElectronicSignature) => void;

  // Staged / local preview props for SOPCreatePage or unsaved drafts
  localFile?: File | null;
  stagedDocument?: StagedDocumentInfo | null;
  uploadStatus?: 'idle' | 'uploading' | 'success' | 'error';
  uploadErrorMessage?: string | null;
  onFileSelect?: (file: File) => void;
  onRetryUpload?: () => void;
  onRemoveDocument?: () => void;
  isUnsavedDraft?: boolean;
}

export const SOPDocumentViewer: React.FC<SOPDocumentViewerProps> = ({
  version,
  sopNumber = 'SOP-NEW',
  sopTitle = 'Controlled Document Procedure',
  canEdit = true,
  onRefresh,
  onSignatureAdded,
  localFile,
  stagedDocument,
  uploadStatus = 'idle',
  uploadErrorMessage,
  onFileSelect,
  onRetryUpload,
  onRemoveDocument,
  isUnsavedDraft = false,
}) => {
  const { user, isAdmin } = useAuth();

  // Find primary attachment from persisted version if available
  const primaryAttachment: SOPAttachment | undefined =
    version?.attachments?.find((a) => a.id === version.primaryAttachmentId) ||
    version?.attachments?.[0];

  // Document metadata resolution
  const fileName =
    localFile?.name ||
    stagedDocument?.originalFilename ||
    primaryAttachment?.originalFilename ||
    primaryAttachment?.fileName ||
    '';

  const fileSize =
    localFile?.size ??
    stagedDocument?.fileSize ??
    primaryAttachment?.fileSize ??
    0;

  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
  const isPdf = fileExt === 'pdf';
  const isDocx = fileExt === 'docx';
  const isDoc = fileExt === 'doc';
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(fileExt);
  const isUnsupported = Boolean(fileName && !isPdf && !isDocx && !isImage);
  const hasDocument = Boolean(localFile || stagedDocument || primaryAttachment);

  // Document hash resolution
  const documentHash =
    version?.documentHash ||
    stagedDocument?.documentHash ||
    null;

  // Viewer state
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [docLoading, setDocLoading] = useState<boolean>(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  // Object URLs for PDF and Images (cleaned up on unmount or change)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // DOCX specific state
  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  const [docxRendered, setDocxRendered] = useState<boolean>(false);

  // Signing modal
  const [isSignModalOpen, setIsSignModalOpen] = useState<boolean>(false);

  // Revoke signature modal
  const [revokingSignature, setRevokingSignature] = useState<SOPElectronicSignature | null>(null);
  const [revokeReason, setRevokeReason] = useState<string>('');
  const [submittingRevoke, setSubmittingRevoke] = useState<boolean>(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Local file input ref for dropzone
  const internalFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [internalUploading, setInternalUploading] = useState<boolean>(false);
  const [internalUploadError, setInternalUploadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. PDF Object URL Resolution & Rendering
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function preparePdf() {
      if (!isPdf || !hasDocument) {
        setPdfUrl(null);
        return;
      }

      setDocLoading(true);
      setDocError(null);

      try {
        if (localFile) {
          createdUrl = URL.createObjectURL(localFile);
          if (active) {
            setPdfUrl(createdUrl);
            setDocLoading(false);
          }
          return;
        }

        const downloadPath = stagedDocument?.downloadUrl || (primaryAttachment ? `/attachments/${primaryAttachment.id}/download?inline=true` : null);
        if (!downloadPath) {
          throw new Error('No PDF source attachment available.');
        }

        const res = await api.get(downloadPath, { responseType: 'blob' });
        if (!active) return;

        createdUrl = URL.createObjectURL(res.data);
        setPdfUrl(createdUrl);
      } catch (err: any) {
        if (!active) return;
        console.error('Failed to prepare PDF preview:', err);
        setDocError(err.response?.data?.message || 'Failed to load PDF preview. Please check network connection or retry.');
      } finally {
        if (active) {
          setDocLoading(false);
        }
      }
    }

    preparePdf();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [isPdf, hasDocument, localFile, stagedDocument?.id, stagedDocument?.downloadUrl, primaryAttachment?.id]);

  // 2. DOCX Rendering via docx-preview
  const renderDocxDocument = useCallback(async () => {
    if (!isDocx || !hasDocument) return;

    setDocLoading(true);
    setDocError(null);
    setDocxRendered(false);

    try {
      let arrayBuffer: ArrayBuffer;

      if (localFile) {
        arrayBuffer = await localFile.arrayBuffer();
      } else {
        const downloadPath = stagedDocument?.downloadUrl || (primaryAttachment ? `/attachments/${primaryAttachment.id}/download` : null);
        if (!downloadPath) throw new Error('No DOCX source attachment available.');

        const res = await api.get(downloadPath, { responseType: 'arraybuffer' });
        arrayBuffer = res.data;
      }

      if (!docxContainerRef.current) {
        // Wait briefly if DOM ref is mounting
        await new Promise((r) => setTimeout(r, 100));
      }

      if (docxContainerRef.current) {
        docxContainerRef.current.innerHTML = '';
        await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
          className: 'docx-preview',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });
        setDocxRendered(true);
      }
    } catch (err: any) {
      console.error('Failed to render DOCX preview:', err);
      setDocError('Unable to render Word layout in browser. The document can still be downloaded and viewed in Microsoft Word.');
    } finally {
      setDocLoading(false);
    }
  }, [isDocx, hasDocument, localFile, stagedDocument?.downloadUrl, primaryAttachment?.id]);

  useEffect(() => {
    if (isDocx && hasDocument) {
      renderDocxDocument();
    }
  }, [isDocx, hasDocument, renderDocxDocument]);

  // 3. Image Object URL Resolution
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function prepareImage() {
      if (!isImage || !hasDocument) {
        setImageUrl(null);
        return;
      }

      setDocLoading(true);
      setDocError(null);

      try {
        if (localFile) {
          createdUrl = URL.createObjectURL(localFile);
          if (active) {
            setImageUrl(createdUrl);
            setDocLoading(false);
          }
          return;
        }

        const downloadPath = stagedDocument?.downloadUrl || (primaryAttachment ? `/attachments/${primaryAttachment.id}/download?inline=true` : null);
        if (!downloadPath) throw new Error('No image attachment source available.');

        const res = await api.get(downloadPath, { responseType: 'blob' });
        if (!active) return;

        createdUrl = URL.createObjectURL(res.data);
        setImageUrl(createdUrl);
      } catch (err: any) {
        if (!active) return;
        console.error('Failed to prepare Image preview:', err);
        setDocError('Failed to load image preview.');
      } finally {
        if (active) {
          setDocLoading(false);
        }
      }
    }

    prepareImage();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [isImage, hasDocument, localFile, stagedDocument?.downloadUrl, primaryAttachment?.id]);

  // Fullscreen controls
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleCopyHash = () => {
    if (!documentHash) return;
    navigator.clipboard.writeText(documentHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handlePrint = () => {
    if (isPdf && pdfUrl) {
      const win = window.open(pdfUrl, '_blank');
      win?.focus();
    } else {
      window.print();
    }
  };

  const handleDownload = () => {
    if (localFile) {
      const url = URL.createObjectURL(localFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = localFile.name;
      a.click();
      URL.revokeObjectURL(url);
    } else if (stagedDocument?.downloadUrl) {
      window.open(stagedDocument.downloadUrl, '_blank');
    } else if (primaryAttachment?.id) {
      window.open(`/api/attachments/${primaryAttachment.id}/download`, '_blank');
    }
  };

  // Drag and Drop handlers for file selection
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
      handleFilesSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFilesSelected = async (file: File) => {
    if (onFileSelect) {
      onFileSelect(file);
      return;
    }

    // Fallback if rendered on SOPDetailPage without onFileSelect
    if (version?.id) {
      try {
        setInternalUploading(true);
        setInternalUploadError(null);
        const formData = new FormData();
        formData.append('file', file);

        await api.post(`/attachments/versions/${version.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (onRefresh) {
          await onRefresh();
        }
      } catch (err: any) {
        setInternalUploadError(err.response?.data?.message || 'Failed to upload document file.');
      } finally {
        setInternalUploading(false);
      }
    }
  };

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokingSignature) return;

    try {
      setSubmittingRevoke(true);
      setRevokeError(null);

      await api.post(`/workflow/signatures/${revokingSignature.id}/revoke`, {
        reason: revokeReason,
      });

      setRevokingSignature(null);
      setRevokeReason('');
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      setRevokeError(err.response?.data?.message || 'Failed to revoke electronic signature.');
    } finally {
      setSubmittingRevoke(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const signatures = version?.signatures || [];
  const validSignatures = signatures.filter((s) => s.status === 'VALID');

  const isUploading = uploadStatus === 'uploading' || internalUploading;
  const currentUploadError = uploadErrorMessage || internalUploadError;

  return (
    <div
      ref={containerRef}
      className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none p-4 bg-slate-900' : 'p-6'
      }`}
    >
      {/* Top Header Bar: Document Title, Metadata & Cryptographic Hash */}
      <div
        className={`pb-4 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          isFullscreen ? 'border-slate-700 text-white' : 'border-slate-100 text-slate-800'
        }`}
      >
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                isFullscreen
                  ? 'bg-slate-800 text-blue-300 border-slate-700'
                  : 'bg-slate-100 text-blue-900 border-slate-300'
              }`}
            >
              {sopNumber} {version?.versionNumber ? `• v${version.versionNumber}` : '• Draft v1.0'}
            </span>

            {/* Workflow / Signature Status Badge */}
            {isUnsavedDraft ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Live Pre-Save Preview</span>
              </span>
            ) : validSignatures.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {version?.signatureStatus === 'FULLY_SIGNED'
                    ? 'Fully Electronically Signed'
                    : `Partially Signed (${validSignatures.length} sign-off${validSignatures.length === 1 ? '' : 's'})`}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Pending Electronic Signatures</span>
              </span>
            )}

            {/* Upload Status Indicators (Section 5) */}
            {isUploading && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-300 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                <span>Uploading to server storage...</span>
              </span>
            )}

            {(uploadStatus === 'success' || (hasDocument && !isUploading && !currentUploadError)) && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Document Verified</span>
              </span>
            )}
          </div>

          <h2 className="text-base font-bold tracking-tight">{sopTitle}</h2>

          {hasDocument && (
            <div
              className={`flex items-center gap-3 text-xs mt-1 flex-wrap ${
                isFullscreen ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              <span className="font-medium text-slate-700 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                {fileName}
              </span>
              <span>•</span>
              <span>{formatFileSize(fileSize)}</span>
              {primaryAttachment?.createdAt && (
                <>
                  <span>•</span>
                  <span>Uploaded {format(new Date(primaryAttachment.createdAt), 'MMM dd, yyyy')}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Action Toolbar: Document Hash & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {documentHash && (
            <button
              onClick={handleCopyHash}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border transition-colors ${
                isFullscreen
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title="Click to copy cryptographic SHA-256 document checksum"
            >
              <Lock className="w-3 h-3 text-blue-500" />
              <span>SHA-256: {documentHash.slice(0, 10)}...{documentHash.slice(-6)}</span>
              {copiedHash ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          )}

          {/* Quick Sign Button in Header (Only when valid persisted document is present) */}
          {version?.id && hasDocument && !isUnsavedDraft && (
            <button
              onClick={() => setIsSignModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Sign Document</span>
            </button>
          )}

          {/* Remove / Replace Document Button (if editable) */}
          {canEdit && hasDocument && onRemoveDocument && (
            <button
              type="button"
              onClick={onRemoveDocument}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
              title="Remove document to select another"
            >
              <X className="w-3.5 h-3.5" />
              <span>Replace Document</span>
            </button>
          )}
        </div>
      </div>

      {/* Upload Error Banner & Retry Button (Section 5) */}
      {currentUploadError && (
        <div className="my-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{currentUploadError}</span>
          </div>
          {onRetryUpload && (
            <button
              type="button"
              onClick={onRetryUpload}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 font-bold rounded-lg transition-colors text-xs"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry Upload</span>
            </button>
          )}
        </div>
      )}

      {/* Viewport Toolbar Controls (Zoom, Reset, Print, Download, Fullscreen) */}
      {hasDocument && (
        <div
          className={`py-2 px-3 my-3 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
            isFullscreen
              ? 'bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono text-[11px] px-2 font-semibold">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Reset to 100%"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 font-semibold text-[11px] shadow-sm transition-colors"
              title="Download original file"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Download</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 font-semibold text-[11px] shadow-sm transition-colors"
              title="Print Document"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 transition-colors"
              title={isFullscreen ? 'Exit Full Screen' : 'Full Screen Preview'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Main Document Viewer Canvas */}
      <div
        className={`relative flex-1 min-h-[500px] border rounded-xl overflow-auto bg-slate-100 flex items-center justify-center p-4 ${
          isFullscreen ? 'h-[calc(100vh-280px)] border-slate-700' : 'h-[650px] border-slate-200'
        }`}
      >
        {/* State 1: No document selected */}
        {!hasDocument ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`text-center p-8 max-w-md w-full border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
              isDragging
                ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'
            }`}
            onClick={() => internalFileInputRef.current?.click()}
          >
            <div className="p-4 bg-blue-50 text-blue-600 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-inner mb-3">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Document Selected</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Upload your official procedure document (<strong>.pdf</strong>, <strong>.docx</strong>, or images).
              The preview will immediately appear below with zoom and pagination controls.
            </p>

            <input
              ref={internalFileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesSelected(e.target.files[0]);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />

            <button
              type="button"
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Select Procedure Document (.pdf / .docx)</span>
            </button>
          </div>
        ) : docLoading ? (
          /* State 5: Preview Loading */
          <div className="flex flex-col items-center justify-center p-8 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs font-semibold">
              Preparing {isPdf ? 'PDF' : isDocx ? 'Word (.docx)' : 'Document'} Preview...
            </span>
          </div>
        ) : docError ? (
          /* State 6: Preview Failed — show actual error and retry option */
          <div className="text-center p-8 max-w-md bg-white rounded-xl shadow-sm border border-rose-200 space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h4 className="font-bold text-sm text-slate-800">Preview Could Not Be Rendered</h4>
            <p className="text-xs text-rose-600">{docError}</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (isDocx) renderDocxDocument();
                  else if (isPdf) setZoomLevel((z) => z);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-300 rounded-lg text-xs font-bold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Preview</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </button>
            </div>
          </div>
        ) : isPdf && pdfUrl ? (
          /* PDF Viewer: Embedded Native PDF Viewer with Page Navigation & Zoom */
          <div
            className="w-full h-full bg-white rounded-lg shadow-sm overflow-hidden flex flex-col"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          >
            <iframe
              src={`${pdfUrl}#toolbar=1&navpanes=1`}
              title={fileName || 'SOP PDF Document'}
              className="w-full h-full border-none"
            />
          </div>
        ) : isDocx ? (
          /* DOCX Viewer: High Fidelity Layout via docx-preview */
          <div className="w-full h-full overflow-auto flex justify-center">
            <div
              ref={docxContainerRef}
              className="bg-white shadow-md p-6 max-w-4xl w-full min-h-full rounded-lg docx-preview-container"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
            />
          </div>
        ) : isImage && imageUrl ? (
          /* Image Viewer with Zoom Controls */
          <div className="w-full h-full flex items-center justify-center overflow-auto">
            <img
              src={imageUrl}
              alt={fileName || 'SOP Document Image'}
              className="max-w-none transition-transform duration-150 rounded shadow-md object-contain"
              style={{ width: `${zoomLevel}%` }}
            />
          </div>
        ) : isDoc ? (
          /* Legacy Binary DOC Fallback */
          <div className="text-center p-8 bg-white rounded-xl shadow-sm border border-slate-200 max-w-md space-y-3">
            <FileText className="w-12 h-12 text-blue-600 mx-auto" />
            <h4 className="font-bold text-sm text-slate-800">{fileName}</h4>
            <p className="text-xs text-slate-500">
              This document uses the legacy binary <code>.doc</code> format. For real-time in-browser rendering,
              please save and upload as modern <strong>.docx</strong> or <strong>.pdf</strong>.
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download & Open in Microsoft Word</span>
            </button>
          </div>
        ) : isUnsupported ? (
          /* Unsupported Formats (.xlsx, etc.) */
          <div className="text-center p-8 bg-white rounded-xl shadow-sm border border-slate-200 max-w-md space-y-3">
            <FileSpreadsheet className="w-12 h-12 text-emerald-600 mx-auto" />
            <h4 className="font-bold text-sm text-slate-800">{fileName}</h4>
            <p className="text-xs text-slate-500">
              In-browser preview is optimized for <strong>PDF</strong>, <strong>DOCX</strong>, and image files.
              Spreadsheets and tabular attachments can be downloaded and opened in Excel.
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download Spreadsheet ({formatFileSize(fileSize)})</span>
            </button>
          </div>
        ) : (
          <div className="text-center p-8 text-slate-500 text-xs">
            Preparing document preview...
          </div>
        )}
      </div>

      {/* Electronic Signatures & Verification Certificate Section (Section 6) */}
      <div className={`mt-6 pt-5 border-t ${isFullscreen ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Official Electronic Signatures & Audit Certificates</span>
              <span className="text-[11px] font-normal text-slate-500">
                (21 CFR Part 11 Compliant Digital Records)
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified legal signatures affixed to this document version. Cryptographically linked to SHA-256 hash at signing time.
            </p>
          </div>

          {/* Sign Document Button: Available only on valid persisted versions */}
          {version?.id && hasDocument && !isUnsavedDraft ? (
            <button
              onClick={() => setIsSignModalOpen(true)}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Apply Signature</span>
            </button>
          ) : (
            <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
              Signatures Enabled After Draft Creation
            </span>
          )}
        </div>

        {/* Section 6 Rule: Do not allow signing on unsaved drafts or missing documents */}
        {isUnsavedDraft || !version?.id ? (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-800 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500" />
              <span>Electronic Signatures Locked (Pre-Save Draft)</span>
            </div>
            <p className="leading-relaxed">
              Official electronic signatures under 21 CFR Part 11 require an immutable, persisted document version registered in the controlled approval workflow.
              Once you click <strong>Create Draft Procedure</strong>, this document will be registered with its verified SHA-256 hash and made available for authorized departmental signatures.
            </p>
          </div>
        ) : !hasDocument ? (
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Electronic signing is disabled until an official procedure document is attached to this version.</span>
          </div>
        ) : validSignatures.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500 space-y-1">
            <Lock className="w-5 h-5 text-slate-400 mx-auto mb-1 stroke-1" />
            <p className="font-semibold text-slate-700">No electronic signatures applied yet.</p>
            <p className="text-[11px] text-slate-400">
              Authorized authors, department heads, and QC approvers can apply their binding signature above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {validSignatures.map((sig) => {
              const isDrawn = sig.signatureMethod === 'DRAWN';
              return (
                <div
                  key={sig.id}
                  className="bg-white rounded-xl border border-emerald-200/80 shadow-sm p-4 relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="absolute -right-3 -bottom-3 text-emerald-100/60 pointer-events-none">
                    <ShieldCheck className="w-24 h-24 stroke-1" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                        {sig.workflowStep === 'AUTHOR_SIGN_OFF'
                          ? 'Prepared & Authored By'
                          : sig.workflowStep === 'FINAL_APPROVAL'
                          ? 'Final Quality Approval'
                          : 'Reviewed & Approved By'}
                      </span>
                      <span className="text-[10px] font-mono font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        <span>VALID</span>
                      </span>
                    </div>

                    <div className="py-2 px-1 border-b border-slate-100 mb-2 flex items-center justify-center min-h-[64px] bg-slate-50/50 rounded-lg">
                      {isDrawn ? (
                        <img
                          src={sig.signatureData}
                          alt={`Signature of ${sig.signerName}`}
                          className="max-h-14 object-contain"
                        />
                      ) : (
                        <span
                          className="text-2xl text-slate-900 italic tracking-wide"
                          style={{
                            fontFamily:
                              "'Dancing Script', 'Brush Script MT', 'Great Vibes', 'Caveat', cursive, Georgia, serif",
                          }}
                        >
                          {sig.signatureData}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="font-bold text-slate-900">{sig.signerName}</div>
                      <div className="text-[11px] text-slate-500">
                        {sig.signerRole} {sig.signerDepartment ? `• ${sig.signerDepartment}` : ''}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{format(new Date(sig.signedAt), 'MMM dd, yyyy HH:mm:ss')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-mono">ID: {sig.id.slice(0, 8)}...</span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setRevokingSignature(sig);
                          setRevokeReason('');
                          setRevokeError(null);
                        }}
                        className="text-rose-600 hover:text-rose-700 font-semibold"
                        title="Revoke this electronic signature"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Signature Modal */}
      {version && (
        <SOPElectronicSignatureModal
          isOpen={isSignModalOpen}
          onClose={() => setIsSignModalOpen(false)}
          version={version}
          sopNumber={sopNumber}
          onSignatureComplete={async (newSig) => {
            onSignatureAdded?.(newSig);
            if (onRefresh) {
              await onRefresh();
            }
          }}
        />
      )}

      {/* Admin Revoke Signature Modal */}
      <Modal
        isOpen={Boolean(revokingSignature)}
        onClose={() => setRevokingSignature(null)}
        title="Revoke Electronic Signature"
      >
        <form onSubmit={handleRevokeSubmit} className="space-y-4 text-xs">
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Regulatory Audit Notice</strong>
              Revoking a signature permanently marks this sign-off certificate as REVOKED in the tamper-evident audit trail.
            </div>
          </div>

          {revokeError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
              {revokeError}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Mandatory Reason for Revocation *
            </label>
            <textarea
              required
              rows={4}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g. Inadvertent sign-off prior to updated calibration appendix or regulatory changes requested..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submittingRevoke}
              onClick={() => setRevokingSignature(null)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingRevoke || revokeReason.trim().length < 5}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50"
            >
              {submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
