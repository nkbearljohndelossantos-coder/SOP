import { prisma } from '../prisma/client';
import {
  ApprovalDecisions,
  ParticipantStatuses,
  ParticipationTypes,
  SOPStatuses,
} from '../types';
import { logAudit } from './auditService';
import { notifyConcernedUsers } from './notificationService';

export interface CreateSOPInput {
  sopNumber: string;
  title: string;
  category: string;
  ownerDeptId: string;
  createdById: string;
  purpose: string;
  scope: string;
  responsibilities: string;
  procedure: string;
  relatedForms?: string;
  references?: string;
  effectiveDate?: Date | null;
  reviewDate?: Date | null;
  revisionReason?: string;
  changeSummary?: string;
  participants: Array<{
    departmentId: string;
    participationType: 'REQUIRED_APPROVER' | 'REQUIRED_REVIEWER' | 'CONSULTED' | 'NOT_INVOLVED';
  }>;
}

export interface UpdateDraftInput {
  title?: string;
  category?: string;
  purpose?: string;
  scope?: string;
  responsibilities?: string;
  procedure?: string;
  relatedForms?: string;
  references?: string;
  effectiveDate?: Date | null;
  reviewDate?: Date | null;
  revisionReason?: string;
  changeSummary?: string;
  lockVersion: number;
  participants?: Array<{
    departmentId: string;
    participationType: 'REQUIRED_APPROVER' | 'REQUIRED_REVIEWER' | 'CONSULTED' | 'NOT_INVOLVED';
  }>;
}

export async function generateNextSOPNumber(departmentId: string): Promise<string> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
  });
  if (!dept) {
    throw new Error('Department not found.');
  }

  const prefix = `SOP-${dept.code.toUpperCase()}-`;

  const existingSOPs = await prisma.sOP.findMany({
    where: {
      OR: [
        { ownerDeptId: departmentId },
        { sopNumber: { startsWith: prefix } },
      ],
    },
    select: { sopNumber: true },
  });

  let maxSeq = 0;
  for (const s of existingSOPs) {
    const match = s.sopNumber.match(new RegExp(`^${prefix}(\\d+)`, 'i'));
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export async function createSOP(input: CreateSOPInput, ipAddress?: string) {
  // Validate owner department exists
  const ownerDept = await prisma.department.findUnique({
    where: { id: input.ownerDeptId },
  });
  if (!ownerDept) {
    throw new Error('Owner department not found.');
  }

  // Auto-generate SOP number if omitted or requested
  if (!input.sopNumber || input.sopNumber.trim() === '' || input.sopNumber === 'AUTO') {
    input.sopNumber = await generateNextSOPNumber(input.ownerDeptId);
  }

  // Verify SOP number uniqueness
  const existing = await prisma.sOP.findUnique({
    where: { sopNumber: input.sopNumber },
  });
  if (existing) {
    throw new Error(`SOP number '${input.sopNumber}' already exists.`);
  }

  // Use a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create SOP root record
    const sop = await tx.sOP.create({
      data: {
        sopNumber: input.sopNumber,
        title: input.title,
        category: input.category,
        ownerDeptId: input.ownerDeptId,
        createdById: input.createdById,
        currentVersionNumber: '1.0',
        status: SOPStatuses.DRAFT,
      },
    });

    // 2. Create initial SOPVersion 1.0
    const version = await tx.sOPVersion.create({
      data: {
        sopId: sop.id,
        versionNumber: '1.0',
        versionInt: 1,
        status: SOPStatuses.DRAFT,
        title: input.title,
        purpose: input.purpose,
        scope: input.scope,
        responsibilities: input.responsibilities,
        procedure: input.procedure,
        relatedForms: input.relatedForms,
        references: input.references,
        effectiveDate: input.effectiveDate,
        reviewDate: input.reviewDate,
        revisionReason: input.revisionReason || 'Initial Creation',
        changeSummary: input.changeSummary || 'Initial document draft',
        createdById: input.createdById,
        lockVersion: 1,
      },
    });

    // 3. Create SOPParticipants
    // Ensure the owner department is participating (at least as Required Approver if not specified)
    const deptParticipationMap = new Map<string, string>();
    for (const p of input.participants) {
      deptParticipationMap.set(p.departmentId, p.participationType);
    }
    if (!deptParticipationMap.has(input.ownerDeptId)) {
      deptParticipationMap.set(input.ownerDeptId, ParticipationTypes.REQUIRED_APPROVER);
    }

    // All active departments in organization
    const allDepartments = await tx.department.findMany({
      where: { isActive: true },
    });

    for (const dept of allDepartments) {
      const pType = deptParticipationMap.get(dept.id) || ParticipationTypes.NOT_INVOLVED;
      await tx.sOPParticipant.create({
        data: {
          sopVersionId: version.id,
          departmentId: dept.id,
          participationType: pType,
          status: pType === ParticipationTypes.NOT_INVOLVED ? ParticipantStatuses.NA : ParticipantStatuses.PENDING,
        },
      });
    }

    return { sop, version };
  });

  await logAudit({
    userId: input.createdById,
    action: 'SOP_CREATED',
    entity: 'SOP',
    entityId: result.sop.id,
    newValue: { sopNumber: result.sop.sopNumber, title: result.sop.title, version: '1.0' },
    ipAddress,
  });

  return result;
}

export async function updateDraft(
  versionId: string,
  userId: string,
  input: UpdateDraftInput,
  ipAddress?: string
) {
  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { sop: true },
  });

  if (!version) {
    throw new Error('SOP Version not found.');
  }

  if (version.isFinalized) {
    throw new Error('Finalized SOP versions cannot be edited. A new revision must be created.');
  }

  if (version.status !== SOPStatuses.DRAFT && version.status !== SOPStatuses.RETURNED_TO_CREATOR) {
    throw new Error(`Cannot edit SOP in status '${version.status}'. Only DRAFT or RETURNED_TO_CREATOR can be edited.`);
  }

  // Optimistic concurrency control
  if (version.lockVersion !== input.lockVersion) {
    throw new Error('Concurrency Conflict: The SOP has been modified by another session. Please reload the latest version.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedVersion = await tx.sOPVersion.update({
      where: { id: versionId },
      data: {
        title: input.title ?? version.title,
        purpose: input.purpose ?? version.purpose,
        scope: input.scope ?? version.scope,
        responsibilities: input.responsibilities ?? version.responsibilities,
        procedure: input.procedure ?? version.procedure,
        relatedForms: input.relatedForms ?? version.relatedForms,
        references: input.references ?? version.references,
        effectiveDate: input.effectiveDate !== undefined ? input.effectiveDate : version.effectiveDate,
        reviewDate: input.reviewDate !== undefined ? input.reviewDate : version.reviewDate,
        revisionReason: input.revisionReason ?? version.revisionReason,
        changeSummary: input.changeSummary ?? version.changeSummary,
        lockVersion: { increment: 1 },
      },
    });

    if (input.title) {
      await tx.sOP.update({
        where: { id: version.sopId },
        data: {
          title: input.title,
          category: input.category ?? version.sop.category,
        },
      });
    }

    // Update participants if supplied
    if (input.participants && input.participants.length > 0) {
      for (const p of input.participants) {
        await tx.sOPParticipant.upsert({
          where: {
            sopVersionId_departmentId: {
              sopVersionId: version.id,
              departmentId: p.departmentId,
            },
          },
          update: {
            participationType: p.participationType,
            status: p.participationType === ParticipationTypes.NOT_INVOLVED ? ParticipantStatuses.NA : ParticipantStatuses.PENDING,
          },
          create: {
            sopVersionId: version.id,
            departmentId: p.departmentId,
            participationType: p.participationType,
            status: p.participationType === ParticipationTypes.NOT_INVOLVED ? ParticipantStatuses.NA : ParticipantStatuses.PENDING,
          },
        });
      }
    }

    return updatedVersion;
  });

  await logAudit({
    userId,
    action: 'SOP_EDITED',
    entity: 'SOPVersion',
    entityId: version.id,
    oldValue: { lockVersion: version.lockVersion },
    newValue: { lockVersion: result.lockVersion },
    ipAddress,
  });

  return result;
}

export async function calculateApprovalMatrix(versionId: string) {
  const participants = await prisma.sOPParticipant.findMany({
    where: { sopVersionId: versionId },
    include: {
      department: {
        include: {
          head: {
            select: { id: true, fullName: true, employeeId: true, email: true },
          },
          representatives: {
            include: {
              user: {
                select: { id: true, fullName: true, employeeId: true, email: true },
              },
            },
          },
        },
      },
      decisionUser: {
        select: { id: true, fullName: true, employeeId: true },
      },
    },
    orderBy: {
      department: { name: 'asc' },
    },
  });

  const requiredApprovers = participants.filter(
    (p) => p.participationType === ParticipationTypes.REQUIRED_APPROVER
  );
  const requiredReviewers = participants.filter(
    (p) => p.participationType === ParticipationTypes.REQUIRED_REVIEWER
  );
  const consulted = participants.filter(
    (p) => p.participationType === ParticipationTypes.CONSULTED
  );
  const notInvolved = participants.filter(
    (p) => p.participationType === ParticipationTypes.NOT_INVOLVED
  );

  const approvedCount = requiredApprovers.filter((p) => p.status === ParticipantStatuses.APPROVED).length;
  const reviewCompletedCount = requiredReviewers.filter(
    (p) => p.status === ParticipantStatuses.REVIEWED || p.status === ParticipantStatuses.AGREED || p.status === ParticipantStatuses.APPROVED
  ).length;

  const allRequiredApproved = requiredApprovers.length > 0 && approvedCount === requiredApprovers.length;
  const allRequiredReviewsCompleted = requiredReviewers.length === 0 || reviewCompletedCount === requiredReviewers.length;

  const hasBlockingChangesRequested = requiredApprovers.some(
    (p) => p.status === ParticipantStatuses.CHANGES_REQUESTED
  );

  const pendingApproverDeptNames = requiredApprovers
    .filter((p) => p.status !== ParticipantStatuses.APPROVED)
    .map((p) => p.department.name);

  const pendingReviewerDeptNames = requiredReviewers
    .filter((p) => p.status === ParticipantStatuses.PENDING)
    .map((p) => p.department.name);

  return {
    requiredApprovers,
    requiredReviewers,
    consulted,
    notInvolved,
    totalRequiredApprovers: requiredApprovers.length,
    approvedCount,
    totalRequiredReviewers: requiredReviewers.length,
    reviewCompletedCount,
    allRequiredApproved,
    allRequiredReviewsCompleted,
    hasBlockingChangesRequested,
    pendingApproverDeptNames,
    pendingReviewerDeptNames,
    canFinalize: allRequiredApproved && allRequiredReviewsCompleted && !hasBlockingChangesRequested,
  };
}

export async function createNewRevision(
  sopId: string,
  userId: string,
  input: {
    revisionReason: string;
    changeSummary: string;
    purpose?: string;
    scope?: string;
    responsibilities?: string;
    procedure?: string;
    relatedForms?: string;
    references?: string;
    effectiveDate?: Date | null;
    reviewDate?: Date | null;
    participants?: Array<{
      departmentId: string;
      participationType: 'REQUIRED_APPROVER' | 'REQUIRED_REVIEWER' | 'CONSULTED' | 'NOT_INVOLVED';
    }>;
  },
  ipAddress?: string
) {
  const sop = await prisma.sOP.findUnique({
    where: { id: sopId },
    include: {
      versions: {
        orderBy: { versionInt: 'desc' },
        take: 1,
      },
    },
  });

  if (!sop || sop.versions.length === 0) {
    throw new Error('SOP not found.');
  }

  const latestVersion = sop.versions[0];
  const newVersionInt = latestVersion.versionInt + 1;
  const newVersionNumber = (1 + (newVersionInt - 1) * 0.1).toFixed(1);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the new version record (status DRAFT)
    const newVersion = await tx.sOPVersion.create({
      data: {
        sopId: sop.id,
        versionNumber: newVersionNumber,
        versionInt: newVersionInt,
        status: SOPStatuses.DRAFT,
        title: sop.title,
        purpose: input.purpose ?? latestVersion.purpose,
        scope: input.scope ?? latestVersion.scope,
        responsibilities: input.responsibilities ?? latestVersion.responsibilities,
        procedure: input.procedure ?? latestVersion.procedure,
        relatedForms: input.relatedForms ?? latestVersion.relatedForms,
        references: input.references ?? latestVersion.references,
        effectiveDate: input.effectiveDate !== undefined ? input.effectiveDate : latestVersion.effectiveDate,
        reviewDate: input.reviewDate !== undefined ? input.reviewDate : latestVersion.reviewDate,
        revisionReason: input.revisionReason,
        changeSummary: input.changeSummary,
        createdById: userId,
        lockVersion: 1,
      },
    });

    // 2. Update SOP root record
    await tx.sOP.update({
      where: { id: sop.id },
      data: {
        currentVersionNumber: newVersionNumber,
        status: SOPStatuses.DRAFT,
      },
    });

    // 3. Setup participants for new version (inherit participation types or apply overrides)
    const previousParticipants = await tx.sOPParticipant.findMany({
      where: { sopVersionId: latestVersion.id },
    });

    const overrideMap = new Map<string, string>();
    if (input.participants) {
      input.participants.forEach((p) => overrideMap.set(p.departmentId, p.participationType));
    }

    for (const prevP of previousParticipants) {
      const participationType = (overrideMap.get(prevP.departmentId) || prevP.participationType) as any;
      await tx.sOPParticipant.create({
        data: {
          sopVersionId: newVersion.id,
          departmentId: prevP.departmentId,
          participationType,
          status: participationType === ParticipationTypes.NOT_INVOLVED ? ParticipantStatuses.NA : ParticipantStatuses.PENDING,
          agreementConfirmed: false,
          decisionUserId: null,
          decisionAt: null,
          remarks: null,
        },
      });
    }

    return newVersion;
  });

  await logAudit({
    userId,
    action: 'SOP_REVISION_CREATED',
    entity: 'SOPVersion',
    entityId: result.id,
    newValue: {
      sopNumber: sop.sopNumber,
      previousVersion: latestVersion.versionNumber,
      newVersion: newVersionNumber,
      revisionReason: input.revisionReason,
    },
    ipAddress,
  });

  return result;
}
