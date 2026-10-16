import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-ignore
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import app from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/prisma/client';
import { Roles, SOPStatuses } from '../src/types';

/**
 * Helper to generate a real OpenXML .docx buffer matching NKB Manufacturing's SOP format
 * (including word/header1.xml with title, Document No., Revision No., Effective Date,
 * and word/document.xml with Document History table, numbered sections, and content table).
 */
async function createTestDocxBuffer(options: {
  headerXml?: string;
  bodyXml: string;
  includeMacroFile?: boolean;
}): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`
  );

  if (options.headerXml) {
    zip.file('word/header1.xml', options.headerXml);
  }

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${options.bodyXml}
  </w:body>
</w:document>`
  );

  if (options.includeMacroFile) {
    zip.file('word/vbaProject.bin', Buffer.from('FAKE_MACRO_BINARY'));
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Helper to generate a real multi-page text-based PDF buffer using PDFKit.
 */
async function createTextPdfBuffer(): Promise<Buffer> {
  const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', 'test_sop_multipage.pdf');
  if (fs.existsSync(fixturePath)) {
    return fs.promises.readFile(fixturePath);
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const addLine = (txt: string, size?: number) => {
      if (size) doc.fontSize(size);
      doc.text(txt, { width: 350 });
    };

    addLine('STANDARD OPERATING PROCEDURES', 14);
    addLine('Raw Material Sampling and Incoming Quarantine Control', 12);
    addLine('Document No.: SOP-QCD-099', 10);
    addLine('Revision No.: 001');
    addLine('Issue Date: October 1, 2026');
    addLine('Effective Date: October 15, 2026');
    addLine('Review Date: October 15, 2027');
    doc.moveDown();

    addLine('1. PURPOSE');
    addLine(
      '1.1 To establish a standardized procedure for sampling, quarantine, and laboratory release of incoming raw materials.'
    );
    doc.moveDown();

    addLine('2. SCOPE');
    addLine(
      '2.1 This procedure applies to all Quality Control inspectors and Warehouse receiving staff at NKB Manufacturing.'
    );
    doc.moveDown();

    addLine('3. RESPONSIBILITIES');
    addLine(
      '3.1 QC Inspector: Performs statistical sampling and attaches Quarantine Hold tags.'
    );
    addLine('3.2 QC Supervisor: Reviews analytical results and issues disposition.');
    doc.moveDown();

    // Add Page 2 to test multi-page PDF extraction
    doc.addPage();
    addLine('4. MATERIALS AND EQUIPMENT');
    addLine('4.1 Sterile stainless steel sampling thief, tamper-evident sample bags.');
    doc.moveDown();

    addLine('5. PROCEDURE');
    addLine('5.1 Verify supplier Certificate of Analysis (CoA) upon delivery.');
    addLine('5.2 Segregate pallets in the designated yellow Quarantine zone.');
    addLine('5.3 Collect composite samples according to ANSI/ASQ Z1.4 Level II.');
    doc.moveDown();

    addLine('6. RECORDS');
    addLine('QC-FRM-014 Incoming Raw Material Inspection Log');
    doc.moveDown();

    addLine('7. REFERENCES');
    addLine('ISO 9001:2015 Clause 8.4; Good Manufacturing Practice (cGMP) Guidelines.');
    addLine('8. END');

    doc.end();
  });
}

describe('SOP Smart Document Import & Auto-Fill Feature', () => {
  let creatorToken: string;
  let readOnlyToken: string;
  let qaDeptId: string;
  let qcDeptId: string;
  let creatorUserId: string;
  let readOnlyUserId: string;
  const createdSopIds: string[] = [];

  beforeAll(async () => {
    // Ensure QAD and QCD departments exist
    const qaDept = await prisma.department.upsert({
      where: { code: 'QAD' },
      update: { isActive: true },
      create: {
        name: 'Quality Assurance Department',
        code: 'QAD',
        description: 'Quality Assurance',
        isActive: true,
      },
    });
    qaDeptId = qaDept.id;

    const qcDept = await prisma.department.upsert({
      where: { code: 'QCD' },
      update: { isActive: true },
      create: {
        name: 'Quality Control Department',
        code: 'QCD',
        description: 'Quality Control',
        isActive: true,
      },
    });
    qcDeptId = qcDept.id;

    // Create test SOP_CREATOR user
    const creator = await prisma.user.upsert({
      where: { email: 'import.creator@nkb.test' },
      update: { role: Roles.SOP_CREATOR, departmentId: qaDeptId, isActive: true },
      create: {
        employeeId: 'IMP-CRT-01',
        username: 'import.creator',
        fullName: 'Import Test Creator',
        email: 'import.creator@nkb.test',
        passwordHash: 'not-used-in-jwt-test',
        role: Roles.SOP_CREATOR,
        departmentId: qaDeptId,
        isActive: true,
      },
    });
    creatorUserId = creator.id;

    // Create test READ_ONLY user
    const viewer = await prisma.user.upsert({
      where: { email: 'import.viewer@nkb.test' },
      update: { role: Roles.READ_ONLY, departmentId: qaDeptId, isActive: true },
      create: {
        employeeId: 'IMP-VIEW-01',
        username: 'import.viewer',
        fullName: 'Import Test Viewer',
        email: 'import.viewer@nkb.test',
        passwordHash: 'not-used-in-jwt-test',
        role: Roles.READ_ONLY,
        departmentId: qaDeptId,
        isActive: true,
      },
    });
    readOnlyUserId = viewer.id;

    creatorToken = jwt.sign(
      {
        userId: creator.id,
        id: creator.id,
        role: creator.role,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    readOnlyToken = jwt.sign(
      {
        userId: viewer.id,
        id: viewer.id,
        role: viewer.role,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Clean up any test SOPs from prior test runs
    const existingTestSops = await prisma.sOP.findMany({
      where: { sopNumber: { in: ['SOP-QAD-906', 'SOP-QCD-099'] } },
    });
    for (const s of existingTestSops) {
      await prisma.sOP.delete({ where: { id: s.id } });
    }
  });

  afterAll(async () => {
    for (const id of createdSopIds) {
      await prisma.sOP.deleteMany({ where: { id } });
    }
    const userIdsToDelete = [creatorUserId, readOnlyUserId].filter(Boolean);
    if (userIdsToDelete.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIdsToDelete } },
      });
    }
  });

  it('1. Rejects unauthenticated and unauthorized (READ_ONLY) users from importing documents', async () => {
    const docxBuf = await createTestDocxBuffer({
      bodyXml: '<w:p><w:r><w:t>1. PURPOSE</w:t></w:r></w:p>',
    });

    const unauthRes = await request(app)
      .post('/api/sops/import-document')
      .attach('file', docxBuf, 'test.docx');
    expect(unauthRes.status).toBe(401);

    const forbiddenRes = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .attach('file', docxBuf, 'test.docx');
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.success).toBe(false);
  });

  it('2. Extracts header metadata, revision history, tables, and all SOP sections from an NKB Manufacturing .docx document', async () => {
    const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tbl>
    <w:tr>
      <w:tc><w:p><w:r><w:t>STANDARD OPERATING PROCEDURES</w:t></w:r></w:p></w:tc>
    </w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:t>GMP Inspection and Production Line GMP Monitoring</w:t></w:r></w:p></w:tc>
      <w:tc>
        <w:p><w:r><w:t>Document No.:</w:t></w:r></w:p>
        <w:p><w:r><w:t>SOP-QAD-906</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:t>Revision No.: 000</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Issue Date: September 29, 2026</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Effective Date: October 6, 2026</w:t></w:r></w:p></w:tc>
    </w:tr>
  </w:tbl>
</w:hdr>`;

    const bodyXml = `
      <w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>REASON/S FOR REVISION</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>S/no</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Document</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Rev</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>DATE</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>SECTION</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>NAME</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>01</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Initial Issue</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>000</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>2026-10-07</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>NA</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>AP Macafe</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
      <w:p><w:r><w:t>2. OBJECTIVE</w:t></w:r></w:p>
      <w:p><w:r><w:t>2.1 To establish a standardized system for conducting Good Manufacturing Practice (GMP) inspections.</w:t></w:r></w:p>
      <w:p><w:r><w:t>3. SCOPE</w:t></w:r></w:p>
      <w:p><w:r><w:t>3.1 This SOP applies to all production and packaging areas of NKB Manufacturing.</w:t></w:r></w:p>
      <w:p><w:r><w:t>4. RESPONSIBILITY</w:t></w:r></w:p>
      <w:p><w:r><w:t>4.1 QA Inspector: Conducts scheduled and unscheduled GMP line inspections.</w:t></w:r></w:p>
      <w:p><w:r><w:t>5. PROCEDURE</w:t></w:r></w:p>
      <w:p><w:r><w:t>5.1 Pre-operational line clearance must be verified prior to batch start.</w:t></w:r></w:p>
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Area</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Frequency</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Filling Line</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Every 2 Hours</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
      <w:p><w:r><w:t>6. RECORDS</w:t></w:r></w:p>
      <w:p><w:r><w:t>GMP Inspection Checklist (QAD-FRM-006)</w:t></w:r></w:p>
      <w:p><w:r><w:t>7. REFERENCE/S</w:t></w:r></w:p>
      <w:p><w:r><w:t>FDA Current Good Manufacturing Practice Regulations</w:t></w:r></w:p>
      <w:p><w:r><w:t>8. END</w:t></w:r></w:p>
    `;

    const docxBuf = await createTestDocxBuffer({ headerXml, bodyXml });

    const res = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', docxBuf, 'SOP-QAD-906.docx');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.fileType).toBe('DOCX');
    expect(data.extractionMethod).toBe('DETERMINISTIC');
    expect(data.fields.sopNumber).toBe('SOP-QAD-906');
    expect(data.fields.title).toBe('GMP Inspection and Production Line GMP Monitoring');
    expect(data.fields.departmentId).toBe(qaDeptId);
    expect(data.fields.effectiveDate).toBe('2026-10-06');
    expect(data.fields.issueDate).toBe('2026-09-29');
    expect(data.fields.revisionNumber).toBe('000');
    expect(data.fields.revisionReason).toBe('Initial Issue');
    expect(data.fields.purpose).toContain('Good Manufacturing Practice (GMP) inspections');
    expect(data.fields.scope).toContain('all production and packaging areas');
    expect(data.fields.responsibilities).toContain('QA Inspector');
    expect(data.fields.procedure).toContain('Pre-operational line clearance');
    expect(data.fields.procedure).toContain('| Filling Line | Every 2 Hours |');
    expect(data.fields.relatedForms).toContain('GMP Inspection Checklist (QAD-FRM-006)');
    expect(data.fields.references).toContain('FDA Current Good Manufacturing Practice');
    expect(data.missingRequiredFields).toEqual([]);
    expect(data.revisionHistory.length).toBe(1);
    expect(data.revisionHistory[0].author).toBe('AP Macafe');

    // Now save the populated SOP via POST /api/sops and verify the database record & workflow state
    const createRes = await request(app)
      .post('/api/sops')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        sopNumber: data.fields.sopNumber,
        title: data.fields.title,
        departmentId: data.fields.departmentId,
        ownerDeptId: data.fields.departmentId,
        purpose: data.fields.purpose,
        scope: data.fields.scope,
        responsibilities: data.fields.responsibilities,
        procedure: data.fields.procedure,
        relatedForms: data.fields.relatedForms,
        references: data.fields.references,
        effectiveDate: data.fields.effectiveDate,
        revisionReason: data.fields.revisionReason,
        participants: [
          {
            departmentId: qaDeptId,
            participationType: 'REQUIRED_APPROVER',
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const createdSopId = createRes.body.sop.id;
    createdSopIds.push(createdSopId);

    // Verify database record directly and ensure it is DRAFT (never auto-approved)
    const dbSop = await prisma.sOP.findUnique({
      where: { id: createdSopId },
      include: { versions: true },
    });
    expect(dbSop).not.toBeNull();
    expect(dbSop!.sopNumber).toBe('SOP-QAD-906');
    expect(dbSop!.status).toBe(SOPStatuses.DRAFT);
    expect(dbSop!.versions[0].status).toBe(SOPStatuses.DRAFT);
    expect(dbSop!.versions[0].isFinalized).toBe(false);
    expect(dbSop!.versions[0].title).toBe('GMP Inspection and Production Line GMP Monitoring');
    expect(dbSop!.versions[0].procedure).toContain('| Filling Line | Every 2 Hours |');

    // Verify AuditLog recorded SOP_DOCUMENT_IMPORTED
    const importLog = await prisma.auditLog.findFirst({
      where: {
        userId: creatorUserId,
        action: 'SOP_DOCUMENT_IMPORTED',
        entityId: 'SOP-QAD-906',
      },
    });
    expect(importLog).not.toBeNull();
  });

  it('3. Detects duplicate SOP number when importing a document whose SOP number already exists', async () => {
    const headerXml = `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:p><w:r><w:t>STANDARD OPERATING PROCEDURES</w:t></w:r></w:p>
      <w:p><w:r><w:t>GMP Inspection and Production Line GMP Monitoring</w:t></w:r></w:p>
      <w:p><w:r><w:t>Document No.: SOP-QAD-906</w:t></w:r></w:p>
    </w:hdr>`;
    const bodyXml = `<w:p><w:r><w:t>1. PURPOSE</w:t></w:r></w:p><w:p><w:r><w:t>Test duplicate warning detection.</w:t></w:r></w:p>`;
    const docxBuf = await createTestDocxBuffer({ headerXml, bodyXml });

    const res = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', docxBuf, 'SOP-QAD-906-dup.docx');

    expect(res.status).toBe(200);
    expect(res.body.data.duplicateSop).not.toBeNull();
    expect(res.body.data.duplicateSop.sopNumber).toBe('SOP-QAD-906');
    expect(
      res.body.data.warnings.some((w: string) => w.includes('Duplicate Document Number detected'))
    ).toBe(true);
  });

  it('4. Extracts fields accurately from a multi-page text-based PDF document including Materials & Equipment', async () => {
    const pdfBuf = await createTextPdfBuffer();

    const res = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', pdfBuf, 'SOP-QCD-099.pdf');

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.fileType).toBe('PDF');
    expect(data.pageCount).toBe(2);
    expect(data.extractionMethod).toBe('DETERMINISTIC');
    expect(data.fields.sopNumber).toBe('SOP-QCD-099');
    expect(data.fields.title).toBe('Raw Material Sampling and Incoming Quarantine Control');
    expect(data.fields.departmentId).toBe(qcDeptId);
    expect(data.fields.effectiveDate).toBe('2026-10-15');
    expect(data.fields.reviewDate).toBe('2027-10-15');
    expect(data.fields.purpose).toContain('sampling, quarantine');
    expect(data.fields.purpose).toContain('laboratory release');
    expect(data.fields.scope).toContain('Quality Control inspectors');
    expect(data.fields.responsibilities).toContain('QC Inspector');
    expect(data.fields.procedure).toContain('MATERIALS & EQUIPMENT:');
    expect(data.fields.procedure).toContain('Verify supplier Certificate of Analysis');
    expect(data.fields.relatedForms).toContain('QC-FRM-014');
    expect(data.fields.references).toContain('ISO 9001:2015');
  });

  it('5. Handles incomplete documents with missing required fields without inventing dates, numbers, or content', async () => {
    const bodyXml = `
      <w:p><w:r><w:t>1. PURPOSE</w:t></w:r></w:p>
      <w:p><w:r><w:t>To define a partial draft procedure with missing sections.</w:t></w:r></w:p>
    `;
    const docxBuf = await createTestDocxBuffer({ bodyXml });

    const res = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', docxBuf, 'Partial-Draft.docx');

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.fields.sopNumber).toBeNull();
    expect(data.fields.effectiveDate).toBeNull();
    expect(data.fields.reviewDate).toBeNull();
    expect(data.fields.issueDate).toBeNull();
    expect(data.fields.revisionNumber).toBeNull();
    expect(data.fields.scope).toBeNull();
    expect(data.fields.responsibilities).toBeNull();
    expect(data.fields.procedure).toBeNull();
    expect(data.missingRequiredFields).toContain('2.0 Scope');
    expect(data.missingRequiredFields).toContain('3.0 Responsibilities');
    expect(data.missingRequiredFields).toContain('4.0 Step-by-Step Procedure');
    expect(data.warnings.length).toBeGreaterThan(0);
  });

  it('6. Triggers OCR mode and flags warnings when a scanned/image-only PDF is uploaded', async () => {
    // Create a minimal valid PDF with no text layer so avgCharsPerPage < 40 triggers OCR
    const scannedPdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ compress: false });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      // Draw only vector shapes (no text) to simulate a scanned page without a selectable text layer
      doc.rect(50, 50, 400, 100).stroke();
      doc.end();
    });

    const res = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', scannedPdfBuffer, 'Scanned-SOP.pdf');

    if (res.status !== 200) console.error('TEST 6 BODY:', res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.extractionMethod).toBe('OCR');
    expect(
      res.body.data.warnings.some((w: string) => w.includes('Scanned PDF detected'))
    ).toBe(true);
  });

  it('7. Rejects malformed, spoofed, macro-enabled, or potentially malicious files with 400 status', async () => {
    // A. Executable disguised as PDF
    const fakePdf = Buffer.from('MZ\x90\x00This is an executable disguised as PDF');
    const resFakePdf = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', fakePdf, 'malicious.pdf');
    expect(resFakePdf.status).toBe(400);

    // B. PDF with embedded /JavaScript action
    const jsPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /S /JavaScript /JS (app.alert(1)) >>\nendobj');
    const resJsPdf = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', jsPdf, 'exploit.pdf');
    expect(resJsPdf.status).toBe(400);
    expect(resJsPdf.body.message).toContain('active scripts');

    // C. DOCX containing embedded VBA macros (vbaProject.bin)
    const macroDocx = await createTestDocxBuffer({
      bodyXml: '<w:p><w:r><w:t>Macro test</w:t></w:r></w:p>',
      includeMacroFile: true,
    });
    const resMacro = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', macroDocx, 'macro.docx');
    expect(resMacro.status).toBe(400);
    expect(resMacro.body.message).toContain('VBA macros');

    // D. Unsupported extension (.docm / .exe)
    const resDocm = await request(app)
      .post('/api/sops/import-document')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', Buffer.from('test'), 'macro.docm');
    expect(resDocm.status).toBe(400);
  });
});
