import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import app from '../src/app';
import { prisma } from '../src/prisma/client';
import { seedProductionData } from '../src/prisma/seedProd';

describe('SOP Document Upload to Preview & Attachment Staging Workflow Tests', () => {
  let creatorToken: string;
  let qcHeadToken: string;
  let qcDeptId: string;
  let stagedPdfId: string;
  let stagedDocxId: string;
  let stagedPdfHash: string;
  let createdSopId: string;
  let createdVersionId: string;

  beforeAll(async () => {
    await seedProductionData();

    const testPasswordHash = await bcrypt.hash('password123', 10);

    const qcDept = await prisma.department.findUnique({ where: { code: 'QC' } });
    expect(qcDept).toBeDefined();
    qcDeptId = qcDept!.id;

    const creatorUser = await prisma.user.upsert({
      where: { email: 'preview.creator@nkb.com' },
      update: { passwordHash: testPasswordHash },
      create: {
        employeeId: 'EMP-PREV-01',
        username: 'preview_creator',
        email: 'preview.creator@nkb.com',
        fullName: 'Preview Workflow Author',
        role: 'SOP_CREATOR',
        passwordHash: testPasswordHash,
        isActive: true,
      },
    });

    const qcHeadUser = await prisma.user.upsert({
      where: { email: 'preview.qchead@nkb.com' },
      update: { passwordHash: testPasswordHash },
      create: {
        employeeId: 'EMP-PREV-QC',
        username: 'preview_qchead',
        email: 'preview.qchead@nkb.com',
        fullName: 'Preview QC Approver',
        position: 'Quality Control Lead',
        role: 'DEPARTMENT_HEAD',
        departmentId: qcDeptId,
        passwordHash: testPasswordHash,
        isActive: true,
      },
    });

    const creatorLogin = await request(app).post('/api/auth/login').send({
      username: creatorUser.username,
      password: 'password123',
    });
    expect(creatorLogin.status).toBe(200);
    creatorToken = creatorLogin.body.token;

    const qcLogin = await request(app).post('/api/auth/login').send({
      username: qcHeadUser.username,
      password: 'password123',
    });
    expect(qcLogin.status).toBe(200);
    qcHeadToken = qcLogin.body.token;
  });

  it('1. Rejects invalid or unsupported files on POST /api/attachments/stage', async () => {
    const res = await request(app)
      .post('/api/attachments/stage')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', Buffer.from('unsupported exe binary content'), 'malicious.exe');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Only PDF, DOCX, XLSX, JPG, and PNG');
  });

  it('2. Successfully stages an official PDF document on POST /api/attachments/stage', async () => {
    const dummyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    const res = await request(app)
      .post('/api/attachments/stage')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', dummyPdf, 'SOP-QC-Sampling.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toMatch(/^staged-/);
    expect(res.body.data.originalFilename).toBe('SOP-QC-Sampling.pdf');
    expect(res.body.data.documentHash).toBeDefined();
    expect(res.body.data.documentHash.length).toBe(64);
    expect(res.body.data.isStaged).toBe(true);

    stagedPdfId = res.body.data.id;
    stagedPdfHash = res.body.data.documentHash;
  });

  it('3. Serves inline preview for staged document via GET /api/attachments/:id/download?inline=true', async () => {
    const res = await request(app)
      .get(`/api/attachments/${stagedPdfId}/download?inline=true`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.headers['content-disposition']).toContain('SOP-QC-Sampling.pdf');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('4. Successfully stages a Word (.docx) document on POST /api/attachments/stage', async () => {
    // Generate valid PK zip header representing a docx container
    const dummyDocx = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('Word Document Body Test Bytes'),
    ]);

    const res = await request(app)
      .post('/api/attachments/stage')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('file', dummyDocx, 'SOP-Standard-Procedure.docx');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toMatch(/^staged-/);
    expect(res.body.data.originalFilename).toBe('SOP-Standard-Procedure.docx');
    stagedDocxId = res.body.data.id;
  });

  it('5. Creates new SOP and commits staged attachment to Version 1.0 with primaryAttachmentId and documentHash', async () => {
    const testSopNumber = `SOP-STG-${Date.now().toString().slice(-6)}`;
    const res = await request(app)
      .post('/api/sops')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        sopNumber: testSopNumber,
        title: 'Water Sampling and Testing Procedure',
        departmentId: qcDeptId,
        ownerDeptId: qcDeptId,
        category: 'Standard Operating Procedure',
        stagedAttachmentIds: [stagedPdfId],
        participants: [
          { departmentId: qcDeptId, participationType: 'REQUIRED_APPROVER' },
        ],
      });

    if (res.status !== 201) {
      console.log('CREATE SOP ERROR:', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.sop).toBeDefined();
    expect(res.body.version).toBeDefined();
    expect(res.body.version.primaryAttachmentId).toBeDefined();
    expect(res.body.version.documentHash).toBe(stagedPdfHash);

    createdSopId = res.body.sop.id;
    createdVersionId = res.body.version.id;
  });

  it('6. Reopening SOP on GET /api/sops/:id returns persisted document attachment and hash for preview', async () => {
    const res = await request(app)
      .get(`/api/sops/${createdSopId}`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    const version = res.body.currentVersion || res.body.data?.currentVersion;
    expect(version).toBeDefined();
    expect(version.primaryAttachmentId).toBeDefined();
    expect(version.documentHash).toBe(stagedPdfHash);
    expect(version.attachments.length).toBe(1);
    expect(version.attachments[0].originalFilename).toBe('SOP-QC-Sampling.pdf');
    expect(version.attachments[0].id).toBe(version.primaryAttachmentId);

    // Verify persisted download
    const downloadRes = await request(app)
      .get(`/api/attachments/${version.primaryAttachmentId}/download?inline=true`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('application/pdf');
    expect(downloadRes.headers['content-disposition']).toContain('inline');
  });

  it('7. Batch upload on POST /api/attachments/versions/:versionId/batch sets primaryAttachmentId and documentHash when omitted', async () => {
    // Create an SOP without pre-staged attachments
    const batchSopNumber = `SOP-BCH-${Date.now().toString().slice(-6)}`;
    const createRes = await request(app)
      .post('/api/sops')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        sopNumber: batchSopNumber,
        title: 'Microbial Analysis of Packaging Materials',
        departmentId: qcDeptId,
        ownerDeptId: qcDeptId,
        participants: [
          { departmentId: qcDeptId, participationType: 'REQUIRED_APPROVER' },
        ],
      });

    expect(createRes.status).toBe(201);
    const verId = createRes.body.version.id;

    const dummyPdf = Buffer.from('%PDF-1.4\nBatch Upload Procedure PDF Document\n%%EOF');
    const batchRes = await request(app)
      .post(`/api/attachments/versions/${verId}/batch`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('files', dummyPdf, 'Microbial-SOP.pdf');

    expect(batchRes.status).toBe(201);
    expect(batchRes.body.success).toBe(true);

    // Verify that version was updated with primaryAttachmentId and documentHash
    const updatedVer = await prisma.sOPVersion.findUnique({ where: { id: verId } });
    expect(updatedVer?.primaryAttachmentId).toBeDefined();
    expect(updatedVer?.documentHash).toBeDefined();
    expect(updatedVer?.documentHash?.length).toBe(64);
  });
});
