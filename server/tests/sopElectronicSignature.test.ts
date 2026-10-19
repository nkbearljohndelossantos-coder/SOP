import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import app from '../src/app';
import { prisma } from '../src/prisma/client';
import { seedProductionData } from '../src/prisma/seedProd';

describe('SOP Electronic Signature Workflow & Audit Tests', () => {
  let adminToken: string;
  let creatorToken: string;
  let qcHeadToken: string;
  let sopId: string;
  let versionId: string;
  let qcDeptId: string;
  let createdSignatureId: string;

  beforeAll(async () => {
    await seedProductionData();

    const testPasswordHash = await bcrypt.hash('password123', 10);

    // 1. Create test users
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin.sig@nkb.com' },
      update: { passwordHash: testPasswordHash },
      create: {
        employeeId: 'EMP-ADM-SIG',
        username: 'admin_sig',
        email: 'admin.sig@nkb.com',
        fullName: 'Admin Signature Tester',
        role: 'ADMIN',
        passwordHash: testPasswordHash,
        isActive: true,
      },
    });

    const creatorUser = await prisma.user.upsert({
      where: { email: 'creator.sig@nkb.com' },
      update: { passwordHash: testPasswordHash },
      create: {
        employeeId: 'EMP-CRE-SIG',
        username: 'creator_sig',
        email: 'creator.sig@nkb.com',
        fullName: 'Author Signature Tester',
        role: 'SOP_CREATOR',
        passwordHash: testPasswordHash,
        isActive: true,
      },
    });

    const qcDept = await prisma.department.findUnique({ where: { code: 'QC' } });
    expect(qcDept).toBeDefined();
    qcDeptId = qcDept!.id;

    const qcHeadUser = await prisma.user.upsert({
      where: { email: 'qchead.sig@nkb.com' },
      update: { passwordHash: testPasswordHash },
      create: {
        employeeId: 'EMP-QCH-SIG',
        username: 'qchead_sig',
        email: 'qchead.sig@nkb.com',
        fullName: 'Dr. Roberto Mendoza',
        position: 'Quality Assurance & QC Director',
        role: 'DEPARTMENT_HEAD',
        departmentId: qcDeptId,
        passwordHash: testPasswordHash,
        isActive: true,
      },
    });

    await prisma.department.update({
      where: { id: qcDeptId },
      data: { headUserId: qcHeadUser.id },
    });

    // Login tokens
    const jwt = await import('jsonwebtoken');
    const { env } = await import('../src/config/env');

    adminToken = jwt.default.sign(
      { userId: adminUser.id, username: adminUser.username, role: adminUser.role },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    creatorToken = jwt.default.sign(
      { userId: creatorUser.id, username: creatorUser.username, role: creatorUser.role },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    qcHeadToken = jwt.default.sign(
      {
        userId: qcHeadUser.id,
        username: qcHeadUser.username,
        role: qcHeadUser.role,
        departmentId: qcDeptId,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create an SOP with QC as Required Approver
    const createRes = await request(app)
      .post('/api/sops')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: 'QC Sample Inspection and Line Monitoring Procedure',
        ownerDeptId: qcDeptId,
        participants: [{ departmentId: qcDeptId, participationType: 'REQUIRED_APPROVER' }],
      });

    expect(createRes.status).toBe(201);
    sopId = createRes.body.sop.id;
    versionId = createRes.body.version.id;
    expect(versionId).toBeDefined();

    // Advance to INITIAL_REVIEW then DEPARTMENT_APPROVAL
    await request(app)
      .post(`/api/workflow/versions/${versionId}/submit`)
      .set('Authorization', `Bearer ${creatorToken}`);

    await request(app)
      .post(`/api/workflow/versions/${versionId}/advance-to-approval`)
      .set('Authorization', `Bearer ${creatorToken}`);
  });

  it('1. Author can apply a DRAWN electronic signature confirming author review', async () => {
    const res = await request(app)
      .post(`/api/workflow/versions/${versionId}/sign`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        signatureMethod: 'DRAWN',
        signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        declarationText: 'I hereby confirm that this SOP document has been authored, verified, and prepared in accordance with NKB QMS standards.',
        workflowStep: 'AUTHOR_SIGN_OFF',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.signature.signatureMethod).toBe('DRAWN');
    expect(res.body.data.signature.documentHash).toBeDefined();
    expect(res.body.data.signature.signerName).toBe('Author Signature Tester');
    expect(res.body.data.signatureStatus).toBe('PARTIALLY_SIGNED');
  });

  it('2. QC Department Head can apply a TYPED electronic signature which records approval and advances status', async () => {
    const res = await request(app)
      .post(`/api/workflow/versions/${versionId}/sign`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        signatureMethod: 'TYPED',
        signatureData: 'Dr. Roberto Mendoza',
        declarationText: 'I, Dr. Roberto Mendoza, QC Director, electronically sign and approve this procedure for company implementation.',
        departmentId: qcDeptId,
        workflowStep: 'DEPARTMENT_APPROVAL',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.signature.signatureMethod).toBe('TYPED');
    expect(res.body.data.signature.signerRole).toBe('DEPARTMENT_HEAD');
    expect(res.body.data.signature.status).toBe('VALID');
    createdSignatureId = res.body.data.signature.id;

    // Verify version status became FINAL_REVIEW / FULLY_SIGNED
    expect(res.body.data.signatureStatus).toBe('FULLY_SIGNED');
  });

  it('3. Prevents duplicate signature for the same user on the same workflow step', async () => {
    const res = await request(app)
      .post(`/api/workflow/versions/${versionId}/sign`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        signatureMethod: 'TYPED',
        signatureData: 'Dr. Roberto Mendoza',
        declarationText: 'Duplicate attempt test',
        departmentId: qcDeptId,
        workflowStep: 'DEPARTMENT_APPROVAL',
      });

    expect([400, 500]).toContain(res.status);
    expect(res.body.message).toContain('already applied a valid electronic signature');
  });

  it('4. Retrieves all verified electronic signatures for the SOP version', async () => {
    const res = await request(app)
      .get(`/api/workflow/versions/${versionId}/signatures`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.data[0].signatureMethod).toBe('DRAWN');
    expect(res.body.data[1].signatureMethod).toBe('TYPED');
  });

  it('5. Admin can revoke a signature with mandatory recorded reason', async () => {
    const res = await request(app)
      .post(`/api/workflow/signatures/${createdSignatureId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Revision requested by regulatory audit team; new signature required.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('REVOKED');
    expect(res.body.data.revokedReason).toBe('Revision requested by regulatory audit team; new signature required.');
  });

  it('6. Re-authentication password rejects invalid credentials with 400/500', async () => {
    const res = await request(app)
      .post(`/api/workflow/versions/${versionId}/sign`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        signatureMethod: 'TYPED',
        signatureData: 'Dr. Roberto Mendoza',
        declarationText: 'Re-signing after revocation with password check.',
        password: 'wrong_password_123',
        departmentId: qcDeptId,
        workflowStep: 'DEPARTMENT_APPROVAL',
      });

    expect([400, 500]).toContain(res.status);
    expect(res.body.message).toContain('Incorrect account password');
  });

  it('7. Unauthorized user cannot sign on behalf of an unrelated department', async () => {
    // Create an unprivileged user
    const unprivUser = await prisma.user.upsert({
      where: { email: 'viewer.sig@nkb.com' },
      update: {},
      create: {
        employeeId: 'EMP-VIEW-SIG',
        username: 'viewer_sig',
        email: 'viewer.sig@nkb.com',
        fullName: 'Unprivileged Viewer',
        role: 'VIEWER',
        passwordHash: '$2a$10$wT0vVf9/m3oQf/cW7Z2H.eqR2W2zU2o3a1n5m6k7l8j9h0g1f2e3d',
        isActive: true,
      },
    });

    const jwt = await import('jsonwebtoken');
    const { env } = await import('../src/config/env');
    const unprivToken = jwt.default.sign(
      { userId: unprivUser.id, username: unprivUser.username, role: unprivUser.role },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .post(`/api/workflow/versions/${versionId}/sign`)
      .set('Authorization', `Bearer ${unprivToken}`)
      .send({
        signatureMethod: 'TYPED',
        signatureData: 'Unprivileged Viewer',
        declarationText: 'Attempting unauthorized signature.',
        departmentId: qcDeptId,
        workflowStep: 'DEPARTMENT_APPROVAL',
      });

    expect([400, 403, 500]).toContain(res.status);
    expect(res.body.message).toContain('not authorized');
  });

  it('8. Tamper prevention: Blocks uploading attachments when valid electronic signatures exist', async () => {
    // Re-sign with valid password as QC head so valid signature exists
    await request(app)
      .post(`/api/workflow/versions/${versionId}/sign`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        signatureMethod: 'TYPED',
        signatureData: 'Dr. Roberto Mendoza',
        declarationText: 'Re-signed and officially approved with valid credentials.',
        password: 'password123',
        departmentId: qcDeptId,
        workflowStep: 'DEPARTMENT_APPROVAL',
      });

    // Attempting to upload/replace attachment on this signed version
    const res = await request(app)
      .post(`/api/attachments/versions/${versionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('Tampered content file'), 'tampered.docx');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Cannot upload or replace documents on an electronically signed SOP version');
  });

  it('9. Append-only Audit trail verifies signature creation and revocation events', async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: 'SOPElectronicSignature',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
    const actions = auditLogs.map((a) => a.action);
    expect(actions).toContain('SOP_ELECTRONIC_SIGNATURE_CREATED');
    expect(actions).toContain('SOP_ELECTRONIC_SIGNATURE_REVOKED');
  });
});
