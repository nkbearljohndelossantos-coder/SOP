import React, { useState, useRef, useEffect } from 'react';
import { Modal } from './common/Modal';
import { SOPVersion, SOPElectronicSignature } from '../types';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  PenTool,
  Type,
  RotateCcw,
  ShieldCheck,
  Lock,
  AlertCircle,
  CheckCircle,
  FileText,
  Building2,
  KeyRound,
  Check,
} from 'lucide-react';

export interface PdfSignaturePlacement {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfAnnotation {
  id?: string;
  pageNumber: number;
  x: number;
  y: number;
  text: string;
  fontSize?: number;
}

interface SOPElectronicSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: SOPVersion;
  sopNumber: string;
  onSignatureComplete: (signature: SOPElectronicSignature) => void;
  defaultWorkflowStep?: string;
  targetDepartmentId?: string;
  placement?: PdfSignaturePlacement | null;
  annotations?: PdfAnnotation[] | null;
}

export const SOPElectronicSignatureModal: React.FC<SOPElectronicSignatureModalProps> = ({
  isOpen,
  onClose,
  version,
  sopNumber,
  onSignatureComplete,
  defaultWorkflowStep,
  targetDepartmentId,
  placement,
  annotations,
}) => {
  const { user, isAdmin } = useAuth();

  const [activeMethod, setActiveMethod] = useState<'DRAWN' | 'TYPED'>('DRAWN');
  const [typedName, setTypedName] = useState(user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim());
  const [password, setPassword] = useState('');
  const [workflowStep, setWorkflowStep] = useState(defaultWorkflowStep || 'DEPARTMENT_APPROVAL');
  const [selectedDeptId, setSelectedDeptId] = useState(targetDepartmentId || user?.departmentId || '');
  const [agreedToLegalDeclaration, setAgreedToLegalDeclaration] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnContent, setHasDrawnContent] = useState(false);
  const strokeHistoryRef = useRef<ImageData[]>([]);

  // Update defaults when modal opens
  useEffect(() => {
    if (isOpen) {
      setTypedName(user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim());
      setPassword('');
      setAgreedToLegalDeclaration(false);
      setError(null);
      setWorkflowStep(defaultWorkflowStep || 'DEPARTMENT_APPROVAL');
      if (targetDepartmentId) {
        setSelectedDeptId(targetDepartmentId);
      } else if (user?.departmentId) {
        setSelectedDeptId(user.departmentId);
      }
      setTimeout(() => initCanvas(), 50);
    }
  }, [isOpen, defaultWorkflowStep, targetDepartmentId, user]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.strokeStyle = '#0f172a'; // Slate-900
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawnContent(false);
    strokeHistoryRef.current = [];
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Save history for undo
    strokeHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    const { x, y } = getCanvasCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawnContent(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width * 2, rect.height * 2);
    setHasDrawnContent(false);
    strokeHistoryRef.current = [];
  };

  const undoStroke = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokeHistoryRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previousState = strokeHistoryRef.current.pop();
    if (previousState) {
      ctx.putImageData(previousState, 0, 0);
      if (strokeHistoryRef.current.length === 0) {
        setHasDrawnContent(false);
      }
    }
  };

  const getSignatureDataUrl = (): string | null => {
    if (activeMethod === 'DRAWN') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawnContent) return null;
      return canvas.toDataURL('image/png');
    } else {
      const trimmed = typedName.trim();
      return trimmed.length >= 2 ? trimmed : null;
    }
  };

  const defaultDeclaration = `I, ${user?.fullName || user?.firstName || 'User'}, hereby confirm that I have reviewed, verified, and electronically approve SOP ${sopNumber} (v${version.versionNumber}). Under electronic records and electronic signatures regulations (FDA 21 CFR Part 11 compliant), this digital record constitutes my legally binding electronic signature.`;

  const handleSubmitSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agreedToLegalDeclaration) {
      setError('You must accept the legal declaration acknowledgment before signing.');
      return;
    }

    const signatureData = getSignatureDataUrl();
    if (!signatureData) {
      setError(
        activeMethod === 'DRAWN'
          ? 'Please draw your handwritten signature on the signature pad.'
          : 'Please enter your legal name for the typed signature.'
      );
      return;
    }

    try {
      setSubmitting(true);
      const payload: any = {
        signatureMethod: activeMethod,
        signatureData,
        declarationText: defaultDeclaration,
        password: password.trim() ? password : undefined,
        departmentId: selectedDeptId || undefined,
        workflowStep,
      };

      if (placement) {
        payload.placement = {
          pageNumber: placement.pageNumber,
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        };
      }

      if (annotations && annotations.length > 0) {
        payload.annotations = annotations.map((a) => ({
          pageNumber: a.pageNumber,
          x: a.x,
          y: a.y,
          text: a.text,
          fontSize: a.fontSize,
        }));
      }

      const res = await api.post(`/workflow/versions/${version.id}/sign`, payload);

      if (res.data?.success) {
        onSignatureComplete(res.data.data.signature);
        onClose();
      } else {
        setError(res.data?.message || 'Failed to apply electronic signature.');
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0]?.message ||
          'Failed to record electronic signature. Please verify your credentials and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Apply Verified Electronic Signature"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmitSignature} className="space-y-5 text-xs text-slate-700">
        {/* Compliance Header Banner */}
        <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl flex items-start gap-3">
          <div className="p-2 bg-blue-600 text-white rounded-lg flex-shrink-0 mt-0.5 shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-blue-950 flex items-center gap-1.5">
              <span>21 CFR Part 11 Compliant Electronic Signature</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-200 text-blue-900 font-normal">
                SECURE SHA-256
              </span>
            </h4>
            <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
              Applying your signature securely binds your identity to <strong>{sopNumber}</strong> (v
              {version.versionNumber}) with cryptographic document hashing. Once signed, any subsequent
              tampering will invalidate this certificate.
            </p>
          </div>
        </div>

        {/* Embedded PDF Placement Details (if placed via PDF editor) */}
        {placement && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div>
                <span className="font-bold">Physical PDF Placement Configured:</span>{' '}
                <span>
                  Page <strong>{placement.pageNumber}</strong> at ({Math.round(placement.x * 100)}%, {Math.round(placement.y * 100)}%) • Size {Math.round(placement.width * 100)}% × {Math.round(placement.height * 100)}%
                </span>
                <p className="text-[10px] text-emerald-700 mt-0.5">
                  Signature stamp, signer identity, role, and compliance banner will be physically embedded into the PDF bytes.
                </p>
              </div>
            </div>
            {annotations && annotations.length > 0 && (
              <span className="text-[10px] bg-emerald-200/70 text-emerald-950 font-semibold px-2 py-0.5 rounded-full">
                +{annotations.length} Annotation{annotations.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {/* Workflow Role & Department Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Workflow Signing Step *</label>
            <select
              value={workflowStep}
              onChange={(e) => setWorkflowStep(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="AUTHOR_SIGN_OFF">Author Sign-Off (Prepared By)</option>
              <option value="DEPARTMENT_APPROVAL">Department Review & Sign-Off (Reviewed By)</option>
              <option value="FINAL_APPROVAL">Final Quality Approval (Approved By)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Signing on Behalf of Department</span>
            </label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {user?.department && (
                <option value={user.department.id}>
                  {user.department.name} ({user.department.code}) — Primary
                </option>
              )}
              {version.participants?.map((p) => (
                <option key={p.departmentId} value={p.departmentId}>
                  {p.department?.name || 'Department'} ({p.department?.code || ''})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Signature Input Mode Tabs */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-200 mb-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveMethod('DRAWN')}
                className={`py-2 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${
                  activeMethod === 'DRAWN'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Draw Signature</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMethod('TYPED')}
                className={`py-2 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${
                  activeMethod === 'TYPED'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Type Formal Signature</span>
              </button>
            </div>
            {activeMethod === 'DRAWN' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={undoStroke}
                  disabled={!hasDrawnContent}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-30 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={clearCanvas}
                  disabled={!hasDrawnContent}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-30"
                >
                  Clear Pad
                </button>
              </div>
            )}
          </div>

          {/* Draw Signature Canvas */}
          {activeMethod === 'DRAWN' ? (
            <div className="space-y-1.5">
              <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden shadow-inner touch-none">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-36 cursor-crosshair block"
                />
                {!hasDrawnContent && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-400">
                    <PenTool className="w-6 h-6 stroke-1 mb-1 text-slate-300" />
                    <span className="text-xs">Draw your handwritten signature here using mouse, trackpad, or stylus</span>
                  </div>
                )}
                <div className="absolute bottom-2 right-3 pointer-events-none text-[10px] text-slate-300 font-mono">
                  Sign Above the Line
                </div>
              </div>
            </div>
          ) : (
            /* Typed Signature with Cursive Calligraphy Typography */
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Legal Full Name *</label>
                <input
                  type="text"
                  required
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="e.g. Dr. Roberto Mendoza"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Live Script Typography Preview */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1 shadow-inner">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Signature Typography Preview
                </span>
                <div
                  className="text-3xl text-slate-900 py-3 italic tracking-wide"
                  style={{
                    fontFamily: "'Dancing Script', 'Brush Script MT', 'Great Vibes', 'Caveat', cursive, Georgia, serif",
                  }}
                >
                  {typedName || 'Your Signature'}
                </div>
                <div className="text-[10px] text-slate-400">
                  Digitally generated and verified under {user?.email || 'authenticated session'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Security Re-Authentication (Session Confirmation or Password) */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
          <label className="block font-semibold text-slate-800 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span>Account Re-Authentication (Optional / Recommended)</span>
            </span>
            <span className="text-[10px] font-normal text-slate-500">
              Session bound to: <strong>{user?.email}</strong>
            </span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your account password to re-authenticate (optional if session is active)"
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Legal Declaration Checkbox */}
        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={agreedToLegalDeclaration}
              onChange={(e) => setAgreedToLegalDeclaration(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="text-[11px] text-slate-800 leading-snug">
              <strong>Legal Attestation:</strong> {defaultDeclaration}
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !agreedToLegalDeclaration}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Signing & Timestamping...</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Affix Official Signature</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
