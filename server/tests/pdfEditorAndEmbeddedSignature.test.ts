import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import app from '../src/app';
import { prisma } from '../src/prisma/client';
import { seedProductionData } from '../src/prisma/seedProd';
import { env } from '../src/config/env';

const uploadDir = path.resolve(env.UPLOAD_DIR);

describe('Real PDF Editor & Embedded Electronic Signatures Workflow Tests', () => {
  let creatorToken: string;
  let qcHeadToken: string;
  let unauthorizedToken: string;
  let qcDeptId: string;
  let testSopId: string;
  let testVersionId: string;
  let originalPdfPath: string;
  let originalPdfHash: string;
  let originalAttachmentId: string;

  beforeAll(async () => {
    await seedProductionData();

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const testPasswordHash = await bcrypt.hash('Password123!', 10);

    const qcDept = await prisma.department.findUnique({ where: { code: 'QC' } });
    expect(qcDept).toBeDefined();
    qcDeptId = qcDept!.id;

    // 1. Setup users
    const creatorUser = await prisma.user.upsert({
      where: { email: 'pdf.creator@nkb.com' },
      update: { passwordHash: testPasswordHash },
      create: {
        employeeId: 'EMP-PDF-01',
        username: 'pdf_creator',
        email: 'pdf.creator@nkb.com',
        fullName: 'PDF Workflow Author',
        role: 'SOP_CREATOR',
        departmentId: qcDeptId,
        passwordHash: testPasswordHash,
        isActive: true,
      },
    });

    const qcHeadUser = await prisma.user.upsert({
      where: { email: 'pdf.qchead@nkb.com' },
      update: { passwordHash: testPasswordHash },
      create: {
        employeeId: 'EMP-PDF-QC',
        username: 'pdf_qchead',
        email: 'pdf.qchead@nkb.com',
        fullName: 'Quality Control Lead',
        position: 'QC Department Head',
        role: 'DEPARTMENT_HEAD',
        departmentId: qcDeptId,
        passwordHash: testPasswordHash,
        isActive: true,
      },
    });

    const unauthorizedUser = await prisma.user.upsert({
      where: { email: 'pdf.unauth@nkb.com' },
      update: { passwordHash: testPasswordHash },
      create: {
        employeeId: 'EMP-PDF-NO',
        username: 'pdf_unauth',
        email: 'pdf.unauth@nkb.com',
        fullName: 'Unauthorized Viewer',
        role: 'READ_ONLY',
        passwordHash: testPasswordHash,
        isActive: true,
      },
    });

    // Login tokens
    const creatorRes = await request(app).post('/api/auth/login').send({
      username: creatorUser.username,
      password: 'Password123!',
    });
    creatorToken = creatorRes.body.data.token;

    const qcHeadRes = await request(app).post('/api/auth/login').send({
      username: qcHeadUser.username,
      password: 'Password123!',
    });
    qcHeadToken = qcHeadRes.body.data.token;

    const unauthRes = await request(app).post('/api/auth/login').send({
      username: unauthorizedUser.username,
      password: 'Password123!',
    });
    unauthorizedToken = unauthRes.body.data.token;

    // 2. Create a genuine multi-page test PDF (3 pages)
    const testDoc = await PDFDocument.create();
    const font = await testDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Page 1
    const p1 = testDoc.addPage([595.28, 841.89]);
    p1.drawText('STANDARD OPERATING PROCEDURE: QUALITY CONTROL TESTING', { x: 50, y: 790, size: 14, font });
    p1.drawText('Section 1: Objective & Scope', { x: 50, y: 740, size: 12, font });

    // Page 2
    const p2 = testDoc.addPage([595.28, 841.89]);
    p2.drawText('Section 2: Step-by-Step Procedure Steps', { x: 50, y: 790, size: 14, font });

    // Page 3
    const p3 = testDoc.addPage([595.28, 841.89]);
    p3.drawText('Section 3: Formal Approvals & Signatures', { x: 50, y: 790, size: 14, font });

    const pdfBytes = await testDoc.save();
    originalPdfHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');

    const storedFilename = `sop-test-${Date.now()}-orig.pdf`;
    originalPdfPath = path.join(uploadDir, storedFilename);
    fs.writeFileSync(originalPdfPath, pdfBytes);

    // 3. Create SOP and SOPVersion in DB
    const testSopNumber = `SOP-QC-EMBED-${Date.now()}`;
    const sop = await prisma.sOP.create({
      data: {
        sopNumber: testSopNumber,
        title: 'QC Sample Procedure for Real PDF Embedding',
        category: 'QUALITY_CONTROL',
        ownerDeptId: qcDeptId,
        createdById: creatorUser.id,
      },
    });
    testSopId = sop.id;

    const version = await prisma.sOPVersion.create({
      data: {
        sopId: sop.id,
        versionNumber: '1.0',
        versionInt: 100,
        title: sop.title,
        status: 'UNDER_REVIEW',
        createdById: creatorUser.id,
        documentHash: originalPdfHash,
        participants: {
          create: [
            {
              departmentId: qcDeptId,
              participationType: 'REQUIRED_APPROVER',
              status: 'PENDING',
            },
          ],
        },
      },
    });
    testVersionId = version.id;

    const att = await prisma.sOPAttachment.create({
      data: {
        sopVersionId: version.id,
        originalFilename: 'SOP-QC-999_Procedure.pdf',
        storedFilename,
        mimeType: 'application/pdf',
        fileSize: pdfBytes.length,
        uploadedById: creatorUser.id,
      },
    });
    originalAttachmentId = att.id;

    await prisma.sOPVersion.update({
      where: { id: version.id },
      data: { primaryAttachmentId: att.id },
    });
  });

  it('1. Embeds an electronic signature into actual PDF file bytes with placement on Page 3', async () => {
    // 1x1 transparent PNG as signature image
    const sampleSignaturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const signRes = await request(app)
      .post(`/api/workflow/versions/${testVersionId}/sign`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        signatureMethod: 'DRAWN',
        signatureData: sampleSignaturePng,
        declarationText: 'I legally approve this procedure document under 21 CFR Part 11.',
        password: 'Password123!',
        departmentId: qcDeptId,
        workflowStep: 'DEPARTMENT_APPROVAL',
        placement: {
          pageNumber: 3,
          x: 0.52,
          y: 0.78,
          width: 0.40,
          height: 0.14,
        },
      });

    expect(signRes.status).toBe(201);
    expect(signRes.body.success).toBe(true);

    const sigData = signRes.body.data.signature;
    expect(sigData.status).toBe('VALID');
    expect(sigData.signerName).toBe('Quality Control Lead');

    // 2. Verify that the original PDF on disk remains UNTOUCHED
    expect(fs.existsSync(originalPdfPath)).toBe(true);
    const origBytes = fs.readFileSync(originalPdfPath);
    const checkOrigHash = crypto.createHash('sha256').update(origBytes).digest('hex');
    expect(checkOrigHash).toBe(originalPdfHash);

    // 3. Verify that a new signed attachment was generated and stored
    const updatedVersion = await prisma.sOPVersion.findUnique({
      where: { id: testVersionId },
      include: { attachments: true, signatures: true },
    });

    expect(updatedVersion).toBeDefined();
    expect(updatedVersion!.attachments.length).toBe(2); // Original + Signed

    const signedAttachment = updatedVersion!.attachments.find(
      (a) => a.id === updatedVersion!.primaryAttachmentId
    );
    expect(signedAttachment).toBeDefined();
    expect(signedAttachment!.originalFilename).toContain('Signed_');
    expect(signedAttachment!.storedFilename).toContain('sop-signed-');

    // 4. Verify physical signed PDF bytes can be reopened with pdf-lib and contain the embedded elements
    const signedFilePath = path.join(uploadDir, signedAttachment!.storedFilename);
    expect(fs.existsSync(signedFilePath)).toBe(true);

    const signedFileBytes = fs.readFileSync(signedFilePath);
    expect(signedFileBytes.length).toBeGreaterThan(origBytes.length);

    const reopenedPdf = await PDFDocument.load(signedFileBytes);
    expect(reopenedPdf.getPageCount()).toBe(3);

    // 5. Verify the signature record points to the signed output file and preserves original hash
    const signatureRecord = updatedVersion!.signatures.find((s) => s.status === 'VALID');
    expect(signatureRecord).toBeDefined();
    expect(signatureRecord!.documentHash).toBe(originalPdfHash); // Preserves original verified hash
    expect(signatureRecord!.attachmentId).toBe(signedAttachment!.id); // Binds to output signed artifact

    const metadata = JSON.parse(signatureRecord!.metadata || '{}');
    expect(metadata.placement.pageNumber).toBe(3);
    expect(metadata.signedDocumentHash).toBe(updatedVersion!.documentHash);
  });

  it('2. Embeds text and date annotations via draft PDF editor endpoint', async () => {
    const editRes = await request(app)
      .post(`/api/workflow/versions/${testVersionId}/edit-pdf`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        annotations: [
          {
            type: 'text',
            pageNumber: 1,
            x: 0.10,
            y: 0.20,
            text: 'NOTE: Annual Review Mandatory',
            fontSize: 10,
          },
          {
            type: 'date',
            pageNumber: 2,
            x: 0.10,
            y: 0.90,
            text: 'Effective Date: 2026-10-19',
            fontSize: 9,
          },
        ],
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.success).toBe(true);

    const editData = editRes.body.data;
    expect(editData.attachment).toBeDefined();
    expect(editData.attachment.storedFilename).toContain('sop-draft-');

    // Verify physical file was written and can be read as a valid PDF
    const draftPath = path.join(uploadDir, editData.attachment.storedFilename);
    expect(fs.existsSync(draftPath)).toBe(true);
    const draftBytes = fs.readFileSync(draftPath);
    const draftDoc = await PDFDocument.load(draftBytes);
    expect(draftDoc.getPageCount()).toBe(3);
  });

  it('3. Prevents duplicate valid signature for the same user on the same workflow step', async () => {
    const dupRes = await request(app)
      .post(`/api/workflow/versions/${testVersionId}/sign`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        signatureMethod: 'TYPED',
        signatureData: 'Quality Control Lead',
        declarationText: 'Duplicate sign attempt.',
        password: 'Password123!',
        departmentId: qcDeptId,
        workflowStep: 'DEPARTMENT_APPROVAL',
      });

    expect(dupRes.status).toBe(500);
    expect(dupRes.body.message).toContain('already applied a valid electronic signature');
  });

  it('4. Rejects signature execution with incorrect re-authentication password', async () => {
    const wrongPassRes = await request(app)
      .post(`/api/workflow/versions/${testVersionId}/sign`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        signatureMethod: 'TYPED',
        signatureData: 'PDF Workflow Author',
        declarationText: 'Legal approval with wrong password.',
        password: 'WRONG_PASSWORD_XYZ',
        departmentId: qcDeptId,
        workflowStep: 'AUTHOR_SIGN_OFF',
      });

    expect(wrongPassRes.status).toBe(500);
    expect(wrongPassRes.body.message).toContain('Incorrect account password');
  });

  it('5. Rejects unauthorized user attempting to sign on behalf of an unauthorized department', async () => {
    const unauthSignRes = await request(app)
      .post(`/api/workflow/versions/${testVersionId}/sign`)
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .send({
        signatureMethod: 'TYPED',
        signatureData: 'Unauthorized Viewer',
        declarationText: 'Unauthorized sign attempt.',
        password: 'Password123!',
        departmentId: qcDeptId,
        workflowStep: 'DEPARTMENT_APPROVAL',
      });

    expect([403, 500]).toContain(unauthSignRes.status);
    expect(unauthSignRes.body.message).toContain('not authorized to sign');
  });

  afterAll(async () => {
    if (testSopId) {
      await prisma.sOP.delete({ where: { id: testSopId } }).catch(() => {});
    }
  });
});
