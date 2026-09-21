import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import {
  ApprovalDecisions,
  MeetingStatuses,
  ParticipantStatuses,
  ParticipationTypes,
  Roles,
  SOPStatuses,
} from '../types';
import { prisma } from './client';
import { seedProductionData } from './seedProd';

export async function seedDemoData() {
  if (
    process.env.APP_ENV === 'production' ||
    process.env.ENABLE_DEMO_ACCOUNTS === 'false' ||
    env.APP_ENV === 'production' ||
    !env.ENABLE_DEMO_ACCOUNTS
  ) {
    console.error('❌ FATAL: Cannot run demo seed when APP_ENV=production or ENABLE_DEMO_ACCOUNTS=false.');
    throw new Error('DEMO SEED BLOCKED: Production environment protection active.');
  }

  console.log('--- Seeding Development / Demo Environment ---');

  // 1. Run base production seed for department definitions
  await seedProductionData();

  // 2. Hash demo password
  const demoPasswordHash = await bcrypt.hash('DemoPassword123!', 10);

  // Fetch departments map
  const depts = await prisma.department.findMany();
  const deptMap = new Map(depts.map((d) => [d.code, d.id]));

  // 3. Create Demo Users (Ground in actual company roster)
  const demoUsersData = [
    {
      employeeId: 'NKB-ADMIN-001',
      username: 'admin',
      fullName: 'System Administrator (IT)',
      email: 'admin@nkb.local',
      role: Roles.SUPER_ADMIN,
      deptCode: 'IT',
      position: 'IT Systems Manager',
    },
    {
      employeeId: 'NKB052026-0003',
      username: 'creator',
      fullName: 'Alonzo, Merry Jean I.',
      email: 'm.alonzo@nkb.local',
      role: Roles.SOP_CREATOR,
      deptCode: 'WH',
      position: 'Senior SOP Documentation Specialist',
    },
    {
      employeeId: 'NKB052026-0020',
      username: 'depthead_wh',
      fullName: 'Luy, Rodello',
      email: 'r.luy@nkb.local',
      role: Roles.DEPARTMENT_HEAD,
      deptCode: 'WH',
      position: 'Warehouse & Inventory Head',
    },
    {
      employeeId: 'NKB052026-0027',
      username: 'deptrep_wh',
      fullName: 'Mercado, Jaycel D.',
      email: 'j.mercado@nkb.local',
      role: Roles.DEPARTMENT_REPRESENTATIVE,
      deptCode: 'WH',
      position: 'Warehouse Team Lead / Rep',
    },
    {
      employeeId: 'NKB052026-0007',
      username: 'depthead_qc',
      fullName: 'Bombita, Raniella Camille',
      email: 'r.bombita@nkb.local',
      role: Roles.DEPARTMENT_HEAD,
      deptCode: 'QC',
      position: 'Quality Control Head',
    },
    {
      employeeId: 'PRJ2026-0013',
      username: 'depthead_qa',
      fullName: 'Fabio, Marilou',
      email: 'm.fabio@nkb.local',
      role: Roles.DEPARTMENT_HEAD,
      deptCode: 'QA',
      position: 'Quality Assurance Head',
    },
    {
      employeeId: 'NKB052026-0017',
      username: 'depthead_pur',
      fullName: 'Gutierrez, Heramae',
      email: 'h.gutierrez@nkb.local',
      role: Roles.DEPARTMENT_HEAD,
      deptCode: 'PUR',
      position: 'Purchasing Head',
    },
    {
      employeeId: 'PRJ2026-0012',
      username: 'reviewer_inv',
      fullName: 'Dela Cruz, Vincent Lloyd',
      email: 'v.delacruz@nkb.local',
      role: Roles.REVIEWER,
      deptCode: 'WH',
      position: 'Inventory Reviewer',
    },
    {
      employeeId: 'NKB052026-0037',
      username: 'consult_acc',
      fullName: 'Razo, Dennis R.',
      email: 'd.razo@nkb.local',
      role: Roles.DEPARTMENT_HEAD,
      deptCode: 'ACC',
      position: 'Accounting Head (Consulted)',
    },
    {
      employeeId: 'NKB052026-0014',
      username: 'employee',
      fullName: 'Delos Santos, Earl John',
      email: 'e.delossantos@nkb.local',
      role: Roles.READ_ONLY,
      deptCode: 'IT',
      position: 'IT Technical Staff',
    },
  ];

  const userMap = new Map<string, string>();

  for (const u of demoUsersData) {
    const existingByEmp = await prisma.user.findUnique({ where: { employeeId: u.employeeId } });
    if (existingByEmp && existingByEmp.username !== u.username) {
      await prisma.user.update({
        where: { id: existingByEmp.id },
        data: { employeeId: `${existingByEmp.employeeId}_OLD_${Date.now()}` },
      });
    }

    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        employeeId: u.employeeId,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        departmentId: deptMap.get(u.deptCode) || null,
        position: u.position,
        isDemoUser: true,
        isActive: true,
      },
      create: {
        employeeId: u.employeeId,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        passwordHash: demoPasswordHash,
        role: u.role,
        departmentId: deptMap.get(u.deptCode) || null,
        position: u.position,
        isDemoUser: true,
        isActive: true,
      },
    });
    userMap.set(u.username, user.id);
  }

  // 4. Assign Department Heads & Representatives
  await prisma.department.update({
    where: { code: 'WH' },
    data: { headUserId: userMap.get('depthead_wh') },
  });

  await prisma.department.update({
    where: { code: 'QC' },
    data: { headUserId: userMap.get('depthead_qc') },
  });

  await prisma.department.update({
    where: { code: 'QA' },
    data: { headUserId: userMap.get('depthead_qa') },
  });

  await prisma.department.update({
    where: { code: 'PUR' },
    data: { headUserId: userMap.get('depthead_pur') },
  });

  await prisma.department.update({
    where: { code: 'ACC' },
    data: { headUserId: userMap.get('consult_acc') },
  });

  // Assign Jaycel Mercado as Warehouse Representative
  const whDeptId = deptMap.get('WH')!;
  const repUserId = userMap.get('deptrep_wh')!;
  await prisma.departmentRepresentative.upsert({
    where: {
      departmentId_userId: {
        departmentId: whDeptId,
        userId: repUserId,
      },
    },
    update: {},
    create: {
      departmentId: whDeptId,
      userId: repUserId,
    },
  });

  console.log('✓ Seeded demo users, department heads, and representatives.');

  // 5. Seed Realistic Sample SOPs
  const creatorId = userMap.get('creator')!;
  const qcDeptId = deptMap.get('QC')!;
  const purDeptId = deptMap.get('PUR')!;
  const accDeptId = deptMap.get('ACC')!;
  const mktDeptId = deptMap.get('MKT')!;
  const engDeptId = deptMap.get('ENG')!;

  // SOP 1: In Review & Ready for Approval (Warehouse Raw Material Receiving)
  const sop1 = await prisma.sOP.upsert({
    where: { sopNumber: 'SOP-WH-001' },
    update: {},
    create: {
      sopNumber: 'SOP-WH-001',
      title: 'Warehouse Raw Material Receiving, Sampling, and Storage Procedure',
      category: 'Warehouse & Inventory',
      ownerDeptId: whDeptId,
      createdById: creatorId,
      currentVersionNumber: '1.0',
      status: SOPStatuses.DEPARTMENT_APPROVAL,
    },
  });

  const sop1Version = await prisma.sOPVersion.upsert({
    where: {
      sopId_versionNumber: {
        sopId: sop1.id,
        versionNumber: '1.0',
      },
    },
    update: {},
    create: {
      sopId: sop1.id,
      versionNumber: '1.0',
      versionInt: 1,
      status: SOPStatuses.DEPARTMENT_APPROVAL,
      title: sop1.title,
      purpose: 'To define standard protocol for receiving, inspecting, quarantining, and shelving incoming chemical ingredients and packaging supplies.',
      scope: 'Applies to all incoming raw materials, packaging materials, and reagents delivered to NKB Manufacturing facility.',
      responsibilities: 'Warehouse Staff: Unloading, visual inspection, physical check.\nQuality Control: Sampling, analytical COA verification, release tag.\nPurchasing: Invoice & PO discrepancy resolution.\nAccounting: GRN invoice confirmation.',
      procedure: '1. Vehicle arrival and seal verification.\n2. Visual container inspection (check damage, leaks, tamper evident tape).\n3. Match delivery receipt with Purchase Order (PO).\n4. Move goods to Quarantine Area with Yellow Tag.\n5. Notify QC for sampling.\n6. Upon QC Pass (Green Tag), transfer to designated rack locations.\n7. Update ERP/Inventory system within 2 hours.',
      relatedForms: 'FM-WH-001 (Goods Receiving Notice), FM-QC-004 (Material Inspection Sheet)',
      references: 'ASEAN Cosmetic GMP Guidelines, ISO 22716:2007 Clause 6.3',
      effectiveDate: new Date('2026-10-01'),
      reviewDate: new Date('2027-10-01'),
      revisionReason: 'Initial Document Standard Release',
      changeSummary: 'New comprehensive receiving procedure integrating barcode validation.',
      createdById: creatorId,
      lockVersion: 1,
    },
  });

  // Setup participants for SOP 1:
  // Warehouse: REQUIRED_APPROVER (Already approved)
  // QC: REQUIRED_APPROVER (Pending approval, agreement confirmed)
  // Purchasing: REQUIRED_APPROVER (Pending agreement & approval)
  // Accounting: CONSULTED (Reviewed)
  // Marketing & Engineering: NOT_INVOLVED (N/A)
  await prisma.sOPParticipant.upsert({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: sop1Version.id,
        departmentId: whDeptId,
      },
    },
    update: {},
    create: {
      sopVersionId: sop1Version.id,
      departmentId: whDeptId,
      participationType: ParticipationTypes.REQUIRED_APPROVER,
      status: ParticipantStatuses.APPROVED,
      agreementConfirmed: true,
      agreementConfirmedAt: new Date('2026-09-18T10:00:00Z'),
      decisionUserId: userMap.get('depthead_wh'),
      decisionAt: new Date('2026-09-18T10:15:00Z'),
      remarks: 'Approved after verifying quarantine space allocation.',
    },
  });

  await prisma.sOPParticipant.upsert({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: sop1Version.id,
        departmentId: qcDeptId,
      },
    },
    update: {},
    create: {
      sopVersionId: sop1Version.id,
      departmentId: qcDeptId,
      participationType: ParticipationTypes.REQUIRED_APPROVER,
      status: ParticipantStatuses.AGREED,
      agreementConfirmed: true,
      agreementConfirmedAt: new Date('2026-09-19T14:30:00Z'),
      remarks: 'Agreement reached in meeting regarding sampling turnaround time.',
    },
  });

  await prisma.sOPParticipant.upsert({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: sop1Version.id,
        departmentId: purDeptId,
      },
    },
    update: {},
    create: {
      sopVersionId: sop1Version.id,
      departmentId: purDeptId,
      participationType: ParticipationTypes.REQUIRED_APPROVER,
      status: ParticipantStatuses.PENDING,
      agreementConfirmed: false,
    },
  });

  await prisma.sOPParticipant.upsert({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: sop1Version.id,
        departmentId: accDeptId,
      },
    },
    update: {},
    create: {
      sopVersionId: sop1Version.id,
      departmentId: accDeptId,
      participationType: ParticipationTypes.CONSULTED,
      status: ParticipantStatuses.REVIEWED,
      decisionUserId: userMap.get('consult_acc'),
      decisionAt: new Date('2026-09-19T11:00:00Z'),
      remarks: 'Reviewed invoice reconciliation timing. No objections.',
    },
  });

  await prisma.sOPParticipant.upsert({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: sop1Version.id,
        departmentId: mktDeptId,
      },
    },
    update: {},
    create: {
      sopVersionId: sop1Version.id,
      departmentId: mktDeptId,
      participationType: ParticipationTypes.NOT_INVOLVED,
      status: ParticipantStatuses.NA,
    },
  });

  await prisma.sOPParticipant.upsert({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: sop1Version.id,
        departmentId: engDeptId,
      },
    },
    update: {},
    create: {
      sopVersionId: sop1Version.id,
      departmentId: engDeptId,
      participationType: ParticipationTypes.NOT_INVOLVED,
      status: ParticipantStatuses.NA,
    },
  });

  // Review Meeting for SOP 1
  await prisma.sOPReviewMeeting.create({
    data: {
      sopVersionId: sop1Version.id,
      meetingDate: new Date('2026-09-19T09:00:00Z'),
      agenda: 'Review quarantine timing, sampling protocol, and supplier return procedure.',
      concerns: 'QC mentioned 24hr turnaround is needed for microbiological media testing before release.',
      recommendations: 'Agreed that quarantine shelf has a designated holding area for pending lab tests.',
      summary: 'Meeting concluded with mutual agreement between Warehouse and QC.',
      status: MeetingStatuses.CONCLUDED,
      createdById: creatorId,
    },
  });

  // Remarks for SOP 1
  const remark1 = await prisma.sOPRemark.create({
    data: {
      sopVersionId: sop1Version.id,
      departmentId: qcDeptId,
      userId: userMap.get('depthead_qc')!,
      comment: 'Please ensure Section 4.5 clearly notes that hazardous solvents require specialized flammables cabinet storage.',
      sectionRef: 'Section 4.5',
      status: 'RESOLVED',
    },
  });

  await prisma.sOPRemark.create({
    data: {
      sopVersionId: sop1Version.id,
      departmentId: whDeptId,
      userId: creatorId,
      comment: 'Updated Section 4.5 with flammables cabinet protocol.',
      parentId: remark1.id,
      status: 'RESOLVED',
    },
  });

  // Approval record from Warehouse Head
  await prisma.sOPApproval.create({
    data: {
      sopVersionId: sop1Version.id,
      departmentId: whDeptId,
      approverUserId: userMap.get('depthead_wh')!,
      decision: ApprovalDecisions.APPROVED,
      reason: 'Formal approval granted following agreement meeting.',
    },
  });

  // SOP 2: Finalized & Published SOP (Quality Control Release Standard)
  const qaDeptId = deptMap.get('QA')!;
  const sop2 = await prisma.sOP.upsert({
    where: { sopNumber: 'SOP-QC-001' },
    update: {},
    create: {
      sopNumber: 'SOP-QC-001',
      title: 'Finished Goods Quality Control Testing and Release Standard',
      category: 'Quality Control',
      ownerDeptId: qcDeptId,
      createdById: creatorId,
      currentVersionNumber: '1.0',
      status: SOPStatuses.FINALIZED,
    },
  });

  const sop2Version = await prisma.sOPVersion.upsert({
    where: {
      sopId_versionNumber: {
        sopId: sop2.id,
        versionNumber: '1.0',
      },
    },
    update: {},
    create: {
      sopId: sop2.id,
      versionNumber: '1.0',
      versionInt: 1,
      status: SOPStatuses.FINALIZED,
      isFinalized: true,
      finalizedAt: new Date('2026-08-15T08:00:00Z'),
      finalizedById: userMap.get('admin'),
      title: sop2.title,
      purpose: 'Standard specification for physico-chemical and microbiological testing of manufactured batches prior to commercial release.',
      scope: 'All cosmetics, topical lotions, serums, and personal care products manufactured at NKB facility.',
      responsibilities: 'QC Analyst: Sampling and testing.\nQC Head: Certificate of Analysis sign-off.\nQA Head: Batch manufacturing record audit and final release stamp.',
      procedure: '1. Random sampling per ANSI/ASQ Z1.4 sampling plan.\n2. Measure pH, viscosity, specific gravity, and color/odor organoleptic evaluation.\n3. Perform total plate count and yeast/mold enumeration.\n4. Record all test findings in LIMS/Laboratory log.\n5. Issue Certificate of Analysis (COA).\n6. Apply Green "RELEASED" sticker on batch pallets upon QA approval.',
      relatedForms: 'FM-QC-010 (Finished Product Test Report), FM-QA-003 (Batch Release Checklist)',
      references: 'FDA Circular No. 2020-025, ISO 11930 Antimicrobial Preservative Efficacy',
      effectiveDate: new Date('2026-08-15'),
      reviewDate: new Date('2027-08-15'),
      revisionReason: 'Annual GMP Document Finalization',
      changeSummary: 'Established certified release testing thresholds.',
      createdById: creatorId,
      lockVersion: 1,
    },
  });

  // Approvals for SOP 2
  await prisma.sOPParticipant.upsert({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: sop2Version.id,
        departmentId: qcDeptId,
      },
    },
    update: {},
    create: {
      sopVersionId: sop2Version.id,
      departmentId: qcDeptId,
      participationType: ParticipationTypes.REQUIRED_APPROVER,
      status: ParticipantStatuses.APPROVED,
      agreementConfirmed: true,
      decisionUserId: userMap.get('depthead_qc'),
      decisionAt: new Date('2026-08-14T10:00:00Z'),
    },
  });

  await prisma.sOPParticipant.upsert({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: sop2Version.id,
        departmentId: qaDeptId,
      },
    },
    update: {},
    create: {
      sopVersionId: sop2Version.id,
      departmentId: qaDeptId,
      participationType: ParticipationTypes.REQUIRED_APPROVER,
      status: ParticipantStatuses.APPROVED,
      agreementConfirmed: true,
      decisionUserId: userMap.get('depthead_qa'),
      decisionAt: new Date('2026-08-14T14:00:00Z'),
    },
  });

  await prisma.sOPApproval.create({
    data: {
      sopVersionId: sop2Version.id,
      departmentId: qcDeptId,
      approverUserId: userMap.get('depthead_qc')!,
      decision: ApprovalDecisions.APPROVED,
      reason: 'Passed technical standards review.',
    },
  });

  await prisma.sOPApproval.create({
    data: {
      sopVersionId: sop2Version.id,
      departmentId: qaDeptId,
      approverUserId: userMap.get('depthead_qa')!,
      decision: ApprovalDecisions.APPROVED,
      reason: 'Compliant with ASEAN Cosmetic GMP requirements.',
    },
  });

  console.log('✓ Seeded sample SOPs across lifecycle stages (SOP-WH-001, SOP-QC-001).');
  console.log('✓ Demo environment ready!');
}

if (require.main === module) {
  seedDemoData()
    .catch((err) => {
      console.error('Demo seed failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
