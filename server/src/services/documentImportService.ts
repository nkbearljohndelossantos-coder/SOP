import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import JSZip from 'jszip';
// @ts-ignore - import core parser directly to avoid index.js !module.parent debug code
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { prisma } from '../prisma/client';

const execFileAsync = promisify(execFile);

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

export class DocumentValidationError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'DocumentValidationError';
    this.statusCode = statusCode;
  }
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_UNCOMPRESSED_XML_BYTES = 50 * 1024 * 1024; // 50 MB zip-bomb limit

/**
 * Validates file size, extension, MIME type, magic bytes, and structural safety.
 */
export async function validateUploadedDocument(
  buffer: Buffer,
  originalName: string,
  mimeType?: string
): Promise<'DOCX' | 'PDF'> {
  if (!buffer || buffer.length === 0) {
    throw new DocumentValidationError('Uploaded file is empty.');
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new DocumentValidationError('File size exceeds maximum limit of 25MB.');
  }

  const ext = path.extname(originalName || '').toLowerCase();
  if (ext !== '.docx' && ext !== '.pdf') {
    if (ext === '.doc') {
      throw new DocumentValidationError(
        'Legacy binary Word (.doc) files are not supported for security reasons. Please save as .docx or .pdf.'
      );
    }
    if (ext === '.docm') {
      throw new DocumentValidationError(
        'Macro-enabled Word (.docm) files are rejected for security reasons. Please upload a standard .docx or .pdf file.'
      );
    }
    throw new DocumentValidationError(
      `Unsupported file extension "${ext || 'unknown'}". Only .docx and .pdf files are allowed.`
    );
  }

  // Reject legacy OLE2 binary header (D0 CF 11 E0) disguised as .docx or .pdf
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    throw new DocumentValidationError(
      'Legacy OLE2 binary document detected. Please convert the file to standard .docx or .pdf.'
    );
  }

  // Reject Windows PE executable header (MZ)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new DocumentValidationError('Executable files are strictly prohibited.');
  }

  if (ext === '.pdf') {
    const allowedPdfMimes = [
      'application/pdf',
      'application/x-pdf',
      'application/octet-stream',
    ];
    if (mimeType && !allowedPdfMimes.includes(mimeType.toLowerCase())) {
      throw new DocumentValidationError(`Invalid MIME type "${mimeType}" for PDF upload.`);
    }

    const headStr = buffer.subarray(0, Math.min(1024, buffer.length)).toString('latin1');
    if (!headStr.includes('%PDF-')) {
      throw new DocumentValidationError(
        'Invalid or corrupted PDF file: missing %PDF- file signature.'
      );
    }

    // Scan for dangerous embedded PDF actions (/JavaScript, /S /JS, /S /Launch)
    const fullLatin = buffer.toString('latin1');
    if (
      /\/JavaScript\b/.test(fullLatin) ||
      /\/S\s*\/(?:JS|Launch)\b/.test(fullLatin)
    ) {
      throw new DocumentValidationError(
        'PDF file contains active scripts, embedded executables, or launch actions and was rejected for security.'
      );
    }

    return 'PDF';
  }

  // .docx validation
  const allowedDocxMimes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
  ];
  if (mimeType && !allowedDocxMimes.includes(mimeType.toLowerCase())) {
    throw new DocumentValidationError(`Invalid MIME type "${mimeType}" for DOCX upload.`);
  }

  // Check PK\x03\x04 ZIP magic bytes
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    throw new DocumentValidationError(
      'Invalid or corrupted DOCX file: missing OpenXML ZIP signature.'
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocumentValidationError('Corrupted DOCX archive: unable to read ZIP structure.');
  }

  const fileNames = Object.keys(zip.files);
  for (const name of fileNames) {
    if (name.includes('..') || path.isAbsolute(name)) {
      throw new DocumentValidationError('Malicious archive path traversal detected in DOCX.');
    }
    if (name.toLowerCase().includes('vbaproject.bin')) {
      throw new DocumentValidationError(
        'DOCX contains embedded VBA macros (vbaProject.bin) and was rejected for security.'
      );
    }
  }

  if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) {
    throw new DocumentValidationError(
      'Invalid DOCX file: missing required OpenXML word/document.xml structure.'
    );
  }

  return 'DOCX';
}

/**
 * Decodes XML entities safely without expanding external entities.
 */
function decodeXmlText(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Extracts text from a single <w:p> XML block.
 */
function extractParagraphTextFromXml(pXml: string): string {
  // Check for XML entity expansion attack
  if (/<!ENTITY/i.test(pXml)) {
    throw new DocumentValidationError('XML external/internal entity declarations are not allowed.');
  }

  // Replace <w:tab/> and <w:br/> with appropriate whitespace
  const withBreaks = pXml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n');

  const textMatches = withBreaks.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g);
  if (!textMatches) return '';

  const text = textMatches
    .map((m) => {
      const inner = m.replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, '');
      return decodeXmlText(inner);
    })
    .join('');

  // Check if paragraph has Word list numbering (<w:numPr>) and doesn't already start with a number/bullet
  const hasNumPr = /<w:numPr\b/.test(pXml);
  const trimmed = text.replace(/[ \t]+/g, ' ').trim();
  if (!trimmed) return '';

  if (hasNumPr && !/^(?:\d+(?:\.\d+)*[.)]?|[a-zA-Z][.)]|[•\-*])\s/.test(trimmed)) {
    return `• ${trimmed}`;
  }

  return trimmed;
}

interface ParsedTable {
  rows: string[][];
}

/**
 * Extracts rows and cells from a <w:tbl> XML block.
 */
function extractTableFromXml(tblXml: string): ParsedTable {
  const rowMatches = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  const rows: string[][] = [];

  for (const rowXml of rowMatches) {
    const cellMatches = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    const rowCells: string[] = [];
    for (const cellXml of cellMatches) {
      const pMatches = cellXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
      const cellParagraphs = pMatches
        .map((p) => extractParagraphTextFromXml(p))
        .filter((t) => t.length > 0);
      rowCells.push(cellParagraphs.join(' / '));
    }
    if (rowCells.some((c) => c.trim().length > 0)) {
      rows.push(rowCells);
    }
  }

  return { rows };
}

/**
 * Formats a parsed table into clean readable Markdown/pipe table format for SOP text fields.
 */
function formatTableAsMarkdown(table: ParsedTable): string {
  if (table.rows.length === 0) return '';

  // Deduplicate adjacent identical merged cells in a row
  const normalizedRows = table.rows.map((r) => {
    const deduped: string[] = [];
    for (const cell of r) {
      const clean = cell.replace(/\s+/g, ' ').trim();
      if (deduped.length === 0 || deduped[deduped.length - 1] !== clean || clean === '') {
        deduped.push(clean);
      }
    }
    return deduped;
  });

  const colCount = Math.max(...normalizedRows.map((r) => r.length), 1);
  const lines: string[] = [];

  normalizedRows.forEach((row, idx) => {
    const padded = Array.from({ length: colCount }, (_, i) => row[i] || '');
    lines.push(`| ${padded.join(' | ')} |`);
    if (idx === 0 && normalizedRows.length > 1) {
      lines.push(`| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`);
    }
  });

  return lines.join('\n');
}

interface DocxStructuredContent {
  headerLines: string[];
  headerTables: ParsedTable[];
  bodyElements: Array<{ type: 'paragraph'; text: string } | { type: 'table'; table: ParsedTable }>;
  footerLines: string[];
  totalTables: number;
}

/**
 * Parses a DOCX archive including word/header*.xml, word/document.xml, and word/footer*.xml.
 */
async function parseDocxArchive(buffer: Buffer): Promise<DocxStructuredContent> {
  const zip = await JSZip.loadAsync(buffer);
  let totalUncompressedBytes = 0;

  const readXmlSafe = async (filePath: string): Promise<string> => {
    const file = zip.file(filePath);
    if (!file) return '';
    const content = await file.async('string');
    totalUncompressedBytes += Buffer.byteLength(content, 'utf8');
    if (totalUncompressedBytes > MAX_UNCOMPRESSED_XML_BYTES) {
      throw new DocumentValidationError('DOCX uncompressed XML size exceeds safety limit.');
    }
    if (/<!ENTITY/i.test(content)) {
      throw new DocumentValidationError('DOCX contains disallowed XML entity declarations.');
    }
    return content;
  };

  const headerFiles = Object.keys(zip.files)
    .filter((f) => /^word\/header\d*\.xml$/i.test(f))
    .sort();
  const footerFiles = Object.keys(zip.files)
    .filter((f) => /^word\/footer\d*\.xml$/i.test(f))
    .sort();

  const headerLines: string[] = [];
  const headerTables: ParsedTable[] = [];
  let totalTables = 0;

  for (const hf of headerFiles) {
    const xml = await readXmlSafe(hf);
    const tblMatches = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
    for (const tXml of tblMatches) {
      const parsed = extractTableFromXml(tXml);
      if (parsed.rows.length > 0) {
        headerTables.push(parsed);
        totalTables++;
      }
    }
    const pMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    for (const pXml of pMatches) {
      const txt = extractParagraphTextFromXml(pXml);
      if (txt && !headerLines.includes(txt)) {
        headerLines.push(txt);
      }
    }
  }

  // Parse word/document.xml preserving top-level order of paragraphs and tables
  const docXml = await readXmlSafe('word/document.xml');
  const bodyMatch = docXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/);
  const bodyXml = bodyMatch ? bodyMatch[1] : docXml;

  const bodyElements: Array<
    { type: 'paragraph'; text: string } | { type: 'table'; table: ParsedTable }
  > = [];

  // Tokenize top-level <w:tbl> and <w:p> inside <w:body>
  const tokenRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(bodyXml)) !== null) {
    const token = match[0];
    if (token.startsWith('<w:tbl')) {
      const parsedTable = extractTableFromXml(token);
      if (parsedTable.rows.length > 0) {
        bodyElements.push({ type: 'table', table: parsedTable });
        totalTables++;
      }
    } else {
      const txt = extractParagraphTextFromXml(token);
      if (txt) {
        bodyElements.push({ type: 'paragraph', text: txt });
      }
    }
  }

  const footerLines: string[] = [];
  for (const ff of footerFiles) {
    const xml = await readXmlSafe(ff);
    const pMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    for (const pXml of pMatches) {
      const txt = extractParagraphTextFromXml(pXml);
      if (txt && !footerLines.includes(txt)) {
        footerLines.push(txt);
      }
    }
  }

  return {
    headerLines,
    headerTables,
    bodyElements,
    footerLines,
    totalTables,
  };
}

/**
 * Extracts embedded JPEG or PNG images from a raw PDF buffer for pure-Node OCR fallback when pdftoppm is unavailable.
 */
function extractEmbeddedImagesFromPdfBuffer(pdfBuffer: Buffer): Buffer[] {
  const images: Buffer[] = [];

  // 1. Find JPEG streams (FFD8FF ... FFD9)
  let offset = 0;
  while (offset < pdfBuffer.length - 4 && images.length < 10) {
    const start = pdfBuffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), offset);
    if (start === -1) break;
    const end = pdfBuffer.indexOf(Buffer.from([0xff, 0xd9]), start + 3);
    if (end === -1) break;
    const jpegBuf = pdfBuffer.subarray(start, end + 2);
    if (jpegBuf.length > 512) {
      images.push(jpegBuf);
    }
    offset = end + 2;
  }

  // 2. Find PNG streams (89 50 4E 47 0D 0A 1A 0A ... IEND)
  offset = 0;
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngFooter = Buffer.from('IEND');
  while (offset < pdfBuffer.length - 12 && images.length < 10) {
    const start = pdfBuffer.indexOf(pngHeader, offset);
    if (start === -1) break;
    const iend = pdfBuffer.indexOf(pngFooter, start + 8);
    if (iend === -1) break;
    const end = Math.min(iend + 8, pdfBuffer.length);
    const pngBuf = pdfBuffer.subarray(start, end);
    if (pngBuf.length > 256) {
      images.push(pngBuf);
    }
    offset = end;
  }

  return images;
}

/**
 * Runs OCR on a scanned PDF using either system pdftoppm + tesseract (if installed) or tesseract.js on embedded images.
 */
async function performPdfOcr(
  pdfBuffer: Buffer
): Promise<{ text: string; confidence: number; uncertainFlags: string[] }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sop-ocr-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  const uncertainFlags: string[] = [];

  try {
    await fs.promises.writeFile(pdfPath, pdfBuffer);

    let imageBuffers: Buffer[] = [];

    // Try rendering pages via pdftoppm if available (Linux/Alpine Docker or poppler installed)
    try {
      const outPrefix = path.join(tmpDir, 'page');
      await execFileAsync('pdftoppm', ['-png', '-r', '200', pdfPath, outPrefix], {
        timeout: 30000,
      });
      const files = (await fs.promises.readdir(tmpDir))
        .filter((f) => f.startsWith('page') && f.endsWith('.png'))
        .sort();
      for (const f of files.slice(0, 10)) {
        imageBuffers.push(await fs.promises.readFile(path.join(tmpDir, f)));
      }
    } catch {
      // pdftoppm not installed on host; extract embedded JPEG/PNG images directly from PDF
      imageBuffers = extractEmbeddedImagesFromPdfBuffer(pdfBuffer);
    }

    if (imageBuffers.length === 0) {
      return { text: '', confidence: 0, uncertainFlags: ['No readable text or scanned page images found in PDF.'] };
    }

    const pageTexts: string[] = [];
    const confidences: number[] = [];

    for (let i = 0; i < imageBuffers.length; i++) {
      let pageText = '';
      let pageConf = 82;

      // Try fast native tesseract CLI first if installed (e.g., Alpine Docker production container)
      const imgPath = path.join(tmpDir, `ocr_input_${i}.png`);
      await fs.promises.writeFile(imgPath, imageBuffers[i]);

      let usedCli = false;
      try {
        const { stdout } = await execFileAsync('tesseract', [imgPath, 'stdout', '-l', 'eng'], {
          timeout: 25000,
        });
        if (stdout && stdout.trim().length > 0) {
          pageText = stdout.trim();
          pageConf = 85;
          usedCli = true;
        }
      } catch {
        usedCli = false;
      }

      if (!usedCli) {
        const Tesseract = await import('tesseract.js');
        const result = await Tesseract.recognize(imageBuffers[i], 'eng');
        pageText = result?.data?.text?.trim() || '';
        pageConf =
          typeof result?.data?.confidence === 'number' ? result.data.confidence : 65;
      }

      if (pageText) {
        pageTexts.push(pageText);
        confidences.push(pageConf);
      }

      if (pageConf < 75) {
        uncertainFlags.push(
          `Page ${i + 1} had low OCR confidence (${Math.round(pageConf)}%). Please verify extracted text against the original scan.`
        );
      }
    }

    const avgConfidence =
      confidences.length > 0
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 0;

    return {
      text: pageTexts.join('\n\n'),
      confidence: avgConfidence,
      uncertainFlags,
    };
  } finally {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
}

/**
 * Normalizes various human date strings (e.g. "October 6, 2026", "2026-10-07", "09/29/2026") into YYYY-MM-DD.
 * Returns null if the string cannot be reliably parsed as a valid date. Never invents a date.
 */
export function normalizeExtractedDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^(?:Effective Date|Issue Date|Review Date|Date)\s*:?\s*/i, '')
    .replace(/(\d+)(?:st|nd|rd|th)\b/gi, '$1')
    .trim();

  if (!cleaned || /^(?:N\/?A|TBD|NONE|-+)$/i.test(cleaned)) {
    return null;
  }

  // ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleaned.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Month Name DD, YYYY (e.g., "October 6, 2026", "Sept 29, 2026", "6 October 2026")
  const months: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  const monthFirstMatch = cleaned.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthFirstMatch) {
    const m = months[monthFirstMatch[1].toLowerCase()];
    const d = parseInt(monthFirstMatch[2], 10);
    const y = parseInt(monthFirstMatch[3], 10);
    if (m && y >= 1990 && y <= 2100 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const dayFirstMatch = cleaned.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (dayFirstMatch) {
    const d = parseInt(dayFirstMatch[1], 10);
    const m = months[dayFirstMatch[2].toLowerCase()];
    const y = parseInt(dayFirstMatch[3], 10);
    if (m && y >= 1990 && y <= 2100 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // MM/DD/YYYY
  const slashMatch = cleaned.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    const first = parseInt(slashMatch[1], 10);
    const second = parseInt(slashMatch[2], 10);
    const y = parseInt(slashMatch[3], 10);
    const m = first <= 12 ? first : second;
    const d = first <= 12 ? second : first;
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

type SectionKey =
  | 'purpose'
  | 'scope'
  | 'responsibilities'
  | 'materialsAndEquipment'
  | 'definitions'
  | 'procedure'
  | 'relatedForms'
  | 'references'
  | 'revisionHistory'
  | 'end';

/**
 * Detects whether a line is a major SOP section heading and returns the canonical section key + optional inline remainder.
 */
function matchMajorSectionHeading(line: string): {
  key: SectionKey;
  inlineText?: string;
} | null {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > 120) return null;

  // Reject sub-numbered paragraphs like "2.1 This SOP...", "5.1.1 Something"
  if (/^\d+\.\d+/.test(trimmed)) {
    return null;
  }

  // Strip optional leading section number (e.g., "1.", "2.", "I.", "II.", "SECTION 1:", "1.0")
  const headingMatch = trimmed.match(
    /^(?:(?:SECTION\s+)?(?:\d+(?:\.0)?|[IVX]+)[.):\-\s]+)?([A-Z][A-Za-z\s/&()-]{2,60}?)(?:\s*[:\-–]\s*(.*))?$/i
  );
  if (!headingMatch) return null;

  const rawLabel = headingMatch[1].trim().toUpperCase();
  const inlineRemainder = headingMatch[2]?.trim() || undefined;

  // Check if the line was either numbered ("1. PURPOSE") or all-caps ("PURPOSE") or had a colon ("Purpose: ...")
  const isNumbered = /^(?:SECTION\s+)?(?:\d+(?:\.0)?|[IVX]+)[.):\-\s]+/i.test(trimmed);
  const isAllCaps = headingMatch[1].trim() === rawLabel;
  const hasColon = inlineRemainder !== undefined || trimmed.endsWith(':');

  if (!isNumbered && !isAllCaps && !hasColon) {
    return null;
  }

  // Avoid false positives on sentences
  if (rawLabel.split(/\s+/).length > 6) {
    return null;
  }

  if (
    /^(?:PURPOSE|OBJECTIVE|OBJECTIVES|PURPOSE\s*(?:AND|&)\s*OBJECTIVES?|PURPOSE\s*(?:AND|&)\s*SCOPE)$/.test(
      rawLabel
    )
  ) {
    return { key: 'purpose', inlineText: inlineRemainder };
  }

  if (/^(?:SCOPE|APPLICABILITY|SCOPE\s*(?:AND|&)\s*APPLICABILITY)$/.test(rawLabel)) {
    return { key: 'scope', inlineText: inlineRemainder };
  }

  if (
    /^(?:RESPONSIBILITY|RESPONSIBILITIES|ROLES\s*(?:AND|&)\s*RESPONSIBILITIES|DUTIES\s*(?:AND|&)\s*RESPONSIBILITIES|PERSONNEL\s*RESPONSIBILITIES)$/.test(
      rawLabel
    )
  ) {
    return { key: 'responsibilities', inlineText: inlineRemainder };
  }

  if (
    /^(?:MATERIALS?|EQUIPMENT|MATERIALS?\s*(?:AND|&|\/)\s*EQUIPMENT|TOOLS\s*(?:AND|&)\s*EQUIPMENT|REAGENTS\s*(?:AND|&)\s*MATERIALS?)$/.test(
      rawLabel
    )
  ) {
    return { key: 'materialsAndEquipment', inlineText: inlineRemainder };
  }

  if (
    /^(?:DEFINITIONS?|ABBREVIATIONS?|TERMS\s*(?:AND|&)\s*DEFINITIONS?|GLOSSARY|SAFETY\s*PRECAUTIONS?|PRECAUTIONS?)$/.test(
      rawLabel
    )
  ) {
    return { key: 'definitions', inlineText: inlineRemainder };
  }

  if (
    /^(?:PROCEDURES?|OPERATING\s*PROCEDURES?|STEP-BY-STEP\s*PROCEDURES?|WORK\s*INSTRUCTIONS?|METHODOLOGY|PROCESS\s*FLOW|DETAILED\s*PROCEDURE)$/.test(
      rawLabel
    )
  ) {
    return { key: 'procedure', inlineText: inlineRemainder };
  }

  if (
    /^(?:RECORDS?|ATTACHMENTS?|RELATED\s*FORMS?|FORMS?\s*(?:AND|&)\s*RECORDS?|FORMS?|APPENDICES|APPENDIX|DOCUMENTATION|RECORDS?\s*(?:AND|&)\s*ATTACHMENTS?)$/.test(
      rawLabel
    )
  ) {
    return { key: 'relatedForms', inlineText: inlineRemainder };
  }

  if (
    /^(?:REFERENCES?|REFERENCE\/S|RELATED\s*DOCUMENTS?|NORMATIVE\s*REFERENCES?|STANDARDS?|APPLICABLE\s*DOCUMENTS?)$/.test(
      rawLabel
    )
  ) {
    return { key: 'references', inlineText: inlineRemainder };
  }

  if (
    /^(?:REASON\/?S?\s*FOR\s*REVISION|DOCUMENT\s*HISTORY|REVISION\s*HISTORY|CHANGE\s*HISTORY)$/.test(
      rawLabel
    )
  ) {
    return { key: 'revisionHistory', inlineText: inlineRemainder };
  }

  if (
    /^(?:END|END\s*OF\s*DOCUMENT|END\s*OF\s*SOP|APPROVALS?|SIGNATURES?|DOCUMENT\s*APPROVAL)$/.test(
      rawLabel
    )
  ) {
    return { key: 'end' };
  }

  return null;
}

/**
 * Resolves the best matching Department from the database based on SOP number code prefix or explicit department text.
 */
async function matchDepartmentFromDatabase(
  sopNumber: string | null,
  explicitDepartmentText: string | null,
  fullHeaderText: string
): Promise<{
  id: string | null;
  name: string | null;
  code: string | null;
  confidence: FieldConfidence;
}> {
  const departments = await prisma.department.findMany({
    select: { id: true, name: true, code: true },
  });

  if (departments.length === 0) {
    return { id: null, name: null, code: null, confidence: 'MISSING' };
  }

  // Extract department code token from SOP number e.g. SOP-QAD-006 -> QAD
  let sopDeptToken: string | null = null;
  if (sopNumber) {
    const m = sopNumber.toUpperCase().match(/^SOP-([A-Z]{2,6})-\d+/);
    if (m) sopDeptToken = m[1];
  }

  // Common manufacturing department code aliases (e.g., QAD <-> QA, QCD <-> QC, WHD <-> WH)
  const codeAliases: Record<string, string[]> = {
    QAD: ['QAD', 'QA', 'QUALITY ASSURANCE'],
    QA: ['QA', 'QAD', 'QUALITY ASSURANCE'],
    QCD: ['QCD', 'QC', 'QUALITY CONTROL'],
    QC: ['QC', 'QCD', 'QUALITY CONTROL'],
    PRD: ['PRD', 'PROD', 'PRODUCTION', 'MANUFACTURING'],
    PROD: ['PROD', 'PRD', 'PRODUCTION', 'MANUFACTURING'],
    WHD: ['WHD', 'WH', 'WHS', 'WAREHOUSE', 'LOGISTICS'],
    WH: ['WH', 'WHD', 'WHS', 'WAREHOUSE', 'LOGISTICS'],
    ENG: ['ENG', 'ENGINEERING', 'MAINTENANCE'],
    HRD: ['HRD', 'HR', 'HUMAN RESOURCES', 'ADMIN'],
    HR: ['HR', 'HRD', 'HUMAN RESOURCES'],
    RND: ['RND', 'RD', 'R&D', 'RESEARCH'],
  };

  if (sopDeptToken) {
    // 1. Exact code match
    const exact = departments.find((d) => d.code.toUpperCase() === sopDeptToken);
    if (exact) {
      return { id: exact.id, name: exact.name, code: exact.code, confidence: 'HIGH' };
    }

    // 2. Prefix/alias match (e.g., QAD matches QA or Quality Assurance)
    const candidateAliases = codeAliases[sopDeptToken] || [
      sopDeptToken,
      sopDeptToken.replace(/D$/, ''),
    ];
    const aliasMatch = departments.find((d) => {
      const dCode = d.code.toUpperCase();
      const dName = d.name.toUpperCase();
      return (
        candidateAliases.includes(dCode) ||
        candidateAliases.some((a) => a.length >= 4 && dName.includes(a)) ||
        (dCode.length >= 2 && sopDeptToken!.startsWith(dCode))
      );
    });
    if (aliasMatch) {
      return {
        id: aliasMatch.id,
        name: aliasMatch.name,
        code: aliasMatch.code,
        confidence: 'HIGH',
      };
    }
  }

  // 3. Explicit department text in document
  if (explicitDepartmentText) {
    const cleanTarget = explicitDepartmentText.toUpperCase().trim();
    const byExplicit = departments.find(
      (d) =>
        d.code.toUpperCase() === cleanTarget ||
        d.name.toUpperCase() === cleanTarget ||
        cleanTarget.includes(d.name.toUpperCase()) ||
        d.name.toUpperCase().includes(cleanTarget)
    );
    if (byExplicit) {
      return {
        id: byExplicit.id,
        name: byExplicit.name,
        code: byExplicit.code,
        confidence: 'HIGH',
      };
    }
  }

  // 4. Check header text for department names
  const upperHeader = fullHeaderText.toUpperCase();
  for (const dept of departments) {
    if (dept.name.length >= 4 && upperHeader.includes(dept.name.toUpperCase())) {
      return { id: dept.id, name: dept.name, code: dept.code, confidence: 'MEDIUM' };
    }
  }

  return { id: null, name: null, code: sopDeptToken, confidence: 'MISSING' };
}

/**
 * Parses metadata and body sections from structured lines & tables.
 */
async function extractAndMapSOPContent(params: {
  fileName: string;
  fileSize: number;
  fileType: 'DOCX' | 'PDF';
  pageCount: number;
  extractionMethod: ExtractionMethod;
  ocrConfidence: number | null;
  uncertainFlags: string[];
  headerLines: string[];
  headerTables: ParsedTable[];
  bodyElements: Array<{ type: 'paragraph'; text: string } | { type: 'table'; table: ParsedTable }>;
  totalTables: number;
}): Promise<DocumentImportResult> {
  const {
    fileName,
    fileSize,
    fileType,
    pageCount,
    extractionMethod,
    ocrConfidence,
    uncertainFlags,
    headerLines,
    headerTables,
    bodyElements,
    totalTables,
  } = params;

  const warnings: string[] = [...uncertainFlags];

  if (extractionMethod === 'OCR') {
    warnings.unshift(
      'Scanned PDF detected: Text was extracted via Optical Character Recognition (OCR). Please verify all extracted fields, numbers, and dates before saving.'
    );
  }

  // Flatten all text for metadata scanning
  const allBodyLines: string[] = [];
  for (const el of bodyElements) {
    if (el.type === 'paragraph') {
      allBodyLines.push(el.text);
    } else {
      for (const r of el.table.rows) {
        allBodyLines.push(r.join(' | '));
      }
    }
  }

  const combinedHeaderText = [
    ...headerLines,
    ...headerTables.flatMap((t) => t.rows.map((r) => r.join(' | '))),
  ].join('\n');
  const firstLinesText = [...headerLines, ...allBodyLines.slice(0, 45)].join('\n');

  // 1. Extract SOP Number (Document No.)
  let sopNumber: string | null = null;
  let sopNumberConfidence: FieldConfidence = 'MISSING';

  // Priority A: Explicit label "Document No.: SOP-QAD-006" or next line after "Document No.:"
  const allScanLines = [...headerLines, ...allBodyLines.slice(0, 40)];
  for (let i = 0; i < allScanLines.length; i++) {
    const line = allScanLines[i];
    const inlineMatch = line.match(
      /(?:Document\s*(?:No\.?|Number|Code|ID)|Doc\.?\s*No\.?|SOP\s*(?:No\.?|Number|Code))\s*[:\-]?\s*([A-Z]{2,6}-[A-Z0-9]{2,8}-\d{2,5}(?:-[A-Z0-9]+)?)/i
    );
    if (inlineMatch) {
      sopNumber = inlineMatch[1].toUpperCase();
      sopNumberConfidence = 'HIGH';
      break;
    }
    if (/^(?:Document\s*(?:No\.?|Number|Code)|Doc\.?\s*No\.?)\s*:?$/i.test(line.trim())) {
      const nextLine = allScanLines[i + 1]?.trim();
      if (nextLine && /^[A-Z]{2,6}-[A-Z0-9]{2,8}-\d{2,5}/i.test(nextLine)) {
        sopNumber = nextLine.match(/^([A-Z]{2,6}-[A-Z0-9]{2,8}-\d{2,5}(?:-[A-Z0-9]+)?)/i)![1].toUpperCase();
        sopNumberConfidence = 'HIGH';
        break;
      }
    }
  }

  // Priority B: Standalone SOP-XXX-NNN pattern in header or top of document
  if (!sopNumber) {
    const standaloneMatch = firstLinesText.match(/\b(SOP-[A-Z]{2,6}-\d{2,5}(?:-[A-Z0-9]+)?)\b/i);
    if (standaloneMatch) {
      sopNumber = standaloneMatch[1].toUpperCase();
      sopNumberConfidence = 'HIGH';
    }
  }

  // 2. Extract Title
  let title: string | null = null;
  let titleConfidence: FieldConfidence = 'MISSING';

  // Priority A: Explicit label "Title: ..." or "Procedure Title: ..." or "Subject: ..."
  for (let i = 0; i < allScanLines.length; i++) {
    const line = allScanLines[i].trim();
    const explicitTitle = line.match(
      /^(?:Procedure\s*Title|Document\s*Title|SOP\s*Title|Subject|Title)\s*[:\-]\s*(.+)$/i
    );
    if (explicitTitle && explicitTitle[1].trim().length >= 4) {
      const candidate = explicitTitle[1].trim();
      if (!/^(?:STANDARD OPERATING PROCEDURE|N\/A)$/i.test(candidate)) {
        title = candidate;
        titleConfidence = 'HIGH';
        break;
      }
    }
  }

  // Priority B: In NKB Manufacturing header, the line immediately following "STANDARD OPERATING PROCEDURES"
  if (!title) {
    for (let i = 0; i < allScanLines.length; i++) {
      const line = allScanLines[i].trim();
      if (/^STANDARD\s+OPERATING\s+PROCEDURES?$/i.test(line)) {
        for (let j = i + 1; j < Math.min(i + 4, allScanLines.length); j++) {
          const next = allScanLines[j].trim();
          if (
            next.length >= 4 &&
            !/^(?:Document\s*No|Revision\s*No|Issue\s*Date|Effective\s*Date|Page\s*\d|SOP-[A-Z])/i.test(
              next
            )
          ) {
            title = next;
            titleConfidence = 'HIGH';
            break;
          }
        }
        if (title) break;
      }
    }
  }

  // Priority C: First non-metadata prominent line before Section 1
  if (!title) {
    for (const line of allScanLines.slice(0, 15)) {
      const clean = line.trim();
      if (
        clean.length >= 6 &&
        clean.length <= 140 &&
        !matchMajorSectionHeading(clean) &&
        !/^(?:NKB\s+MANUFACTURING|STANDARD\s+OPERATING|DOCUMENT\s+NO|REVISION|EFFECTIVE\s+DATE|ISSUE\s+DATE|REVIEW\s+DATE|PAGE\s+\d|REASON\/?S?\s+FOR|S\/NO\b)/i.test(
          clean
        ) &&
        !/^SOP-[A-Z]{2,6}-\d+/i.test(clean)
      ) {
        title = clean;
        titleConfidence = 'MEDIUM';
        break;
      }
    }
  }

  // 3. Extract Dates & Revision No. from header/top lines
  let effectiveDate: string | null = null;
  let reviewDate: string | null = null;
  let issueDate: string | null = null;
  let revisionNumber: string | null = null;
  let explicitDeptText: string | null = null;

  for (let i = 0; i < allScanLines.length; i++) {
    const line = allScanLines[i].trim();
    const nextLine = allScanLines[i + 1]?.trim() || '';

    // Effective Date
    const effInline = line.match(/Effective\s*Date\s*[:\-]?\s*(.+)$/i);
    if (effInline && !effectiveDate) {
      effectiveDate =
        normalizeExtractedDate(effInline[1]) ||
        (effInline[1].trim() === '' ? normalizeExtractedDate(nextLine) : null);
    } else if (/^Effective\s*Date\s*:?$/i.test(line) && !effectiveDate) {
      effectiveDate = normalizeExtractedDate(nextLine);
    }

    // Review Date
    const revDateInline = line.match(/(?:Review|Next\s*Review)\s*Date\s*[:\-]?\s*(.+)$/i);
    if (revDateInline && !reviewDate) {
      reviewDate =
        normalizeExtractedDate(revDateInline[1]) ||
        (revDateInline[1].trim() === '' ? normalizeExtractedDate(nextLine) : null);
    } else if (/^(?:Review|Next\s*Review)\s*Date\s*:?$/i.test(line) && !reviewDate) {
      reviewDate = normalizeExtractedDate(nextLine);
    }

    // Issue Date
    const issInline = line.match(/Issue\s*Date\s*[:\-]?\s*(.+)$/i);
    if (issInline && !issueDate) {
      issueDate =
        normalizeExtractedDate(issInline[1]) ||
        (issInline[1].trim() === '' ? normalizeExtractedDate(nextLine) : null);
    } else if (/^Issue\s*Date\s*:?$/i.test(line) && !issueDate) {
      issueDate = normalizeExtractedDate(nextLine);
    }

    // Revision No
    const revNoInline = line.match(/Revision\s*(?:No\.?|Number|#)\s*[:\-]?\s*([A-Za-z0-9.]+)/i);
    if (revNoInline && !revisionNumber) {
      revisionNumber = revNoInline[1].trim();
    } else if (/^Revision\s*(?:No\.?|Number|#)\s*:?$/i.test(line) && !revisionNumber) {
      if (/^[0-9A-Za-z.]{1,10}$/.test(nextLine)) {
        revisionNumber = nextLine;
      }
    }

    // Explicit Department
    const deptInline = line.match(/^(?:Owner\s*)?Department\s*[:\-]\s*(.+)$/i);
    if (deptInline && !explicitDeptText) {
      explicitDeptText = deptInline[1].trim();
    }
  }

  // 4. Parse Revision History table & Body Sections
  const revisionHistory: RevisionHistoryEntry[] = [];
  let revisionReason: string | null = null;
  let changeSummary: string | null = null;

  const sectionBuckets: Record<SectionKey, string[]> = {
    purpose: [],
    scope: [],
    responsibilities: [],
    materialsAndEquipment: [],
    definitions: [],
    procedure: [],
    relatedForms: [],
    references: [],
    revisionHistory: [],
    end: [],
  };

  let currentSection: SectionKey | null = null;

  for (const element of bodyElements) {
    if (element.type === 'table') {
      const rows = element.table.rows;
      const flatFirstTwoRows = rows
        .slice(0, 2)
        .map((r) => r.join(' ').toUpperCase())
        .join(' ');

      // Check if this table is the REASON/S FOR REVISION / DOCUMENT HISTORY table
      if (
        flatFirstTwoRows.includes('REASON') ||
        flatFirstTwoRows.includes('DOCUMENT HISTORY') ||
        (flatFirstTwoRows.includes('S/NO') && flatFirstTwoRows.includes('REV'))
      ) {
        for (const r of rows) {
          const joined = r.join(' ').toUpperCase();
          if (
            joined.includes('REASON/S FOR REVISION') ||
            joined.includes('DOCUMENT HISTORY') ||
            (joined.includes('S/NO') && joined.includes('DATE'))
          ) {
            continue;
          }
          const nonEmpty = r.map((c) => c.trim()).filter(Boolean);
          if (nonEmpty.length >= 2) {
            revisionHistory.push({
              serialNo: r[0]?.trim() || '',
              description: r[1]?.trim() || '',
              revision: r[2]?.trim() || '',
              date: r[3]?.trim() || '',
              section: r[4]?.trim() || '',
              author: r[5]?.trim() || '',
            });
          }
        }
        continue;
      }

      // Check if this table is a duplicate document header block inside body
      if (
        flatFirstTwoRows.includes('STANDARD OPERATING PROCEDURE') &&
        flatFirstTwoRows.includes('DOCUMENT NO')
      ) {
        continue;
      }

      // Check if rows inside the table actually contain major section headings (some SOP templates put sections inside table rows)
      let tableHandledAsSections = false;
      for (const r of rows) {
        if (r.length === 1 || r.length === 2) {
          const firstCellHeading = matchMajorSectionHeading(r[0]);
          if (firstCellHeading) {
            tableHandledAsSections = true;
            currentSection = firstCellHeading.key;
            if (firstCellHeading.inlineText) {
              sectionBuckets[currentSection].push(firstCellHeading.inlineText);
            }
            if (r[1]?.trim()) {
              sectionBuckets[currentSection].push(r[1].trim());
            }
            continue;
          }
        }
        if (tableHandledAsSections && currentSection && currentSection !== 'end') {
          sectionBuckets[currentSection].push(r.filter(Boolean).join(' — '));
        }
      }

      if (!tableHandledAsSections && currentSection && currentSection !== 'end') {
        const mdTable = formatTableAsMarkdown(element.table);
        if (mdTable) {
          sectionBuckets[currentSection].push(mdTable);
        }
      }
      continue;
    }

    // Paragraph element
    const line = element.text.trim();
    if (!line) continue;

    const heading = matchMajorSectionHeading(line);
    if (heading) {
      currentSection = heading.key;
      if (heading.inlineText && currentSection !== 'end') {
        sectionBuckets[currentSection].push(heading.inlineText);
      }
      continue;
    }

    if (currentSection === 'end') {
      continue;
    }

    if (currentSection) {
      sectionBuckets[currentSection].push(line);
    }
  }

  if (revisionHistory.length > 0) {
    const latestRev = revisionHistory[revisionHistory.length - 1];
    if (latestRev.description) {
      revisionReason = latestRev.description;
      changeSummary = `${latestRev.description}${latestRev.section && latestRev.section !== 'NA' ? ` (Section: ${latestRev.section})` : ''}`;
    }
  } else if (sectionBuckets.revisionHistory.length > 0) {
    revisionReason = sectionBuckets.revisionHistory.join('\n').trim();
  }

  // Merge Definitions and Materials & Equipment into Procedure if present, while also exposing them in extraSections
  const materialsText =
    sectionBuckets.materialsAndEquipment.length > 0
      ? sectionBuckets.materialsAndEquipment.join('\n').trim()
      : null;
  const definitionsText =
    sectionBuckets.definitions.length > 0
      ? sectionBuckets.definitions.join('\n').trim()
      : null;

  const procedureParts: string[] = [];
  if (definitionsText) {
    procedureParts.push(`DEFINITIONS & PRECAUTIONS:\n${definitionsText}`);
  }
  if (materialsText) {
    procedureParts.push(`MATERIALS & EQUIPMENT:\n${materialsText}`);
  }
  if (sectionBuckets.procedure.length > 0) {
    procedureParts.push(sectionBuckets.procedure.join('\n').trim());
  }

  const cleanSection = (lines: string[]): string | null => {
    const joined = lines.join('\n').trim();
    return joined.length > 0 ? joined : null;
  };

  const purpose = cleanSection(sectionBuckets.purpose);
  const scope = cleanSection(sectionBuckets.scope);
  const responsibilities = cleanSection(sectionBuckets.responsibilities);
  const procedure = procedureParts.length > 0 ? procedureParts.join('\n\n') : null;
  const relatedForms = cleanSection(sectionBuckets.relatedForms);
  const references = cleanSection(sectionBuckets.references);

  // Match Department against database
  const matchedDept = await matchDepartmentFromDatabase(
    sopNumber,
    explicitDeptText,
    firstLinesText
  );

  if (!matchedDept.id && matchedDept.code) {
    warnings.push(
      `Document references department code "${matchedDept.code}", which did not match an existing department in the system. Please select the Owner Department manually.`
    );
  }

  // Check if SOP Number already exists in database
  let duplicateSop: DocumentImportResult['duplicateSop'] = null;
  if (sopNumber) {
    const existing = await prisma.sOP.findUnique({
      where: { sopNumber },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });
    if (existing) {
      duplicateSop = {
        id: existing.id,
        sopNumber: existing.sopNumber,
        title: existing.versions[0]?.title || existing.sopNumber,
        status: existing.versions[0]?.status || 'DRAFT',
      };
      warnings.push(
        `Duplicate Document Number detected: "${sopNumber}" already exists in the system ("${duplicateSop.title}", Status: ${duplicateSop.status}). Creating a new SOP requires a unique SOP Number or creating a new revision on the existing SOP.`
      );
    }
  }

  // Calculate per-field confidence
  const confidenceForText = (val: string | null, minHighLen = 20): FieldConfidence => {
    if (!val) return 'MISSING';
    if (extractionMethod === 'OCR' && (ocrConfidence ?? 0) < 75) return 'LOW';
    if (extractionMethod === 'OCR') return 'MEDIUM';
    return val.length >= minHighLen ? 'HIGH' : 'MEDIUM';
  };

  const fields: ExtractedSOPFields = {
    sopNumber,
    title,
    departmentId: matchedDept.id,
    departmentName: matchedDept.name,
    departmentCode: matchedDept.code,
    category: 'Standard Operating Procedure',
    purpose,
    scope,
    responsibilities,
    procedure,
    relatedForms,
    references,
    effectiveDate,
    reviewDate,
    issueDate,
    revisionNumber,
    revisionReason,
    changeSummary,
  };

  const fieldConfidence: Record<keyof ExtractedSOPFields, FieldConfidence> = {
    sopNumber: extractionMethod === 'OCR' && sopNumber ? 'MEDIUM' : sopNumberConfidence,
    title: extractionMethod === 'OCR' && title ? 'MEDIUM' : titleConfidence,
    departmentId: matchedDept.confidence,
    departmentName: matchedDept.confidence,
    departmentCode: matchedDept.code ? 'HIGH' : 'MISSING',
    category: 'HIGH',
    purpose: confidenceForText(purpose, 20),
    scope: confidenceForText(scope, 15),
    responsibilities: confidenceForText(responsibilities, 20),
    procedure: confidenceForText(procedure, 40),
    relatedForms: confidenceForText(relatedForms, 3),
    references: confidenceForText(references, 3),
    effectiveDate: effectiveDate ? (extractionMethod === 'OCR' ? 'MEDIUM' : 'HIGH') : 'MISSING',
    reviewDate: reviewDate ? (extractionMethod === 'OCR' ? 'MEDIUM' : 'HIGH') : 'MISSING',
    issueDate: issueDate ? (extractionMethod === 'OCR' ? 'MEDIUM' : 'HIGH') : 'MISSING',
    revisionNumber: revisionNumber ? 'HIGH' : 'MISSING',
    revisionReason: revisionReason ? 'HIGH' : 'MISSING',
    changeSummary: changeSummary ? 'HIGH' : 'MISSING',
  };

  // Required SOP form fields check
  const requiredMap: Array<{ key: keyof ExtractedSOPFields; label: string }> = [
    { key: 'title', label: 'SOP Title' },
    { key: 'departmentId', label: 'Owner Department' },
    { key: 'purpose', label: '1.0 Purpose' },
    { key: 'scope', label: '2.0 Scope' },
    { key: 'responsibilities', label: '3.0 Responsibilities' },
    { key: 'procedure', label: '4.0 Step-by-Step Procedure' },
  ];

  const missingRequiredFields: string[] = [];
  for (const req of requiredMap) {
    const val = fields[req.key];
    if (!val || val.trim().length < 5) {
      missingRequiredFields.push(req.label);
    }
  }

  if (missingRequiredFields.length > 0) {
    warnings.push(
      `Some required SOP fields could not be automatically extracted or are incomplete: ${missingRequiredFields.join(', ')}. Please review and complete them before saving.`
    );
  }

  const sourcePreviewText = [
    ...(combinedHeaderText ? ['=== DOCUMENT HEADER ===', combinedHeaderText] : []),
    '=== DOCUMENT BODY ===',
    ...allBodyLines,
  ]
    .join('\n')
    .slice(0, 15000);

  return {
    fileName,
    fileSize,
    fileType,
    pageCount,
    extractionMethod,
    ocrConfidence,
    fields,
    fieldConfidence,
    missingRequiredFields,
    warnings,
    uncertainTextFlags: uncertainFlags,
    duplicateSop,
    revisionHistory,
    extraSections: {
      materialsAndEquipment: materialsText,
      definitions: definitionsText,
    },
    tablesExtracted: totalTables,
    sourcePreviewText,
  };
}

/**
 * Main entry point to parse and map an uploaded .docx or .pdf SOP document.
 */
export async function importAndExtractSOPDocument(
  buffer: Buffer,
  originalName: string,
  mimeType?: string
): Promise<DocumentImportResult> {
  const fileType = await validateUploadedDocument(buffer, originalName, mimeType);

  if (fileType === 'DOCX') {
    const docx = await parseDocxArchive(buffer);
    return extractAndMapSOPContent({
      fileName: originalName,
      fileSize: buffer.length,
      fileType: 'DOCX',
      pageCount: 1,
      extractionMethod: 'DETERMINISTIC',
      ocrConfidence: null,
      uncertainFlags: [],
      headerLines: docx.headerLines,
      headerTables: docx.headerTables,
      bodyElements: docx.bodyElements,
      totalTables: docx.totalTables,
    });
  }

  // PDF Processing (Text-based + OCR fallback for scanned PDFs)
  let rawPdfText = '';
  let pageCount = 1;
  let pdfParseFailed = false;

  try {
    // Copy into an isolated Uint8Array with offset 0 to protect against pdf.js
    // reading from index 0 of shared Node buffer pool slabs (avoiding bad XRef entry)
    const cleanPdfBytes = new Uint8Array(buffer.byteLength);
    cleanPdfBytes.set(buffer);
    const parsedPdf = await pdfParse(cleanPdfBytes);
    rawPdfText = parsedPdf.text || '';
    pageCount = parsedPdf.numpages || 1;
  } catch {
    pdfParseFailed = true;
  }

  const nonWhitespaceCount = rawPdfText.replace(/\s+/g, '').length;
  const avgCharsPerPage = nonWhitespaceCount / Math.max(pageCount, 1);

  let extractionMethod: ExtractionMethod = 'DETERMINISTIC';
  let ocrConfidence: number | null = null;
  let uncertainFlags: string[] = [];
  let effectiveText = rawPdfText;

  // If text layer failed or has very little selectable text (< 40 chars/page), trigger OCR fallback for scanned PDF
  if (pdfParseFailed || avgCharsPerPage < 40) {
    extractionMethod = 'OCR';
    const ocrResult = await performPdfOcr(buffer);
    if (ocrResult.text.trim().length > nonWhitespaceCount) {
      effectiveText = ocrResult.text;
    }
    ocrConfidence = ocrResult.confidence;
    uncertainFlags = ocrResult.uncertainFlags;
  }

  const lines = effectiveText
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0 && !/^Page\s+\d+\s+of\s+\d+$/i.test(l));

  const bodyElements: Array<
    { type: 'paragraph'; text: string } | { type: 'table'; table: ParsedTable }
  > = lines.map((text) => ({ type: 'paragraph', text }));

  return extractAndMapSOPContent({
    fileName: originalName,
    fileSize: buffer.length,
    fileType: 'PDF',
    pageCount,
    extractionMethod,
    ocrConfidence,
    uncertainFlags,
    headerLines: lines.slice(0, 12),
    headerTables: [],
    bodyElements,
    totalTables: 0,
  });
}
