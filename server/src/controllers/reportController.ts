import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { ParticipationTypes, Roles, SOPStatuses } from '../types';

export async function getDashboardSummary(req: Request, res: Response) {
  const user = req.user!;

  const [
    totalSOPs,
    drafts,
    underReview,
    changesRequested,
    approved,
    finalized,
    archived,
  ] = await Promise.all([
    prisma.sOP.count({ where: { status: { not: SOPStatuses.ARCHIVED } } }),
    prisma.sOP.count({ where: { status: SOPStatuses.DRAFT } }),
    prisma.sOP.count({
      where: {
        status: {
          in: [
            SOPStatuses.INITIAL_REVIEW,
            SOPStatuses.UNDER_REVIEW,
            SOPStatuses.DISCUSSION,
            SOPStatuses.AGREEMENT_PENDING,
            SOPStatuses.DEPARTMENT_APPROVAL,
          ],
        },
      },
    }),
    prisma.sOP.count({
      where: {
        status: { in: [SOPStatuses.CHANGES_REQUESTED, SOPStatuses.RETURNED_TO_CREATOR] },
      },
    }),
    prisma.sOP.count({ where: { status: SOPStatuses.FINAL_REVIEW } }),
    prisma.sOP.count({ where: { status: SOPStatuses.FINALIZED } }),
    prisma.sOP.count({ where: { status: SOPStatuses.ARCHIVED } }),
  ]);

  // "My Tasks" calculation based on user's role and department
  let awaitingMyApprovalCount = 0;
  let awaitingMyReviewCount = 0;
  let myReturnedToCreatorCount = 0;
  let myOpenRemarksCount = 0;

  // If user is a Department Head or Representative, check pending approvals for their department
  if (
    user.role === Roles.DEPARTMENT_HEAD ||
    user.role === Roles.DEPARTMENT_REPRESENTATIVE ||
    user.role === Roles.APPROVER ||
    user.role === Roles.SUPER_ADMIN
  ) {
    const userDeptIds: string[] = [];
    if (user.departmentId) userDeptIds.push(user.departmentId);

    // Also check headed department and rep departments
    const headed = await prisma.department.findUnique({ where: { headUserId: user.id } });
    if (headed && !userDeptIds.includes(headed.id)) userDeptIds.push(headed.id);

    const reps = await prisma.departmentRepresentative.findMany({ where: { userId: user.id } });
    reps.forEach((r) => {
      if (!userDeptIds.includes(r.departmentId)) userDeptIds.push(r.departmentId);
    });

    if (userDeptIds.length > 0) {
      awaitingMyApprovalCount = await prisma.sOPParticipant.count({
        where: {
          departmentId: { in: userDeptIds },
          participationType: ParticipationTypes.REQUIRED_APPROVER,
          status: { in: ['PENDING', 'AGREED'] },
          sopVersion: {
            status: { in: [SOPStatuses.DISCUSSION, SOPStatuses.AGREEMENT_PENDING, SOPStatuses.DEPARTMENT_APPROVAL] },
          },
        },
      });

      awaitingMyReviewCount = await prisma.sOPParticipant.count({
        where: {
          departmentId: { in: userDeptIds },
          participationType: ParticipationTypes.REQUIRED_REVIEWER,
          status: 'PENDING',
          sopVersion: {
            status: { in: [SOPStatuses.INITIAL_REVIEW, SOPStatuses.UNDER_REVIEW, SOPStatuses.DISCUSSION] },
          },
        },
      });
    }
  }

  // Creator's returned SOPs
  myReturnedToCreatorCount = await prisma.sOP.count({
    where: {
      createdById: user.id,
      status: { in: [SOPStatuses.CHANGES_REQUESTED, SOPStatuses.RETURNED_TO_CREATOR] },
    },
  });

  // Open remarks on SOPs created by user
  myOpenRemarksCount = await prisma.sOPRemark.count({
    where: {
      status: 'OPEN',
      sopVersion: { createdById: user.id },
    },
  });

  // Recently updated SOPs
  const recentSOPs = await prisma.sOP.findMany({
    take: 6,
    orderBy: { updatedAt: 'desc' },
    include: {
      ownerDept: { select: { name: true, code: true } },
      createdBy: { select: { fullName: true } },
    },
  });

  return res.json({
    success: true,
    data: {
      metrics: {
        totalSOPs,
        drafts,
        underReview,
        changesRequested,
        approved,
        finalized,
        archived,
      },
      myTasks: {
        awaitingMyApproval: awaitingMyApprovalCount,
        awaitingMyReview: awaitingMyReviewCount,
        returnedToCreator: myReturnedToCreatorCount,
        openRemarks: myOpenRemarksCount,
      },
      recentSOPs,
    },
  });
}

export async function getStatusBreakdownReport(req: Request, res: Response) {
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });

  const sops = await prisma.sOP.findMany({
    select: { id: true, ownerDeptId: true, status: true },
  });

  const breakdown = departments.map((dept) => {
    const deptSOPs = sops.filter((s) => s.ownerDeptId === dept.id);
    return {
      department: dept.name,
      code: dept.code,
      total: deptSOPs.length,
      drafts: deptSOPs.filter((s) => s.status === SOPStatuses.DRAFT).length,
      inReview: deptSOPs.filter((s) =>
        [
          SOPStatuses.INITIAL_REVIEW,
          SOPStatuses.UNDER_REVIEW,
          SOPStatuses.DISCUSSION,
          SOPStatuses.AGREEMENT_PENDING,
          SOPStatuses.DEPARTMENT_APPROVAL,
        ].includes(s.status as any)
      ).length,
      finalized: deptSOPs.filter((s) => s.status === SOPStatuses.FINALIZED).length,
      changesRequested: deptSOPs.filter((s) =>
        [SOPStatuses.CHANGES_REQUESTED, SOPStatuses.RETURNED_TO_CREATOR].includes(s.status as any)
      ).length,
    };
  });

  return res.json({ success: true, data: breakdown });
}

export async function getPendingApprovalsReport(req: Request, res: Response) {
  const pendingParticipants = await prisma.sOPParticipant.findMany({
    where: {
      participationType: ParticipationTypes.REQUIRED_APPROVER,
      status: { not: 'APPROVED' },
      sopVersion: {
        status: { in: [SOPStatuses.AGREEMENT_PENDING, SOPStatuses.DEPARTMENT_APPROVAL] },
      },
    },
    include: {
      department: {
        select: {
          name: true,
          code: true,
          head: { select: { fullName: true, employeeId: true, email: true } },
        },
      },
      sopVersion: {
        include: {
          sop: { select: { id: true, sopNumber: true, title: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const formatted = pendingParticipants.map((p) => ({
    sopId: p.sopVersion.sop.id,
    sopNumber: p.sopVersion.sop.sopNumber,
    sopTitle: p.sopVersion.sop.title,
    versionNumber: p.sopVersion.versionNumber,
    department: p.department.name,
    departmentHead: p.department.head?.fullName || 'Unassigned',
    headEmail: p.department.head?.email || 'N/A',
    status: p.status,
    agreementConfirmed: p.agreementConfirmed,
    pendingSince: p.createdAt,
  }));

  return res.json({ success: true, data: formatted });
}
