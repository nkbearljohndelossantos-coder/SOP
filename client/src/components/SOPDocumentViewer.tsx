import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SOPVersion, SOPAttachment, SOPElectronicSignature } from '../types';
import { useAuth } from '../context/AuthContext';
import { SOPElectronicSignatureModal } from './SOPElectronicSignatureModal';
import { Modal } from './common/Modal';
import api from '../services/api';
import { renderAsync } from 'docx-preview';
import { format } from 'date-fns';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
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
  Scan,
  Layout,
  ExternalLink,
  Move,
  Edit3,
  MousePointer,
  Type,
  Save,
  Plus,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Info,
} from 'lucide-react';
import { PdfSignaturePlacement, PdfAnnotation } from './SOPElectronicSignatureModal';

// Configure PDF.js worker
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
}

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

/**
 * In-Editor Modal to Draw Signatures with Digital Stylus / Mouse
 */
interface InlineDrawingPadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  initialData?: string | null;
}

const InlineDrawingPadModal: React.FC<InlineDrawingPadModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => initCanvas(), 50);
    }
  }, [isOpen, initialData]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1e3a8a';

    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasContent(false);

    if (initialData && initialData.startsWith('data:image/')) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasContent(true);
      };
      img.src = initialData;
    }
  };

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasContent(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasContent(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-4 h-4 text-blue-400" />
            <h3 className="font-bold text-sm">Draw Electronic Signature</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-600 mb-3">
            Draw your signature using your mouse, trackpad, or digital stylus. This image will appear on the document stamp and be embedded into the physical PDF.
          </p>

          <div className="relative border-2 border-dashed border-blue-400/80 rounded-xl bg-slate-50/50 overflow-hidden shadow-inner h-48 cursor-crosshair">
            <canvas
              ref={canvasRef}
              className="w-full h-full touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasContent && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs">
                <span>Sign here using your mouse or stylus</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={clearCanvas}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Drawing</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!hasContent}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply to Document</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Dedicated Multi-Page PDF Canvas Page Component with Real-Time Interactive Editor
 * Supports drag & drop signature positioning, resizing, and text/date annotations.
 */
interface PdfPageItemProps {
  pdfDoc: any;
  pageNum: number;
  zoomLevel: number;
  isEditorMode: boolean;
  activeTool: 'pointer' | 'signature' | 'text' | 'date';
  signaturePlacement: PdfSignaturePlacement | null;
  onUpdateSignaturePlacement: (placement: PdfSignaturePlacement | null) => void;
  annotations: PdfAnnotation[];
  onAddAnnotation: (ann: PdfAnnotation) => void;
  onUpdateAnnotation: (id: string, updates: Partial<PdfAnnotation>) => void;
  onRemoveAnnotation: (id: string) => void;
  signatureMethod: 'DRAWN' | 'TYPED';
  drawnImageData: string | null;
  typedSignerName: string;
  onOpenDrawModal?: () => void;
  signerName?: string;
  signerRole?: string;
  signerDept?: string;
}

const PdfPageItem: React.FC<PdfPageItemProps> = ({
  pdfDoc,
  pageNum,
  zoomLevel,
  isEditorMode,
  activeTool,
  signaturePlacement,
  onUpdateSignaturePlacement,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  signatureMethod,
  drawnImageData,
  typedSignerName,
  onOpenDrawModal,
  signerName,
  signerRole,
  signerDept,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageWrapperRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const [rendering, setRendering] = useState(true);
  const [isDraggingBox, setIsDraggingBox] = useState(false);

  const isSigOnThisPage = signaturePlacement?.pageNumber === pageNum;

  useEffect(() => {
    let active = true;

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      try {
        setRendering(true);
        const page = await pdfDoc.getPage(pageNum);
        if (!active) return;

        // Base multiplier of 1.5 ensures crisp high-DPI text and table rendering
        const dpr = window.devicePixelRatio || 1;
        const scale = (zoomLevel / 100) * 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width / 1.5)}px`;
        canvas.style.height = `${Math.floor(viewport.height / 1.5)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
        if (active) setRendering(false);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering PDF page ${pageNum}:`, err);
        }
      }
    }

    renderPage();

    return () => {
      active = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, pageNum, zoomLevel]);

  // Page click: Place signature or create text / date annotation
  const handlePageClick = (e: React.MouseEvent) => {
    if (!isEditorMode || !pageWrapperRef.current) return;
    const rect = pageWrapperRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    if (activeTool === 'signature') {
      const width = signaturePlacement?.width || 0.44;
      const height = signaturePlacement?.height || 0.14;
      const newX = Math.max(0, Math.min(1 - width, clickX - width / 2));
      const newY = Math.max(0, Math.min(1 - height, clickY - height / 2));

      onUpdateSignaturePlacement({
        pageNumber: pageNum,
        x: Math.round(newX * 1000) / 1000,
        y: Math.round(newY * 1000) / 1000,
        width,
        height,
      });
    } else if (activeTool === 'text') {
      onAddAnnotation({
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        pageNumber: pageNum,
        x: Math.round(Math.max(0, Math.min(0.85, clickX)) * 1000) / 1000,
        y: Math.round(Math.max(0, Math.min(0.95, clickY)) * 1000) / 1000,
        text: 'Reviewed and Approved',
        fontSize: 11,
        type: 'text',
      });
    } else if (activeTool === 'date') {
      onAddAnnotation({
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        pageNumber: pageNum,
        x: Math.round(Math.max(0, Math.min(0.85, clickX)) * 1000) / 1000,
        y: Math.round(Math.max(0, Math.min(0.95, clickY)) * 1000) / 1000,
        text: format(new Date(), 'yyyy-MM-dd'),
        fontSize: 11,
        type: 'date',
      });
    }
  };

  // Dragging Annotation Notes
  const handleMouseDownAnnDrag = (e: React.MouseEvent, ann: PdfAnnotation) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pageWrapperRef.current) return;
    const rect = pageWrapperRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = ann.x;
    const initialY = ann.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / rect.width;
      const dy = (moveEvent.clientY - startY) / rect.height;
      const newX = Math.max(0.01, Math.min(0.92, initialX + dx));
      const newY = Math.max(0.01, Math.min(0.97, initialY + dy));
      onUpdateAnnotation(ann.id!, {
        x: Math.round(newX * 1000) / 1000,
        y: Math.round(newY * 1000) / 1000,
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Dragging the Signature Placement Box
  const handleMouseDownDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pageWrapperRef.current || !signaturePlacement) return;

    const rect = pageWrapperRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = signaturePlacement.x;
    const initialY = signaturePlacement.y;
    const boxW = signaturePlacement.width;
    const boxH = signaturePlacement.height;

    setIsDraggingBox(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / rect.width;
      const dy = (moveEvent.clientY - startY) / rect.height;

      const newX = Math.max(0, Math.min(1 - boxW, initialX + dx));
      const newY = Math.max(0, Math.min(1 - boxH, initialY + dy));

      onUpdateSignaturePlacement({
        ...signaturePlacement,
        pageNumber: pageNum,
        x: Math.round(newX * 1000) / 1000,
        y: Math.round(newY * 1000) / 1000,
      });
    };

    const onMouseUp = () => {
      setIsDraggingBox(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Resizing the Signature Placement Box (Bottom-Right Handle)
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pageWrapperRef.current || !signaturePlacement) return;

    const rect = pageWrapperRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialW = signaturePlacement.width;
    const initialH = signaturePlacement.height;
    const posX = signaturePlacement.x;
    const posY = signaturePlacement.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dw = (moveEvent.clientX - startX) / rect.width;
      const dh = (moveEvent.clientY - startY) / rect.height;

      const minW = 0.20;
      const maxW = 1 - posX;
      const minH = 0.08;
      const maxH = 1 - posY;

      const newW = Math.max(minW, Math.min(maxW, initialW + dw));
      const newH = Math.max(minH, Math.min(maxH, initialH + dh));

      onUpdateSignaturePlacement({
        ...signaturePlacement,
        pageNumber: pageNum,
        width: Math.round(newW * 1000) / 1000,
        height: Math.round(newH * 1000) / 1000,
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      id={`pdf-page-${pageNum}`}
      className="pdf-page-card bg-white shadow-xl rounded-md mb-8 flex flex-col items-center border border-slate-300 scroll-mt-24"
    >
      <div className="bg-slate-100/90 border-b border-slate-200 w-full px-4 py-1.5 flex justify-between items-center text-[11px] font-mono text-slate-500">
        <span className="font-semibold text-slate-700 flex items-center gap-2">
          <span>Page {pageNum}</span>
          {isSigOnThisPage && (
            <span className="bg-blue-600 text-white font-sans text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-xs">
              <PenTool className="w-2.5 h-2.5" /> Signature Target
            </span>
          )}
        </span>
        {rendering ? (
          <span className="flex items-center gap-1 text-blue-600 font-sans">
            <Loader2 className="w-3 h-3 animate-spin" /> Rendering...
          </span>
        ) : isEditorMode ? (
          <span className="text-[10px] text-blue-700 font-sans font-semibold">
            {activeTool === 'signature'
              ? 'Click anywhere on this page to position signature'
              : activeTool === 'text'
              ? 'Click on page to place text note'
              : activeTool === 'date'
              ? 'Click on page to stamp date'
              : 'Interactive Editor Active'}
          </span>
        ) : null}
      </div>

      <div className="p-3 sm:p-6 bg-white flex justify-center w-full overflow-x-auto">
        <div
          ref={pageWrapperRef}
          className="relative inline-block select-none"
          style={{
            cursor: !isEditorMode
              ? 'default'
              : activeTool === 'signature'
              ? 'crosshair'
              : activeTool === 'text' || activeTool === 'date'
              ? 'text'
              : 'default',
          }}
          onClick={handlePageClick}
        >
          <canvas ref={canvasRef} className="max-w-full h-auto block shadow-sm pointer-events-none" />

          {/* Real-time Interactive Editor Overlay */}
          {isEditorMode && (
            <div className="absolute inset-0 pointer-events-auto">
              {/* 1. Placed Annotations on this page with Drag and Font Control */}
              {annotations
                .filter((a) => a.pageNumber === pageNum)
                .map((ann) => (
                  <div
                    key={ann.id}
                    style={{
                      left: `${ann.x * 100}%`,
                      top: `${ann.y * 100}%`,
                    }}
                    className="absolute z-20 group -translate-y-1/2 flex items-center gap-1.5 bg-amber-50/95 border border-amber-400 text-slate-900 px-2 py-1 rounded shadow-md hover:ring-2 hover:ring-amber-400 transition-all select-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className="cursor-move text-amber-600 hover:text-amber-800 p-0.5"
                      onMouseDown={(e) => handleMouseDownAnnDrag(e, ann)}
                      title="Drag to reposition note"
                    >
                      <Move className="w-3 h-3" />
                    </div>
                    <input
                      type="text"
                      value={ann.text}
                      onChange={(e) => onUpdateAnnotation(ann.id!, { text: e.target.value })}
                      className="bg-transparent border-none outline-none font-semibold text-slate-900 min-w-[80px]"
                      style={{ fontSize: `${ann.fontSize || 11}px` }}
                    />
                    <div className="flex items-center gap-0.5 border-l border-amber-300 pl-1">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateAnnotation(ann.id!, {
                            fontSize: Math.max(8, (ann.fontSize || 11) - 1),
                          })
                        }
                        className="text-[9px] font-bold text-amber-800 hover:bg-amber-200 px-1 rounded"
                        title="Decrease font size"
                      >
                        A-
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateAnnotation(ann.id!, {
                            fontSize: Math.min(24, (ann.fontSize || 11) + 1),
                          })
                        }
                        className="text-[9px] font-bold text-amber-800 hover:bg-amber-200 px-1 rounded"
                        title="Increase font size"
                      >
                        A+
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveAnnotation(ann.id!);
                        }}
                        className="text-slate-400 hover:text-rose-600 p-0.5 ml-0.5"
                        title="Delete annotation"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}

              {/* 2. Interactive Signature Stamp Box if placed on this page */}
              {isSigOnThisPage && (
                <div
                  style={{
                    left: `${signaturePlacement!.x * 100}%`,
                    top: `${signaturePlacement!.y * 100}%`,
                    width: `${signaturePlacement!.width * 100}%`,
                    height: `${signaturePlacement!.height * 100}%`,
                  }}
                  className={`absolute z-30 select-none bg-blue-50/95 border-2 border-blue-600 rounded-lg shadow-lg flex flex-col justify-between p-2 cursor-move transition-shadow ${
                    isDraggingBox ? 'ring-4 ring-blue-400/50 shadow-2xl opacity-90' : 'hover:border-blue-700'
                  }`}
                  onMouseDown={handleMouseDownDrag}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Top Bar of Signature Stamp */}
                  <div className="flex items-center justify-between text-[10px] text-blue-900 border-b border-blue-200 pb-1 pointer-events-none">
                    <span className="font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                      <span>21 CFR Part 11 Signature Stamp</span>
                    </span>
                    <div className="flex items-center gap-1 pointer-events-auto">
                      <span className="font-mono text-[9px] bg-blue-200 text-blue-950 px-1 py-0.5 rounded font-semibold">
                        Page {pageNum}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateSignaturePlacement(null);
                        }}
                        className="text-slate-500 hover:text-rose-600 p-0.5"
                        title="Remove placement"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Body: Live Signature Preview (Drawn PNG vs Typed Script) */}
                  <div className="flex-1 flex flex-col justify-center my-0.5 pointer-events-none overflow-hidden">
                    {signatureMethod === 'DRAWN' && drawnImageData ? (
                      <div className="flex items-center justify-center py-1">
                        <img
                          src={drawnImageData}
                          alt="Drawn Signature"
                          className="max-h-[48px] w-auto object-contain pointer-events-none"
                        />
                      </div>
                    ) : (
                      <div className="font-serif italic text-sm sm:text-base text-blue-950 leading-tight truncate font-bold text-center">
                        {typedSignerName || signerName || 'Authorized Signer'}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-600 truncate text-center">
                      {signerRole || 'Role'} • {signerDept || 'Department'}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 truncate text-center">
                      {format(new Date(), 'yyyy-MM-dd HH:mm:ss')} UTC • Embedded Physical Signature
                    </div>
                  </div>

                  {/* Bottom Bar: Drag and Resize Hints */}
                  <div className="flex items-center justify-between text-[9px] text-blue-700 pt-0.5 border-t border-blue-200 pointer-events-none">
                    <span className="flex items-center gap-0.5 font-medium">
                      <Move className="w-2.5 h-2.5" /> Drag box to position
                    </span>

                    {/* Resize Handle (bottom-right corner) */}
                    <div
                      className="pointer-events-auto cursor-se-resize p-1 -mr-1 -mb-1 text-blue-600 hover:text-blue-900"
                      onMouseDown={handleMouseDownResize}
                      title="Drag to resize signature block"
                    >
                      <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-blue-600" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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

  // PDF display mode: 'continuous' (high-DPI multi-page canvas scroll) or 'embed' (native iframe)
  const [pdfViewMode, setPdfViewMode] = useState<'continuous' | 'embed'>('continuous');
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPageNumbers, setPdfPageNumbers] = useState<number[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Image Object URL
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // DOCX specific state & refs
  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  const [docxRendered, setDocxRendered] = useState<boolean>(false);

  // Primary scroll canvas container ref
  const scrollCanvasRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  // Interactive PDF Editor & Electronic Signature Placement State
  const [isPdfEditorMode, setIsPdfEditorMode] = useState<boolean>(false);
  const [activeEditorTool, setActiveEditorTool] = useState<'pointer' | 'signature' | 'text' | 'date'>('signature');
  const [signaturePlacement, setSignaturePlacement] = useState<PdfSignaturePlacement | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [isSavingDraftAnnotations, setIsSavingDraftAnnotations] = useState<boolean>(false);
  const [draftAnnotationsSuccess, setDraftAnnotationsSuccess] = useState<boolean>(false);
  const [draftAnnotationsError, setDraftAnnotationsError] = useState<string | null>(null);

  // In-Editor Signature Method & Live Image
  const [editorSignatureMethod, setEditorSignatureMethod] = useState<'DRAWN' | 'TYPED'>('DRAWN');
  const [editorDrawnImage, setEditorDrawnImage] = useState<string | null>(null);
  const [editorTypedName, setEditorTypedName] = useState<string>(
    user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
  );
  const [isInlineDrawingModalOpen, setIsInlineDrawingModalOpen] = useState<boolean>(false);
  const [currentEditorPage, setCurrentEditorPage] = useState<number>(1);

  // Update default signer name if auth loads later
  useEffect(() => {
    if (user) {
      setEditorTypedName(user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim());
    }
  }, [user]);

  // Toggle editor mode and initialize placement
  const handleToggleEditorMode = () => {
    if (!isPdfEditorMode) {
      setIsPdfEditorMode(true);
      setActiveEditorTool('signature');
      setCurrentEditorPage(1);
      // If no placement yet, place default signature stamp on the last page or page 1
      if (!signaturePlacement && pdfPageNumbers.length > 0) {
        const targetPage = pdfPageNumbers[pdfPageNumbers.length - 1] || 1;
        setSignaturePlacement({
          pageNumber: targetPage,
          x: 0.52,
          y: 0.78,
          width: 0.44,
          height: 0.14,
        });
      }
    } else {
      setIsPdfEditorMode(false);
    }
  };

  // Save annotations draft without executing electronic signature
  const handleSaveDraftAnnotations = async () => {
    if (!version?.id || annotations.length === 0) return;
    try {
      setIsSavingDraftAnnotations(true);
      setDraftAnnotationsError(null);
      await api.post(`/workflow/versions/${version.id}/edit-pdf`, {
        annotations: annotations.map((a) => ({
          pageNumber: a.pageNumber,
          x: a.x,
          y: a.y,
          text: a.text,
          fontSize: a.fontSize || 10,
        })),
      });
      setDraftAnnotationsSuccess(true);
      setTimeout(() => setDraftAnnotationsSuccess(false), 3500);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to save draft annotations:', err);
      setDraftAnnotationsError(
        err.response?.data?.message || 'Failed to save PDF annotations.'
      );
    } finally {
      setIsSavingDraftAnnotations(false);
    }
  };

  // 1. PDF Parsing & Loading (Supports both continuous page rendering & fallback embed)
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadPdfDocument() {
      if (!isPdf || !hasDocument) {
        setPdfDoc(null);
        setPdfPageNumbers([]);
        setPdfUrl(null);
        return;
      }

      setDocLoading(true);
      setDocError(null);

      try {
        let arrayBuffer: ArrayBuffer;

        if (localFile) {
          arrayBuffer = await localFile.arrayBuffer();
          createdUrl = URL.createObjectURL(localFile);
          if (active) setPdfUrl(createdUrl);
        } else {
          const downloadPath =
            stagedDocument?.downloadUrl ||
            (primaryAttachment ? `/attachments/${primaryAttachment.id}/download?inline=true` : null);
          if (!downloadPath) {
            throw new Error('No PDF source attachment available.');
          }

          const res = await api.get(downloadPath, { responseType: 'blob' });
          if (!active) return;
          createdUrl = URL.createObjectURL(res.data);
          if (active) setPdfUrl(createdUrl);
          arrayBuffer = await res.data.arrayBuffer();
        }

        if (!active) return;

        // Parse with PDF.js for continuous multi-page rendering
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (!active) return;

        setPdfDoc(doc);
        const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        setPdfPageNumbers(pages);
      } catch (err: any) {
        if (!active) return;
        console.error('Failed to load PDF preview:', err);
        setDocError(
          err.response?.data?.message ||
            'Failed to parse PDF document. The file can still be opened in native embed mode or downloaded.'
        );
      } finally {
        if (active) {
          setDocLoading(false);
        }
      }
    }

    loadPdfDocument();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [isPdf, hasDocument, localFile, stagedDocument?.id, stagedDocument?.downloadUrl, primaryAttachment?.id]);

  // 2. High-Fidelity DOCX Rendering via docx-preview
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
        const downloadPath =
          stagedDocument?.downloadUrl ||
          (primaryAttachment ? `/attachments/${primaryAttachment.id}/download` : null);
        if (!downloadPath) throw new Error('No DOCX source attachment available.');

        const res = await api.get(downloadPath, { responseType: 'arraybuffer' });
        arrayBuffer = res.data;
      }

      if (!docxContainerRef.current) {
        await new Promise((r) => setTimeout(r, 100));
      }

      if (docxContainerRef.current) {
        docxContainerRef.current.innerHTML = '';
        // inWrapper: false attaches section.docx directly to docxContainerRef
        // ignoreHeight: true allows pages to naturally grow and avoids content/table clipping
        await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
          className: 'docx',
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
        setDocxRendered(true);
      }
    } catch (err: any) {
      console.error('Failed to render DOCX preview:', err);
      setDocError(
        'Unable to render Word layout in browser. The document can still be downloaded and viewed in Microsoft Word.'
      );
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

        const downloadPath =
          stagedDocument?.downloadUrl ||
          (primaryAttachment ? `/attachments/${primaryAttachment.id}/download?inline=true` : null);
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
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (stagedDocument?.downloadUrl) {
      window.open(stagedDocument.downloadUrl, '_blank');
    } else if (primaryAttachment) {
      window.open(`/api/attachments/${primaryAttachment.id}/download`, '_blank');
    }
  };

  const handleFitToWidth = () => {
    if (!scrollCanvasRef.current) {
      setZoomLevel(100);
      return;
    }
    const canvasWidth = scrollCanvasRef.current.clientWidth - 64; // subtract padding
    if (canvasWidth <= 0) {
      setZoomLevel(100);
      return;
    }
    // Standard Letter / A4 width is ~816px
    const targetScale = Math.min(180, Math.max(60, Math.round((canvasWidth / 816) * 100)));
    setZoomLevel(targetScale);
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Drag and drop handlers
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
    setInternalUploadError(null);
    if (onFileSelect) {
      onFileSelect(file);
      return;
    }

    if (version?.id) {
      try {
        setInternalUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/attachments/versions/${version.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (onRefresh) {
          await onRefresh();
        }
      } catch (err: any) {
        console.error('Failed to attach document:', err);
        setInternalUploadError(
          err.response?.data?.message || 'Failed to upload attachment. Please try again.'
        );
      } finally {
        setInternalUploading(false);
      }
    }
  };

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokingSignature || !revokeReason.trim()) return;

    try {
      setSubmittingRevoke(true);
      setRevokeError(null);
      await api.post(`/signatures/${revokingSignature.id}/revoke`, {
        reason: revokeReason.trim(),
      });
      setRevokingSignature(null);
      setRevokeReason('');
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to revoke signature:', err);
      setRevokeError(
        err.response?.data?.message || 'Failed to revoke electronic signature. Action rejected.'
      );
    } finally {
      setSubmittingRevoke(false);
    }
  };

  // Signatures
  const validSignatures =
    version?.signatures?.filter((sig) => sig.status === 'VALID') || [];
  const revokedSignatures =
    version?.signatures?.filter((sig) => sig.status === 'REVOKED') || [];

  const isUploading = uploadStatus === 'uploading' || internalUploading;
  const currentUploadError = uploadErrorMessage || internalUploadError;

  return (
    <div
      ref={containerRef}
      className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none p-4 bg-slate-900 overflow-hidden' : 'p-6'
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

            {/* Upload Status Indicators */}
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
              {isPdf && pdfPageNumbers.length > 0 && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {pdfPageNumbers.length} {pdfPageNumbers.length === 1 ? 'Page' : 'Pages'} Total
                  </span>
                </>
              )}
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

      {/* Upload Error Banner & Retry Button */}
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

      {/* Viewport Toolbar Controls (Zoom, Reset, Fit Width, Print, Download, Fullscreen) */}
      {hasDocument && (
        <div
          className={`py-2 px-3 my-3 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm ${
            isFullscreen
              ? 'bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          {/* Zoom & Fit-to-Width Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Zoom Out (-10%)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs px-2 font-bold min-w-[50px] text-center">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Zoom In (+10%)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleFitToWidth}
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium text-[11px]"
              title="Fit to Container Width"
            >
              <Scan className="w-3.5 h-3.5 text-blue-600" />
              <span>Fit Width</span>
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Reset Zoom to 100%"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* PDF View Mode Toggle & Interactive PDF Editor */}
            {isPdf && pdfUrl && (
              <div className="ml-3 pl-3 border-l border-slate-300 dark:border-slate-600 flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setPdfViewMode('continuous');
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                    pdfViewMode === 'continuous' && !isPdfEditorMode
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                  }`}
                  title="Scroll smoothly through all pages continuously"
                >
                  Page Reader
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPdfEditorMode(false);
                    setPdfViewMode('embed');
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                    pdfViewMode === 'embed'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                  }`}
                  title="Switch to Browser Native PDF Plugin Viewer"
                >
                  Native Viewer
                </button>

                {/* PDF Interactive Editor & E-Sign Placement Button */}
                {version?.id && !isUnsavedDraft && (
                  <button
                    type="button"
                    onClick={handleToggleEditorMode}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                      isPdfEditorMode
                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                    }`}
                    title="Interactive PDF Editor: Drag and position signature stamps and text annotations on any page"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isPdfEditorMode ? 'Exit Editor' : 'Edit & Place E-Sign'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons: Download, Print, Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Download Signed PDF if electronically signed */}
            {validSignatures.length > 0 && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                title="Download verified signed document with physical signature stamps"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                <span>Download Signed PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 font-semibold text-xs shadow-xs transition-colors"
              title="Download original file"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Download Original</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 font-semibold text-xs shadow-xs transition-colors"
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

      {/* Interactive PDF Editor Control Bar (Active when isPdfEditorMode is true) */}
      {isPdf && isPdfEditorMode && (
        <div className="mb-3 space-y-2 animate-in fade-in duration-150">
          <div className="p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl shadow-md border border-indigo-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Tool Palette */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider mr-1">
                Tools:
              </span>

              <button
                type="button"
                onClick={() => setActiveEditorTool('pointer')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                  activeEditorTool === 'pointer'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Pointer / Selection tool"
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span>Select</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveEditorTool('signature');
                  if (!signaturePlacement && pdfPageNumbers.length > 0) {
                    const targetPage = currentEditorPage || pdfPageNumbers[pdfPageNumbers.length - 1] || 1;
                    setSignaturePlacement({
                      pageNumber: targetPage,
                      x: 0.52,
                      y: 0.78,
                      width: 0.44,
                      height: 0.14,
                    });
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  activeEditorTool === 'signature'
                    ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-300'
                    : 'bg-slate-800 text-blue-300 hover:bg-slate-700'
                }`}
                title="Position electronic signature stamp on any page"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Place Signature Stamp</span>
                {signaturePlacement && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveEditorTool('text')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                  activeEditorTool === 'text'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Click on document to add a text annotation"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Add Text Note</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveEditorTool('date')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                  activeEditorTool === 'date'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Click on document to stamp current date"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Stamp Date</span>
              </button>
            </div>

            {/* Page Jumper */}
            {pdfPageNumbers.length > 1 && (
              <div className="flex items-center gap-1 bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700">
                <button
                  type="button"
                  disabled={currentEditorPage <= 1}
                  onClick={() => {
                    const prev = Math.max(1, currentEditorPage - 1);
                    setCurrentEditorPage(prev);
                    document.getElementById(`pdf-page-${prev}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30"
                  title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-medium text-slate-300">Page</span>
                <select
                  value={currentEditorPage}
                  onChange={(e) => {
                    const p = Number(e.target.value);
                    setCurrentEditorPage(p);
                    document.getElementById(`pdf-page-${p}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="bg-slate-900 text-white text-[11px] font-bold rounded px-1.5 py-0.5 border border-slate-700 outline-none"
                >
                  {pdfPageNumbers.map((p) => (
                    <option key={p} value={p}>
                      {p} of {pdfPageNumbers.length}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={currentEditorPage >= pdfPageNumbers.length}
                  onClick={() => {
                    const next = Math.min(pdfPageNumbers.length, currentEditorPage + 1);
                    setCurrentEditorPage(next);
                    document.getElementById(`pdf-page-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30"
                  title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* In-Editor Signature Method & Live Image Controls */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700 flex-wrap">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Sign Format:</span>
              <button
                type="button"
                onClick={() => {
                  setEditorSignatureMethod('DRAWN');
                  if (!editorDrawnImage) setIsInlineDrawingModalOpen(true);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                  editorSignatureMethod === 'DRAWN' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Digital Pen {editorDrawnImage ? '✓' : ''}
              </button>
              <button
                type="button"
                onClick={() => setEditorSignatureMethod('TYPED')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                  editorSignatureMethod === 'TYPED' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Typed Script
              </button>
              {editorSignatureMethod === 'DRAWN' && (
                <button
                  type="button"
                  onClick={() => setIsInlineDrawingModalOpen(true)}
                  className="ml-1 text-[10px] text-blue-300 hover:text-white underline font-semibold"
                >
                  {editorDrawnImage ? 'Redraw' : 'Draw Signature'}
                </button>
              )}
            </div>

            {/* Action Triggers */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Clear Placement */}
              {(signaturePlacement || annotations.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setSignaturePlacement(null);
                    setAnnotations([]);
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                  title="Clear placed signature and annotations"
                >
                  Clear
                </button>
              )}

              {/* Save Draft Annotations */}
              {annotations.length > 0 && (
                <button
                  type="button"
                  disabled={isSavingDraftAnnotations}
                  onClick={handleSaveDraftAnnotations}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  title="Save text/date annotations to draft PDF"
                >
                  {isSavingDraftAnnotations ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  ) : draftAnnotationsSuccess ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span>{draftAnnotationsSuccess ? 'Notes Saved!' : 'Save Draft Notes'}</span>
                </button>
              )}

              {/* Execute & Embed Electronic Signature Button */}
              <button
                type="button"
                onClick={() => {
                  // If signature not yet placed, place it on the active/last page
                  if (!signaturePlacement && pdfPageNumbers.length > 0) {
                    const targetPage = currentEditorPage || pdfPageNumbers[pdfPageNumbers.length - 1] || 1;
                    setSignaturePlacement({
                      pageNumber: targetPage,
                      x: 0.52,
                      y: 0.78,
                      width: 0.44,
                      height: 0.14,
                    });
                  }
                  setIsSignModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-xs font-bold shadow-md transition-all ring-1 ring-emerald-400"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Save & Embed Signature</span>
              </button>
            </div>
          </div>

          {/* Editor Guidance & Placement Pill */}
          <div className="bg-slate-800/95 text-slate-300 text-[11px] px-3.5 py-1.5 rounded-lg border border-slate-700 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span>
                <strong>Interactive PDF Editor:</strong> Place, drag, or resize signature blocks and add annotations. Finalizing physically burns signatures into the PDF bytes in compliance with 21 CFR Part 11.
              </span>
            </div>
            {signaturePlacement && (
              <span className="font-mono text-[10px] text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-600/50">
                Placement: Page {signaturePlacement.pageNumber} @ ({Math.round(signaturePlacement.x * 100)}%, {Math.round(signaturePlacement.y * 100)}%)
              </span>
            )}
          </div>
        </div>
      )}

      {draftAnnotationsError && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{draftAnnotationsError}</span>
        </div>
      )}

      {/* Main Document Viewer Canvas: Single Primary Scrollable Area */}
      <div
        ref={scrollCanvasRef}
        className={`relative border rounded-xl bg-slate-200/90 dark:bg-slate-900 transition-all ${
          isFullscreen
            ? 'h-[calc(100vh-140px)] overflow-y-auto p-4 sm:p-8'
            : 'min-h-[750px] max-h-[85vh] overflow-y-auto p-4 sm:p-8 border-slate-300'
        }`}
      >
        {/* State 1: No document selected */}
        {!hasDocument ? (
          <div className="min-h-[500px] flex items-center justify-center p-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`text-center p-8 max-w-md w-full border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50 shadow-sm'
              }`}
              onClick={() => internalFileInputRef.current?.click()}
            >
              <div className="p-4 bg-blue-50 text-blue-600 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-inner mb-3">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Document Selected</h3>
              <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
                Upload your official procedure document (<strong>.pdf</strong>, <strong>.docx</strong>, or images).
                The document preview will render automatically below with complete vertical page scrolling and zoom controls.
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
          </div>
        ) : docLoading ? (
          /* State 5: Preview Loading */
          <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-slate-600">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-3" />
            <span className="text-sm font-bold text-slate-800">
              Rendering Complete {isPdf ? 'PDF' : isDocx ? 'Microsoft Word (.docx)' : 'Document'} Pages...
            </span>
            <span className="text-xs text-slate-500 mt-1">
              Preparing high-fidelity layout with tables, headers, and full pagination.
            </span>
          </div>
        ) : docError && (!pdfUrl || pdfViewMode === 'continuous') ? (
          /* State 6: Preview Failed — show actual error and recovery options */
          <div className="min-h-[500px] flex items-center justify-center p-4">
            <div className="text-center p-8 max-w-lg bg-white rounded-xl shadow-lg border border-rose-200 space-y-4">
              <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
              <h4 className="font-bold text-base text-slate-800">Document Reader Notice</h4>
              <p className="text-xs text-rose-600 leading-relaxed">{docError}</p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {isPdf && pdfUrl && (
                  <button
                    type="button"
                    onClick={() => setPdfViewMode('embed')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Native Viewer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isDocx) renderDocxDocument();
                    else if (isPdf) setZoomLevel((z) => z);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Reader</span>
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
          </div>
        ) : isPdf && pdfDoc && pdfViewMode === 'continuous' ? (
          /* PDF Viewer Option A: Continuous High-DPI Multi-Page Vertical Scroll */
          <div className="pdf-document-scroll flex flex-col items-center w-full py-4">
            {pdfPageNumbers.map((pageNum) => (
              <PdfPageItem
                key={`pdf-page-${pageNum}`}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                zoomLevel={zoomLevel}
                isEditorMode={isPdfEditorMode}
                activeTool={activeEditorTool}
                signaturePlacement={signaturePlacement}
                onUpdateSignaturePlacement={setSignaturePlacement}
                annotations={annotations}
                onAddAnnotation={(ann) => setAnnotations((prev) => [...prev, ann])}
                onUpdateAnnotation={(id, updates) =>
                  setAnnotations((prev) =>
                    prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
                  )
                }
                onRemoveAnnotation={(id) =>
                  setAnnotations((prev) => prev.filter((a) => a.id !== id))
                }
                signatureMethod={editorSignatureMethod}
                drawnImageData={editorDrawnImage}
                typedSignerName={editorTypedName}
                onOpenDrawModal={() => setIsInlineDrawingModalOpen(true)}
                signerName={user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim()}
                signerRole={user?.role}
                signerDept={user?.department?.name || 'Department'}
              />
            ))}
          </div>
        ) : isPdf && pdfUrl && pdfViewMode === 'embed' ? (
          /* PDF Viewer Option B: Full-Height Native Browser Embed (No CSS transform clipping) */
          <div className="w-full h-full min-h-[750px] bg-slate-900 rounded-lg shadow-xl overflow-hidden">
            <iframe
              src={`${pdfUrl}#toolbar=1&navpanes=1`}
              title={fileName || 'SOP PDF Document'}
              className="w-full h-full min-h-[750px] border-none"
            />
          </div>
        ) : isDocx ? (
          /* DOCX Viewer: High-Fidelity Word Layout rendered directly into primary scroll canvas */
          <div className="flex flex-col items-center justify-start w-full py-4">
            <div
              ref={docxContainerRef}
              className="docx-preview-container flex flex-col items-center justify-start w-full transition-transform duration-150"
              style={{
                zoom: zoomLevel === 100 ? undefined : `${zoomLevel}%`,
              }}
            />
          </div>
        ) : isImage && imageUrl ? (
          /* Image Viewer with Zoom Controls */
          <div className="flex flex-col items-center justify-center min-h-[600px] py-6">
            <img
              src={imageUrl}
              alt={fileName || 'SOP Document Image'}
              className="max-w-full rounded-lg shadow-2xl object-contain bg-white p-3 border border-slate-300 transition-all duration-150"
              style={{ width: `${zoomLevel}%` }}
            />
          </div>
        ) : isDoc ? (
          /* Legacy Binary DOC Fallback */
          <div className="min-h-[500px] flex items-center justify-center p-4">
            <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-slate-200 max-w-md space-y-3">
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
          </div>
        ) : isUnsupported ? (
          /* Unsupported Formats (.xlsx, etc.) */
          <div className="min-h-[500px] flex items-center justify-center p-4">
            <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-slate-200 max-w-md space-y-3">
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
          </div>
        ) : (
          <div className="min-h-[500px] flex items-center justify-center p-8 text-slate-500 text-xs">
            Preparing document preview...
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

          {/* Action Trigger for Electronic Signature */}
          {isUnsavedDraft ? (
            <div className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span>Document must be created and saved before electronic signatures can be executed.</span>
            </div>
          ) : !hasDocument ? (
            <div className="text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span>Attach an official procedure document to enable electronic signature workflows.</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsSignModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Execute 21 CFR Part 11 Electronic Signature</span>
            </button>
          )}
        </div>

        {/* Active Signatures List */}
        {validSignatures.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
            No formal electronic signatures have been affixed to this document version yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {validSignatures.map((sig) => (
              <div
                key={sig.id}
                className="p-3.5 rounded-xl border bg-emerald-50/50 border-emerald-200 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        {sig.signerName ? sig.signerName.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <span className="font-bold text-xs text-slate-900 block leading-tight">
                          {sig.signerName}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {sig.signerRole || 'Authorized Approver'} • {sig.signerDepartment || 'Department'}
                        </span>
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                      {sig.workflowStep}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-emerald-100 text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        Signed:
                      </span>
                      <span className="font-medium text-slate-700">
                        {format(new Date(sig.signedAt), 'MMM dd, yyyy HH:mm:ss')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-400" />
                        Doc Hash:
                      </span>
                      <span className="font-mono text-[10px] text-slate-600 truncate max-w-[120px]" title={sig.documentHash}>
                        {sig.documentHash.slice(0, 8)}...{sig.documentHash.slice(-6)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span>Method:</span>
                      <span className="text-[10px] font-semibold text-emerald-700">
                        {sig.signatureMethod === 'DRAWN' ? 'Digital Pen (Drawn)' : 'Electronic (Typed)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Revoke Option for Admins or the Original Signer */}
                {(isAdmin || user?.id === sig.signerUserId) && (
                  <div className="mt-3 pt-2 border-t border-emerald-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setRevokingSignature(sig);
                        setRevokeReason('');
                        setRevokeError(null);
                      }}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition-colors"
                    >
                      Revoke Signature...
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Historical Revoked Signatures Section (Audit trail preservation) */}
        {revokedSignatures.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <h4 className="text-xs font-bold text-rose-700 flex items-center gap-1 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Revoked Signatures ({revokedSignatures.length})</span>
            </h4>
            <div className="space-y-1.5">
              {revokedSignatures.map((sig) => (
                <div
                  key={sig.id}
                  className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-slate-800">{sig.signerName}</span>
                    <span className="text-slate-500"> ({sig.workflowStep})</span>
                    <span className="text-rose-600 ml-2 font-medium">
                      Revoked: {sig.revokedReason || 'No reason specified'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {sig.revokedAt && format(new Date(sig.revokedAt), 'MMM dd, yyyy HH:mm:ss')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 21 CFR Part 11 Electronic Signature Execution Modal */}
      {version?.id && (
        <SOPElectronicSignatureModal
          isOpen={isSignModalOpen}
          onClose={() => setIsSignModalOpen(false)}
          version={version}
          sopNumber={sopNumber}
          placement={signaturePlacement}
          annotations={annotations}
          initialMethod={editorSignatureMethod}
          initialSignatureData={
            editorSignatureMethod === 'DRAWN'
              ? (editorDrawnImage || undefined)
              : (editorTypedName || undefined)
          }
          onSignatureComplete={async (sig: SOPElectronicSignature) => {
            setSignaturePlacement(null);
            setAnnotations([]);
            setIsPdfEditorMode(false);
            if (onSignatureAdded) {
              onSignatureAdded(sig);
            }
            if (onRefresh) {
              await onRefresh();
            }
          }}
        />
      )}

      {/* In-Editor Digital Pen / Stylus Signature Pad Modal */}
      <InlineDrawingPadModal
        isOpen={isInlineDrawingModalOpen}
        onClose={() => setIsInlineDrawingModalOpen(false)}
        onSave={(dataUrl) => {
          setEditorDrawnImage(dataUrl);
          setEditorSignatureMethod('DRAWN');
        }}
        initialData={editorDrawnImage}
      />

      {/* Revocation Reason Modal */}
      {revokingSignature && (
        <Modal
          isOpen={Boolean(revokingSignature)}
          onClose={() => setRevokingSignature(null)}
          title="Revoke Electronic Signature"
        >
          <form onSubmit={handleRevokeSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <p className="font-bold mb-1">Regulatory Impact Notice (21 CFR Part 11):</p>
              <p>
                Revoking an electronic signature will invalidate this approval step and record an immutable
                event in the system audit log. A clear, documented justification is required.
              </p>
            </div>

            {revokeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {revokeError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Reason for Revocation *
              </label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="State why this signature is being revoked (e.g. substantive procedure amendments, procedural discrepancy)..."
                rows={3}
                required
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setRevokingSignature(null)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingRevoke || !revokeReason.trim()}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors"
              >
                {submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
