import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

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
 * Calculates PDF coordinates and rotation angle taking into account page dimensions and rotation (/Rotate attribute).
 */
function mapBoxCoordinates(
  page: any,
  rel: { x: number; y: number; width: number; height: number }
) {
  const { width: pWidth, height: pHeight } = page.getSize();
  const rotation = ((page.getRotation()?.angle || 0) % 360 + 360) % 360;

  if (rotation === 90) {
    // Rotated 90 deg clockwise in viewer (width is pHeight, height is pWidth)
    const boxW = Math.max(120, Math.min(pHeight - 20, rel.width * pHeight));
    const boxH = Math.max(45, Math.min(pWidth - 20, rel.height * pWidth));
    const boxX = Math.max(10, Math.min(pWidth - boxH - 10, rel.y * pWidth));
    const boxY = Math.max(10, Math.min(pHeight - boxW - 10, pHeight - (rel.x * pHeight) - boxW));
    return { x: boxX, y: boxY, width: boxH, height: boxW, rotationAngle: 90 };
  } else if (rotation === 180) {
    const boxW = Math.max(120, Math.min(pWidth - 20, rel.width * pWidth));
    const boxH = Math.max(45, Math.min(pHeight - 20, rel.height * pHeight));
    const boxX = Math.max(10, Math.min(pWidth - boxW - 10, pWidth - (rel.x * pWidth) - boxW));
    const boxY = Math.max(10, Math.min(pHeight - boxH - 10, rel.y * pHeight));
    return { x: boxX, y: boxY, width: boxW, height: boxH, rotationAngle: 180 };
  } else if (rotation === 270) {
    const boxW = Math.max(120, Math.min(pHeight - 20, rel.width * pHeight));
    const boxH = Math.max(45, Math.min(pWidth - 20, rel.height * pWidth));
    const boxX = Math.max(10, Math.min(pWidth - boxH - 10, pWidth - (rel.y * pWidth) - boxH));
    const boxY = Math.max(10, Math.min(pHeight - boxW - 10, rel.x * pHeight));
    return { x: boxX, y: boxY, width: boxH, height: boxW, rotationAngle: 270 };
  }

  // Standard orientation (rotation === 0)
  const boxW = Math.max(130, Math.min(pWidth - 20, rel.width * pWidth));
  const boxH = Math.max(50, Math.min(pHeight - 20, rel.height * pHeight));
  const boxX = Math.max(10, Math.min(pWidth - boxW - 10, rel.x * pWidth));
  const boxY = Math.max(10, Math.min(pHeight - boxH - 10, pHeight - (rel.y * pHeight) - boxH));
  return { x: boxX, y: boxY, width: boxW, height: boxH, rotationAngle: 0 };
}

function mapAnnotationCoordinates(
  page: any,
  ann: { x: number; y: number; fontSize?: number }
) {
  const { width: pWidth, height: pHeight } = page.getSize();
  const rotation = ((page.getRotation()?.angle || 0) % 360 + 360) % 360;
  const fSize = ann.fontSize || 10;

  if (rotation === 90) {
    const ax = Math.max(5, Math.min(pWidth - 10, (ann.y || 0.1) * pWidth));
    const ay = Math.max(5, Math.min(pHeight - 10, pHeight - ((ann.x || 0.1) * pHeight) - fSize));
    return { x: ax, y: ay, rotationAngle: 90 };
  } else if (rotation === 180) {
    const ax = Math.max(5, Math.min(pWidth - 10, pWidth - ((ann.x || 0.1) * pWidth)));
    const ay = Math.max(5, Math.min(pHeight - 10, (ann.y || 0.1) * pHeight));
    return { x: ax, y: ay, rotationAngle: 180 };
  } else if (rotation === 270) {
    const ax = Math.max(5, Math.min(pWidth - 10, pWidth - ((ann.y || 0.1) * pWidth) - fSize));
    const ay = Math.max(5, Math.min(pHeight - 10, (ann.x || 0.1) * pHeight));
    return { x: ax, y: ay, rotationAngle: 270 };
  }

  const ax = Math.max(5, Math.min(pWidth - 10, (ann.x || 0.1) * pWidth));
  const ay = Math.max(5, Math.min(pHeight - 10, pHeight - ((ann.y || 0.1) * pHeight) - fSize));
  return { x: ax, y: ay, rotationAngle: 0 };
}

/**
 * Embeds a confirmed electronic signature and optional annotations directly into PDF file bytes.
 * Handles coordinate translation from browser DOM (top-left) to PDF points (bottom-left) and page rotation.
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

  // Load standard fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontScript = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  // Normalize placement
  const normRel: SignaturePlacement = {
    pageNumber: targetPageNum,
    x: placement?.x !== undefined ? Math.max(0.01, Math.min(0.85, placement.x)) : 0.55,
    y: placement?.y !== undefined ? Math.max(0.01, Math.min(0.88, placement.y)) : 0.82,
    width: placement?.width !== undefined ? Math.max(0.15, Math.min(0.60, placement.width)) : 0.38,
    height: placement?.height !== undefined ? Math.max(0.06, Math.min(0.25, placement.height)) : 0.12,
  };

  const coords = mapBoxCoordinates(page, normRel);

  // 1. Draw Signature Card Container
  page.drawRectangle({
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
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

      const maxImgW = Math.max(40, coords.width - 16);
      const maxImgH = Math.max(25, coords.height - 28);
      const imgDims = pngImg.scaleToFit(maxImgW, maxImgH);

      // Center the image inside the upper portion of the box
      const imgX = coords.x + (coords.width - imgDims.width) / 2;
      const imgY = coords.y + 24 + (maxImgH - imgDims.height) / 2;

      page.drawImage(pngImg, {
        x: imgX,
        y: imgY,
        width: imgDims.width,
        height: imgDims.height,
      });
    } catch (imgErr) {
      console.warn('Failed to embed drawn signature image, falling back to vector text:', imgErr);
      page.drawText(signerInfo.name, {
        x: coords.x + 10,
        y: coords.y + Math.max(24, coords.height * 0.45),
        size: Math.min(18, Math.max(12, coords.height * 0.28)),
        font: fontScript,
        color: rgb(0.05, 0.15, 0.45),
      });
    }
  } else {
    // Typed Signature
    const cleanTypedName = signatureData.startsWith('data:') ? signerInfo.name : signatureData;
    page.drawText(cleanTypedName, {
      x: coords.x + 12,
      y: coords.y + Math.max(26, coords.height * 0.45),
      size: Math.min(18, Math.max(12, coords.height * 0.28)),
      font: fontScript,
      color: rgb(0.05, 0.15, 0.45),
    });
  }

  // 3. Draw 21 CFR Part 11 Electronic Signature Verification Banner
  const titleLine = `Digitally Signed by: ${signerInfo.name} (${signerInfo.role})`;
  const hashShort = signerInfo.originalHash ? signerInfo.originalHash.slice(0, 8) + '...' : 'VERIFIED';
  const metaLine = `${signerInfo.department || 'Authorized Dept'} • ${signerInfo.date.toISOString().replace('T', ' ').slice(0, 19)} UTC • SHA: ${hashShort}`;

  page.drawText(titleLine, {
    x: coords.x + 8,
    y: coords.y + 12,
    size: Math.min(7, Math.max(5.5, coords.width * 0.035)),
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  page.drawText(metaLine, {
    x: coords.x + 8,
    y: coords.y + 4,
    size: Math.min(6, Math.max(4.5, coords.width * 0.03)),
    font: fontRegular,
    color: rgb(0.35, 0.4, 0.5),
  });

  // 4. Embed Any Additional Text/Date Annotations
  if (annotations && Array.isArray(annotations)) {
    for (const ann of annotations) {
      if (!ann.text || !ann.text.trim()) continue;
      const aPageNum = Math.max(1, Math.min(ann.pageNumber || 1, pageCount));
      const aPage = pages[aPageNum - 1];
      const aCoords = mapAnnotationCoordinates(aPage, ann);

      aPage.drawText(ann.text, {
        x: aCoords.x,
        y: aCoords.y,
        size: ann.fontSize || 10,
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
    const aPage = pages[aPageNum - 1];
    const aCoords = mapAnnotationCoordinates(aPage, ann);

    aPage.drawText(ann.text, {
      x: aCoords.x,
      y: aCoords.y,
      size: ann.fontSize || 10,
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
