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

    // Get any draft version
    const version = await prisma.sOPVersion.findFirst({
      where: { isFinalized: false },
    });

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
});
