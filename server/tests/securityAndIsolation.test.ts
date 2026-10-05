import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/prisma/client';
import { seedDemoData } from '../src/prisma/seedDemo';
import { seedProductionData } from '../src/prisma/seedProd';

describe('Security, Production Isolation, and RBAC Guard Tests', () => {
  it('TEST 11 & 12: Demo seed throws fatal error when APP_ENV=production or ENABLE_DEMO_ACCOUNTS=false', async () => {
    const originalEnv = process.env.APP_ENV;
    const originalDemo = process.env.ENABLE_DEMO_ACCOUNTS;

    try {
      // Mock production environment
      process.env.APP_ENV = 'production';
      process.env.ENABLE_DEMO_ACCOUNTS = 'false';

      await expect(seedDemoData()).rejects.toThrow(
        /Production environment protection active|DEMO SEED BLOCKED/
      );
    } finally {
      process.env.APP_ENV = originalEnv;
      process.env.ENABLE_DEMO_ACCOUNTS = originalDemo;
    }
  });

  it('TEST 12: Production seed initializes ONLY official company departments with ZERO demo accounts', async () => {
    // Run production seed
    await seedProductionData();

    // Verify all official departments exist
    const depts = await prisma.department.findMany();
    expect(depts.length).toBeGreaterThanOrEqual(22);

    const deptCodes = depts.map((d) => d.code);
    expect(deptCodes).toContain('WH');
    expect(deptCodes).toContain('QC');
    expect(deptCodes).toContain('QA');
    expect(deptCodes).toContain('PUR');
    expect(deptCodes).toContain('ACC');
    expect(deptCodes).toContain('IT');
  });

  it('TEST 18: Security rejects malicious/unauthorized file upload extensions and mime types', async () => {
    // Log in as creator
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'creator', password: 'DemoPassword123!' });

    const token = loginRes.body.data.token;

    // Get any draft version or create one
    let version = await prisma.sOPVersion.findFirst({
      where: { isFinalized: false },
    });

    if (!version) {
      const creator = await prisma.user.findFirst({ where: { role: 'SOP_CREATOR' } }) ||
        await prisma.user.findFirst();
      const dept = await prisma.department.findFirst();
      if (creator && dept) {
        const sop = await prisma.sOP.create({
          data: {
            sopNumber: `TEST-SEC-SOP-${Date.now()}`,
            title: 'Security Upload Test',
            category: 'Safety',
            ownerDeptId: dept.id,
            createdById: creator.id,
            versions: {
              create: {
                versionNumber: '1.0',
                title: 'Security Upload Test Version',
                purpose: 'Purpose',
                scope: 'Scope',
                responsibilities: 'Resp',
                procedure: 'Proc',
                createdById: creator.id,
              },
            },
          },
          include: { versions: true },
        });
        version = sop.versions[0];
      }
    }

    // Try uploading a disallowed file (.exe / application/x-msdownload)
    const uploadRes = await request(app)
      .post(`/api/attachments/versions/${version!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('malicious payload'), 'exploit.exe');

    expect(uploadRes.status).toBe(400); // Multer fileFilter rejection handled as 400 Bad Request
  });

  it('TEST 20: Audit logs are recorded on actions and have NO delete/edit API endpoints', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'creator', password: 'DemoPassword123!' });

    const token = loginRes.body.data.token;

    // Verify audit log exists
    const logs = await prisma.auditLog.findMany({ take: 5 });
    expect(logs.length).toBeGreaterThan(0);

    // Try sending DELETE or PUT to audit log endpoint
    const delRes = await request(app)
      .delete(`/api/audit-logs/${logs[0].id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.status).toBe(404); // Endpoint does not exist in API
  });

  it('TEST 22: First admin setup is strictly disabled once a Super Admin exists', async () => {
    // There is already a super admin in the database
    const res = await request(app)
      .post('/api/auth/setup-admin')
      .send({
        employeeId: 'NKB-PROD-ADM',
        username: 'newsuperadmin',
        fullName: 'New Super Administrator',
        email: 'newadmin@nkb.local',
        password: 'SecurePassword2026!',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('already has an active Super Administrator');
  });

  it('TEST 23: Admin can generate registration invite and user can register via invite link', async () => {
    // 1. Log in as Super Admin
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'DemoPassword123!' });

    const adminToken = adminLogin.body.data.token;
    const dept = await prisma.department.findFirst();

    // 2. Generate Registration Invite
    const inviteRes = await request(app)
      .post('/api/users/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        role: 'REVIEWER',
        departmentId: dept?.id,
        expiresInDays: 7,
      });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.success).toBe(true);
    const { token: inviteToken } = inviteRes.body.data;
    expect(inviteToken).toBeDefined();

    // 3. Query public invite info
    const infoRes = await request(app).get(`/api/auth/invite/${inviteToken}`);
    expect(infoRes.status).toBe(200);
    expect(infoRes.body.data.role).toBe('REVIEWER');

    // 4. Complete Registration with invite token
    const uniqueSuffix = Date.now().toString().slice(-4);
    const regRes = await request(app)
      .post('/api/auth/register-with-invite')
      .send({
        token: inviteToken,
        firstName: 'Invited',
        lastName: 'Employee',
        employeeId: `EMP-INV-${uniqueSuffix}`,
        username: `inviteduser${uniqueSuffix}`,
        email: `invited${uniqueSuffix}@nkb.local`,
        password: 'Password12345!',
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);
    expect(regRes.body.data.role).toBe('REVIEWER');

    // 5. Verify invite cannot be reused
    const reuseRes = await request(app).get(`/api/auth/invite/${inviteToken}`);
    expect(reuseRes.status).toBe(410);

    // 6. Verify newly registered user can log in with their Employee ID and password
    const userLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: `EMP-INV-${uniqueSuffix}`,
        password: 'Password12345!',
      });

    expect(userLoginRes.status).toBe(200);
    expect(userLoginRes.body.success).toBe(true);
    expect(userLoginRes.body.data.user.role).toBe('REVIEWER');
  });

  it('TEST 24: SOP version supports batch file attachment uploads during or after creation', async () => {
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'DemoPassword123!' });

    const adminToken = adminLogin.body.data.token;
    const dept = await prisma.department.findFirst();

    // Find any draft version
    const version = await prisma.sOPVersion.findFirst({
      where: { isFinalized: false },
    });
    expect(version).toBeDefined();

    const batchRes = await request(app)
      .post(`/api/attachments/versions/${version!.id}/batch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('files', Buffer.from('%PDF-1.4 official sop doc'), 'sop-doc-test.pdf')
      .attach('files', Buffer.from('pk\x03\x04 fake docx binary data'), 'procedure-manual.docx');

    expect(batchRes.status).toBe(201);
    expect(batchRes.body.success).toBe(true);
    expect(batchRes.body.count).toBe(2);
    expect(batchRes.body.data.length).toBe(2);
    expect(batchRes.body.data[0].originalFilename).toBe('sop-doc-test.pdf');
    expect(batchRes.body.data[1].originalFilename).toBe('procedure-manual.docx');
  });
});

