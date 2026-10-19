import React, { useState, useEffect, useRef } from 'react';
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
  FileCheck2,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Loader2,
  Eye,
  Check,
  Building2,
  Calendar,
  UserCheck,
} from 'lucide-react';

interface SOPDocumentViewerProps {
  version: SOPVersion;
  sopNumber: string;
  sopTitle: string;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onSignatureAdded?: (sig: SOPElectronicSignature) => void;
}

export const SOPDocumentViewer: React.FC<SOPDocumentViewerProps> = ({
  version,
  sopNumber,
  sopTitle,
  canEdit,
  onRefresh,
  onSignatureAdded,
}) => {
  const { user, isAdmin, isDeptHead } = useAuth();

  // Find primary attachment
  const primaryAttachment: SOPAttachment | undefined =
    version.attachments?.find((a) => a.id === version.primaryAttachmentId) ||
    version.attachments?.[0];

  // Viewer state
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [docLoading, setDocLoading] = useState<boolean>(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

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

  // Quick upload in viewer
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const fileName = primaryAttachment?.originalFilename || primaryAttachment?.fileName || '';
  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
  const isPdf = fileExt === 'pdf';
  const isDocx = fileExt === 'docx';
  const isDoc = fileExt === 'doc';
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(fileExt);

  // Render DOCX when active attachment is docx
  useEffect(() => {
    let isCancelled = false;

    async function loadDocx() {
      if (!isDocx || !primaryAttachment || !docxContainerRef.current) return;
      try {
        setDocLoading(true);
        setDocError(null);
        setDocxRendered(false);

        const res = await api.get(`/attachments/${primaryAttachment.id}/download`, {
          responseType: 'arraybuffer',
        });

        if (isCancelled || !docxContainerRef.current) return;

        docxContainerRef.current.innerHTML = '';
        await renderAsync(res.data, docxContainerRef.current, undefined, {
          className: 'docx-preview',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });

        if (!isCancelled) {
          setDocxRendered(true);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('Failed to render DOCX preview', err);
          setDocError('Unable to render Word preview in browser. Please download the file to view.');
        }
      } finally {
        if (!isCancelled) {
          setDocLoading(false);
        }
      }
    }

    if (isDocx && primaryAttachment) {
      loadDocx();
    }

    return () => {
      isCancelled = true;
    };
  }, [primaryAttachment?.id, isDocx]);

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
    const hash = version.documentHash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handlePrint = () => {
    if (isPdf && primaryAttachment) {
      const win = window.open(`/api/attachments/${primaryAttachment.id}/download?inline=true`, '_blank');
      win?.focus();
    } else {
      window.print();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingDoc(true);
      setUploadError(null);
      const formData = new FormData();
      formData.append('file', file);

      await api.post(`/attachments/versions/${version.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await onRefresh();
    } catch (err: any) {
      setUploadError(err.response?.data?.message || 'Failed to upload document file.');
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
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
      await onRefresh();
    } catch (err: any) {
      setRevokeError(err.response?.data?.message || 'Failed to revoke electronic signature.');
    } finally {
      setSubmittingRevoke(false);
    }
  };

  const signatures = version.signatures || [];
  const validSignatures = signatures.filter((s) => s.status === 'VALID');

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div
      ref={containerRef}
      className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none p-4 bg-slate-900' : 'p-6'
      }`}
    >
      {/* Top Header Bar: Document Metadata & Cryptographic Hash */}
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
                  : 'bg-slate-100 text-nkb-navy border-slate-300'
              }`}
            >
              {sopNumber} • v{version.versionNumber}
            </span>

            {/* Signature Status Badge */}
            {validSignatures.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {version.signatureStatus === 'FULLY_SIGNED'
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
          </div>

          <h2 className="text-base font-bold tracking-tight">{sopTitle}</h2>

          {primaryAttachment && (
            <div
              className={`flex items-center gap-3 text-xs mt-1 flex-wrap ${
                isFullscreen ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              <span className="font-medium text-slate-700 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                {primaryAttachment.originalFilename || primaryAttachment.fileName}
              </span>
              <span>•</span>
              <span>{formatFileSize(primaryAttachment.fileSize)}</span>
              <span>•</span>
              <span>Uploaded {format(new Date(primaryAttachment.createdAt), 'MMM dd, yyyy')}</span>
            </div>
          )}
        </div>

        {/* SHA-256 Digest Badge & Sign Button */}
        <div className="flex items-center gap-2 flex-wrap">
          {version.documentHash && (
            <button
              onClick={handleCopyHash}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border transition-colors ${
                isFullscreen
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title="Click to copy full SHA-256 cryptographic document checksum"
            >
              <Lock className="w-3 h-3 text-blue-500" />
              <span>SHA-256: {version.documentHash.slice(0, 10)}...{version.documentHash.slice(-6)}</span>
              {copiedHash ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          )}

          {/* Quick Sign Button in Header */}
          <button
            onClick={() => setIsSignModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Sign Document</span>
          </button>
        </div>
      </div>

      {/* Document Viewport Toolbar */}
      <div
        className={`py-2 px-3 my-3 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
          isFullscreen
            ? 'bg-slate-800 border-slate-700 text-slate-200'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] px-2 font-semibold">{zoomLevel}%</span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoomLevel(100)}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="Reset to 100%"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {primaryAttachment && (
            <>
              <a
                href={`/api/attachments/${primaryAttachment.id}/download`}
                download
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 font-semibold text-[11px] shadow-sm transition-colors"
                title="Download original file"
              >
                <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Download</span>
              </a>

              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 font-semibold text-[11px] shadow-sm transition-colors"
                title="Print Document"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                <span>Print</span>
              </button>
            </>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 transition-colors"
            title={isFullscreen ? 'Exit Full Screen' : 'Full Screen Preview'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Document Viewer Canvas */}
      <div
        className={`relative flex-1 min-h-[500px] border rounded-xl overflow-auto bg-slate-100 flex items-center justify-center p-4 ${
          isFullscreen ? 'h-[calc(100vh-280px)] border-slate-700' : 'h-[650px] border-slate-200'
        }`}
      >
        {/* State: No document uploaded yet */}
        {!primaryAttachment ? (
          <div className="text-center p-8 max-w-md space-y-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-inner">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">No Document Attached Yet</h3>
              <p className="text-xs text-slate-500 mt-1">
                Upload your official procedure document (<strong>.pdf</strong>, <strong>.docx</strong>, or images) to view the live preview and enable electronic signatures.
              </p>
            </div>

            {uploadError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                {uploadError}
              </div>
            )}

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                disabled={uploadingDoc}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingDoc}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {uploadingDoc ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading Document...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload Official Document</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : isPdf ? (
          /* PDF Viewer: Native Browser Embedding via iframe with inline=true */
          <div
            className="w-full h-full bg-white rounded-lg shadow-sm overflow-hidden"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          >
            <iframe
              src={`/api/attachments/${primaryAttachment.id}/download?inline=true#toolbar=1&navpanes=1`}
              title={primaryAttachment.originalFilename || 'SOP PDF Document'}
              className="w-full h-full border-none"
            />
          </div>
        ) : isDocx ? (
          /* DOCX Viewer: High Fidelity Browser Layout via docx-preview */
          <div className="w-full h-full overflow-auto flex justify-center">
            {docLoading && (
              <div className="flex flex-col items-center justify-center p-8 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                <span className="text-xs">Rendering Word Document...</span>
              </div>
            )}
            {docError && (
              <div className="text-center p-8 text-rose-600">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-xs">{docError}</p>
              </div>
            )}
            <div
              ref={docxContainerRef}
              className="bg-white shadow-md p-6 max-w-4xl w-full min-h-full rounded-lg docx-preview-container"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
            />
          </div>
        ) : isImage ? (
          /* Image Viewer with Zoom */
          <div className="w-full h-full flex items-center justify-center overflow-auto">
            <img
              src={`/api/attachments/${primaryAttachment.id}/download?inline=true`}
              alt={primaryAttachment.originalFilename || 'SOP Document Image'}
              className="max-w-none transition-transform duration-150 rounded shadow-md"
              style={{ width: `${zoomLevel}%` }}
            />
          </div>
        ) : (
          /* DOC or Other Binary format fallback */
          <div className="text-center p-8 bg-white rounded-xl shadow-sm border border-slate-200 max-w-md space-y-3">
            <FileText className="w-12 h-12 text-blue-600 mx-auto" />
            <h4 className="font-bold text-sm text-slate-800">
              {primaryAttachment.originalFilename || primaryAttachment.fileName}
            </h4>
            <p className="text-xs text-slate-500">
              In-browser preview is optimized for <strong>PDF</strong> and <strong>DOCX</strong> files. For legacy <code>.{fileExt}</code> documents, please download the file to inspect the complete formatting in Microsoft Word.
            </p>
            <a
              href={`/api/attachments/${primaryAttachment.id}/download`}
              download
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download & Open in Word</span>
            </a>
          </div>
        )}
      </div>

      {/* Electronic Signatures & Verification Certificate Section */}
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

          <button
            onClick={() => setIsSignModalOpen(true)}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Apply Signature</span>
          </button>
        </div>

        {validSignatures.length === 0 ? (
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
                  {/* Stamp decorative background watermark */}
                  <div className="absolute -right-3 -bottom-3 text-emerald-100/60 pointer-events-none">
                    <ShieldCheck className="w-24 h-24 stroke-1" />
                  </div>

                  <div>
                    {/* Header */}
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

                    {/* Visual Signature Stamp */}
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

                    {/* Signer Details */}
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

                  {/* Tamper Evidence Footer */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-mono">ID: {sig.id.slice(0, 8)}...</span>
                    {isAdmin && (
                      <button
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
      <SOPElectronicSignatureModal
        isOpen={isSignModalOpen}
        onClose={() => setIsSignModalOpen(false)}
        version={version}
        sopNumber={sopNumber}
        onSignatureComplete={async (newSig) => {
          onSignatureAdded?.(newSig);
          await onRefresh();
        }}
      />

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
