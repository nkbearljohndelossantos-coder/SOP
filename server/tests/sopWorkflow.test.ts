import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/prisma/client';
import { seedDemoData } from '../src/prisma/seedDemo';
import { ParticipationTypes, SOPStatuses } from '../src/types';

let adminToken: string;
let creatorToken: string;
let whHeadToken: string;
let qcHeadToken: string;
let purHeadToken: string;
let employeeToken: string;

let whDeptId: string;
let qcDeptId: string;
let purDeptId: string;
let accDeptId: string;
let mktDeptId: string;

beforeAll(async () => {
  // Seed demo data
  await seedDemoData();

  // Clean up any existing test records from prior runs
  await prisma.sOP.deleteMany({
    where: {
      OR: [
        { sopNumber: { startsWith: 'SOP-TST' } },
        { sopNumber: { startsWith: 'SOP-CNF' } },
      ],
    },
  });

  // Helper login to retrieve tokens
  async function loginAs(username: string) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username, password: 'DemoPassword123!' });
    return res.body.data.token;
  }

  adminToken = await loginAs('admin');
  creatorToken = await loginAs('creator');
  whHeadToken = await loginAs('depthead_wh');
  qcHeadToken = await loginAs('depthead_qc');
  purHeadToken = await loginAs('depthead_pur');
  employeeToken = await loginAs('employee');

  const depts = await prisma.department.findMany();
  whDeptId = depts.find((d) => d.code === 'WH')!.id;
  qcDeptId = depts.find((d) => d.code === 'QC')!.id;
  purDeptId = depts.find((d) => d.code === 'PUR')!.id;
  accDeptId = depts.find((d) => d.code === 'ACC')!.id;
  mktDeptId = depts.find((d) => d.code === 'MKT')!.id;
});

describe('SOP Lifecycle and Critical Business Rule Tests', () => {
  let createdSopId: string;
  let createdVersionId: string;

  it('Step 1: Creator can create a new SOP with specific department participation', async () => {
    const res = await request(app)
      .post('/api/sops')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        sopNumber: 'SOP-TST-001',
        title: 'Chemical Ingredient Storage and Labeling Protocol',
        category: 'Quality Control',
        ownerDeptId: whDeptId,
        purpose: 'Establish standard safe storage criteria for bulk cosmetic solvents.',
        scope: 'Applies to warehouse storage racks A through D.',
        responsibilities: 'Warehouse Head inspects; QC tests incoming solvents.',
        procedure: '1. Receive drum.\n2. Apply hazard label.\n3. Log into storage ledger.',
        participants: [
          { departmentId: whDeptId, participationType: ParticipationTypes.REQUIRED_APPROVER },
          { departmentId: qcDeptId, participationType: ParticipationTypes.REQUIRED_APPROVER },
          { departmentId: accDeptId, participationType: ParticipationTypes.CONSULTED },
          { departmentId: mktDeptId, participationType: ParticipationTypes.NOT_INVOLVED },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sop.sopNumber).toBe('SOP-TST-001');
    expect(res.body.data.version.status).toBe(SOPStatuses.DRAFT);

    createdSopId = res.body.data.sop.id;
    createdVersionId = res.body.data.version.id;
  });

  it('Step 2: Creator can submit SOP for review and schedule review meeting', async () => {
    const submitRes = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/submit`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe(SOPStatuses.INITIAL_REVIEW);

    const meetingRes = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/meeting`)
      .set('Authorization', `Bearer ${whHeadToken}`)
      .send({
        meetingDate: new Date().toISOString(),
        agenda: 'Review shelf assignments and solvent ventilation.',
      });

    expect(meetingRes.status).toBe(201);
    expect(meetingRes.body.data.agenda).toContain('Review shelf assignments');
  });

  it('TEST 2: A normal employee cannot approve an SOP', async () => {
    const res = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/approve`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        departmentId: whDeptId,
        decision: 'APPROVED',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
  });

  it('TEST 1: A department NOT assigned as Required Approver cannot approve it', async () => {
    // Marketing is NOT_INVOLVED
    const res = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        departmentId: mktDeptId,
        decision: 'APPROVED',
      });

    expect(res.status).toBe(400); // Or 403 / error
    expect(res.body.message).toMatch(/(Not Involved|does not have approval authority)/);
  });

  it('TEST 3: A Department Head can approve ONLY for their authorized department', async () => {
    // QC Head tries to approve for Purchasing
    const res = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/approve`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        departmentId: purDeptId,
        decision: 'APPROVED',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('not authorized to represent or approve');
  });

  it('TEST 13: Formal approval cannot be granted BEFORE agreement confirmation', async () => {
    const res = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/approve`)
      .set('Authorization', `Bearer ${whHeadToken}`)
      .send({
        departmentId: whDeptId,
        decision: 'APPROVED',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('has not confirmed agreement yet');
  });

  it('Step 3: Department Heads confirm agreement during discussion', async () => {
    const agreeWH = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/agreement`)
      .set('Authorization', `Bearer ${whHeadToken}`)
      .send({ departmentId: whDeptId });
    expect(agreeWH.status).toBe(200);

    const agreeQC = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/agreement`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({ departmentId: qcDeptId });
    expect(agreeQC.status).toBe(200);
  });

  it('TEST 15: Requesting changes / rejection REQUIRES a reason', async () => {
    const res = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/approve`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        departmentId: qcDeptId,
        decision: 'CHANGES_REQUESTED',
        reason: '', // Missing reason
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('detailed reason is strictly required');
  });

  it('TEST 5: An SOP CANNOT be finalized when a required approval is pending', async () => {
    // Warehouse approves
    await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/approve`)
      .set('Authorization', `Bearer ${whHeadToken}`)
      .send({
        departmentId: whDeptId,
        decision: 'APPROVED',
        reason: 'Warehouse facilities inspected and confirmed.',
      });

    // QC has NOT approved yet
    const res = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/finalize`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Pending approvals remain for required departments');
  });

  it('TEST 6 & 7: Consulted (ACC) and Not Involved (MKT) departments DO NOT block finalization once Required Approvers approve', async () => {
    // QC now approves
    const qcApprove = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/approve`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        departmentId: qcDeptId,
        decision: 'APPROVED',
        reason: 'Chemical specs verified.',
      });
    expect(qcApprove.status).toBe(200);

    // Now all Required Approvers (WH, QC) have approved!
    // ACC (Consulted) and MKT (Not Involved) must not block finalization
    const finalizeRes = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/finalize`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.success).toBe(true);
    expect(finalizeRes.body.data.isFinalized).toBe(true);
    expect(finalizeRes.body.data.status).toBe(SOPStatuses.FINALIZED);
  });

  it('TEST 9: Finalized SOPs CANNOT be directly edited', async () => {
    const res = await request(app)
      .put(`/api/sops/versions/${createdVersionId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: 'Tampered SOP title after finalization',
        lockVersion: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Finalized SOP versions cannot be edited');
  });

  it('TEST 10: Creating a new revision preserves the previous finalized version', async () => {
    const revRes = await request(app)
      .post(`/api/sops/${createdSopId}/revisions`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        revisionReason: 'Updated safety threshold for acetone storage.',
        changeSummary: 'Added spark-proof ventilation requirement in Section 3.',
      });

    expect(revRes.status).toBe(201);
    expect(revRes.body.data.versionNumber).toBe('1.1');
    expect(revRes.body.data.isFinalized).toBe(false);

    // Verify version 1.0 is still finalized and intact
    const oldVersion = await prisma.sOPVersion.findUnique({
      where: { id: createdVersionId },
    });
    expect(oldVersion?.versionNumber).toBe('1.0');
    expect(oldVersion?.isFinalized).toBe(true);
    expect(oldVersion?.status).toBe(SOPStatuses.FINALIZED);
  });

  it('TEST 4: An OLD SOP version CANNOT be approved after a new version exists', async () => {
    // Attempting to approve version 1.0 now that version 1.1 exists
    const res = await request(app)
      .post(`/api/workflow/versions/${createdVersionId}/approve`)
      .set('Authorization', `Bearer ${whHeadToken}`)
      .send({
        departmentId: whDeptId,
        decision: 'APPROVED',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/(Outdated Version|Cannot approve an older SOP version|Finalized)/);
  });

  it('TEST 8: A changes-requested SOP cannot be finalized', async () => {
    // On the new revision v1.1, submit for review
    const newVersion = await prisma.sOPVersion.findFirst({
      where: { sopId: createdSopId, versionNumber: '1.1' },
    });

    await request(app)
      .post(`/api/workflow/versions/${newVersion!.id}/submit`)
      .set('Authorization', `Bearer ${creatorToken}`);

    // Confirm agreement first
    await request(app)
      .post(`/api/workflow/versions/${newVersion!.id}/agreement`)
      .set('Authorization', `Bearer ${whHeadToken}`)
      .send({ departmentId: whDeptId });

    // QC requests changes
    const changeReq = await request(app)
      .post(`/api/workflow/versions/${newVersion!.id}/approve`)
      .set('Authorization', `Bearer ${qcHeadToken}`)
      .send({
        departmentId: qcDeptId,
        decision: 'CHANGES_REQUESTED',
        reason: 'Please specify explosion-proof exhaust fan CFM rating.',
      });

    expect(changeReq.status).toBe(200);

    // Try to finalize
    const finalRes = await request(app)
      .post(`/api/workflow/versions/${newVersion!.id}/finalize`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(finalRes.status).toBe(400);
    expect(finalRes.body.message).toMatch(/(unresolved changes requested|Pending approvals remain)/);
  });

  it('TEST 16: Concurrency conflict is detected and blocked with optimistic locking', async () => {
    // Create a fresh draft
    const draftRes = await request(app)
      .post('/api/sops')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        sopNumber: 'SOP-CNF-001',
        title: 'Concurrent Edit Test SOP',
        category: 'Information Technology',
        ownerDeptId: whDeptId,
        purpose: 'Concurrency test purpose',
        scope: 'Concurrency test scope',
        responsibilities: 'Warehouse Staff and Laboratory Operators',
        procedure: 'Standard procedure step details',
        participants: [{ departmentId: whDeptId, participationType: ParticipationTypes.REQUIRED_APPROVER }],
      });

    const vId = draftRes.body.data.version.id;

    // User A updates draft (increments lockVersion to 2)
    const updateA = await request(app)
      .put(`/api/sops/versions/${vId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: 'First User Update',
        lockVersion: 1, // Matches current
      });
    expect(updateA.status).toBe(200);

    // User B tries to save with stale lockVersion 1
    const updateB = await request(app)
      .put(`/api/sops/versions/${vId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: 'Conflicting Second User Update',
        lockVersion: 1, // Stale!
      });

    expect(updateB.status).toBe(409);
    expect(updateB.body.message).toContain('Concurrency Conflict');
  });
});
