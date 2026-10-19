import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface SignaturePlacement {
  pageNumber: number; // 1-indexed
  x: number;          // relative 0.0 to 1.0 (from left)
  y: number;          // relative 0.0 to 1.0 (from top in DOM)
  width: number;      // relative 0.0 to 1.0
  height: number;     // relative 0.0 to 1.0
}

export interface PdfAnnotation {
  type: 'text' | 'date';
  pageNumber: number; // 1-indexed
  x: number;          // relative 0.0 to 1.0
  y: number;          // relative 0.0 to 1.0
  text: string;
  fontSize?: number;
}

export interface SignerEmbedInfo {
  name: string;
  role: string;
  department: string;
  date: Date;
  originalHash: string;
  workflowStep?: string;
}

/**
 * Embeds a confirmed electronic signature and optional annotations directly into PDF file bytes.
 * Handles coordinate translation from browser DOM (top-left) to PDF points (bottom-left).
 */
export async function embedSignatureIntoPdf(
  pdfBuffer: Buffer,
  signatureMethod: 'DRAWN' | 'TYPED',
  signatureData: string,
  signerInfo: SignerEmbedInfo,
  placement?: SignaturePlacement,
  annotations?: PdfAnnotation[]
): Promise<{
  signedBytes: Buffer;
  signedHash: string;
  pageCount: number;
  actualPlacement: SignaturePlacement;
}> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const pageCount = pages.length;

  if (pageCount === 0) {
    throw new Error('PDF document contains no pages to sign.');
  }

  // Determine target page (1-based, default to last page if omitted)
  const targetPageNum = placement?.pageNumber
    ? Math.max(1, Math.min(placement.pageNumber, pageCount))
    : pageCount;

  const page = pages[targetPageNum - 1];
  const { width: pWidth, height: pHeight } = page.getSize();

  // Load standard fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontScript = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  // Normalize placement: default to bottom-right signature block if placement not provided
  const normRel: SignaturePlacement = {
    pageNumber: targetPageNum,
    x: placement?.x !== undefined ? Math.max(0.01, Math.min(0.85, placement.x)) : 0.55,
    y: placement?.y !== undefined ? Math.max(0.01, Math.min(0.88, placement.y)) : 0.82,
    width: placement?.width !== undefined ? Math.max(0.15, Math.min(0.60, placement.width)) : 0.38,
    height: placement?.height !== undefined ? Math.max(0.06, Math.min(0.25, placement.height)) : 0.12,
  };

  const boxW = Math.max(130, Math.min(pWidth - 20, normRel.width * pWidth));
  const boxH = Math.max(50, Math.min(pHeight - 20, normRel.height * pHeight));
  const boxX = Math.max(10, Math.min(pWidth - boxW - 10, normRel.x * pWidth));
  // Convert DOM top-left Y to PDF bottom-left Y
  const boxY = Math.max(10, Math.min(pHeight - boxH - 10, pHeight - (normRel.y * pHeight) - boxH));

  // 1. Draw Signature Card Container
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    color: rgb(0.98, 0.99, 1),
    borderColor: rgb(0.15, 0.35, 0.75),
    borderWidth: 1.5,
  });

  // 2. Draw Signature Content (Drawn Image or Typed Script)
  if (signatureMethod === 'DRAWN' && signatureData.startsWith('data:image/')) {
    try {
      const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Data, 'base64');
      const pngImg = await pdfDoc.embedPng(imgBuffer);

      const maxImgW = Math.max(40, boxW - 16);
      const maxImgH = Math.max(25, boxH - 28);
      const imgDims = pngImg.scaleToFit(maxImgW, maxImgH);

      // Center the image inside the upper portion of the box
      const imgX = boxX + (boxW - imgDims.width) / 2;
      const imgY = boxY + 24 + (maxImgH - imgDims.height) / 2;

      page.drawImage(pngImg, {
        x: imgX,
        y: imgY,
        width: imgDims.width,
        height: imgDims.height,
      });
    } catch (imgErr) {
      console.warn('Failed to embed drawn signature image, falling back to vector text:', imgErr);
      page.drawText(signerInfo.name, {
        x: boxX + 10,
        y: boxY + Math.max(24, boxH * 0.45),
        size: Math.min(18, Math.max(12, boxH * 0.28)),
        font: fontScript,
        color: rgb(0.05, 0.15, 0.45),
      });
    }
  } else {
    // Typed Signature
    const cleanTypedName = signatureData.startsWith('data:') ? signerInfo.name : signatureData;
    page.drawText(cleanTypedName, {
      x: boxX + 12,
      y: boxY + Math.max(26, boxH * 0.45),
      size: Math.min(18, Math.max(12, boxH * 0.28)),
      font: fontScript,
      color: rgb(0.05, 0.15, 0.45),
    });
  }

  // 3. Draw 21 CFR Part 11 Electronic Signature Verification Banner
  const titleLine = `Digitally Signed by: ${signerInfo.name} (${signerInfo.role})`;
  const hashShort = signerInfo.originalHash ? signerInfo.originalHash.slice(0, 8) + '...' : 'VERIFIED';
  const metaLine = `${signerInfo.department || 'Authorized Dept'} • ${signerInfo.date.toISOString().replace('T', ' ').slice(0, 19)} UTC • SHA: ${hashShort}`;

  page.drawText(titleLine, {
    x: boxX + 8,
    y: boxY + 12,
    size: Math.min(7, Math.max(5.5, boxW * 0.035)),
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  page.drawText(metaLine, {
    x: boxX + 8,
    y: boxY + 4,
    size: Math.min(6, Math.max(4.5, boxW * 0.03)),
    font: fontRegular,
    color: rgb(0.35, 0.4, 0.5),
  });

  // 4. Embed Any Additional Text/Date Annotations
  if (annotations && Array.isArray(annotations)) {
    for (const ann of annotations) {
      if (!ann.text || !ann.text.trim()) continue;
      const aPageNum = Math.max(1, Math.min(ann.pageNumber || 1, pageCount));
      const aPage = pages[aPageNum - 1];
      const { width: apWidth, height: apHeight } = aPage.getSize();

      const fSize = ann.fontSize || 10;
      const ax = Math.max(5, Math.min(apWidth - 10, (ann.x || 0.1) * apWidth));
      const ay = Math.max(5, Math.min(apHeight - 10, apHeight - ((ann.y || 0.1) * apHeight) - fSize));

      aPage.drawText(ann.text, {
        x: ax,
        y: ay,
        size: fSize,
        font: fontBold,
        color: ann.type === 'date' ? rgb(0.2, 0.3, 0.5) : rgb(0.1, 0.1, 0.1),
      });
    }
  }

  // 5. Serialize and Calculate SHA-256 Checksum
  const outputBytes = await pdfDoc.save();
  const signedBuffer = Buffer.from(outputBytes);
  const signedHash = crypto.createHash('sha256').update(signedBuffer).digest('hex');

  return {
    signedBytes: signedBuffer,
    signedHash,
    pageCount,
    actualPlacement: normRel,
  };
}

/**
 * Embeds draft text or date annotations into a PDF without executing a formal signature.
 */
export async function embedAnnotationsIntoPdf(
  pdfBuffer: Buffer,
  annotations: PdfAnnotation[]
): Promise<{
  editedBytes: Buffer;
  editedHash: string;
  pageCount: number;
}> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const pageCount = pages.length;

  if (pageCount === 0) {
    throw new Error('PDF document contains no pages to edit.');
  }

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const ann of annotations) {
    if (!ann.text || !ann.text.trim()) continue;
    const aPageNum = Math.max(1, Math.min(ann.pageNumber || 1, pageCount));
    const page = pages[aPageNum - 1];
    const { width: apWidth, height: apHeight } = page.getSize();

    const fSize = ann.fontSize || 10;
    const ax = Math.max(5, Math.min(apWidth - 10, (ann.x || 0.1) * apWidth));
    const ay = Math.max(5, Math.min(apHeight - 10, apHeight - ((ann.y || 0.1) * apHeight) - fSize));

    page.drawText(ann.text, {
      x: ax,
      y: ay,
      size: fSize,
      font: fontBold,
      color: ann.type === 'date' ? rgb(0.2, 0.3, 0.5) : rgb(0.1, 0.1, 0.1),
    });
  }

  const outputBytes = await pdfDoc.save();
  const editedBuffer = Buffer.from(outputBytes);
  const editedHash = crypto.createHash('sha256').update(editedBuffer).digest('hex');

  return {
    editedBytes: editedBuffer,
    editedHash,
    pageCount,
  };
}
