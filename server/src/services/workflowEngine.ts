import { prisma } from '../prisma/client';
import {
  ApprovalDecisions,
  MeetingStatuses,
  ParticipantStatuses,
  ParticipationTypes,
  Roles,
  SOPStatuses,
} from '../types';
import { logAudit } from './auditService';
import { notifyConcernedUsers } from './notificationService';
import { calculateApprovalMatrix } from './sopService';

export async function submitForReview(versionId: string, userId: string, ipAddress?: string) {
  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { sop: true, participants: true },
  });

  if (!version) throw new Error('SOP Version not found.');
  if (version.isFinalized) throw new Error('Cannot submit a finalized SOP.');
  if (version.status !== SOPStatuses.DRAFT && version.status !== SOPStatuses.RETURNED_TO_CREATOR) {
    throw new Error(`Cannot submit SOP in status '${version.status}'. Must be DRAFT or RETURNED_TO_CREATOR.`);
  }

  // Ensure there is at least one required approver
  const reqApprover = version.participants.find(
    (p) => p.participationType === ParticipationTypes.REQUIRED_APPROVER
  );
  if (!reqApprover) {
    throw new Error('SOP must have at least one Required Approver department.');
  }

  const updatedVersion = await prisma.$transaction(async (tx) => {
    const updated = await tx.sOPVersion.update({
      where: { id: versionId },
      data: { status: SOPStatuses.INITIAL_REVIEW },
    });

    await tx.sOP.update({
      where: { id: version.sopId },
      data: { status: SOPStatuses.INITIAL_REVIEW },
    });

    return updated;
  });

  await logAudit({
    userId,
    action: 'SOP_SUBMITTED',
    entity: 'SOPVersion',
    entityId: versionId,
    oldValue: { status: version.status },
    newValue: { status: SOPStatuses.INITIAL_REVIEW },
    ipAddress,
  });

  const concernedDeptIds = version.participants
    .filter((p) => p.participationType !== ParticipationTypes.NOT_INVOLVED)
    .map((p) => p.departmentId);

  await notifyConcernedUsers({
    departmentIds: concernedDeptIds,
    title: 'New SOP Submitted for Review',
    message: `SOP ${version.sop.sopNumber} (v${version.versionNumber}) - '${version.title}' has been submitted for review.`,
    type: 'SOP_SUBMITTED',
    link: `/sops/${version.sopId}?version=${version.versionNumber}`,
  });

  return updatedVersion;
}

export async function scheduleReviewMeeting(
  versionId: string,
  userId: string,
  input: {
    meetingDate: Date;
    agenda: string;
    concerns?: string;
    recommendations?: string;
  },
  ipAddress?: string
) {
  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { sop: true, participants: true },
  });

  if (!version) throw new Error('SOP Version not found.');
  if (version.isFinalized) throw new Error('Cannot schedule meeting for finalized SOP.');

  const meeting = await prisma.$transaction(async (tx) => {
    const m = await tx.sOPReviewMeeting.create({
      data: {
        sopVersionId: versionId,
        meetingDate: input.meetingDate,
        agenda: input.agenda,
        concerns: input.concerns,
        recommendations: input.recommendations,
        status: MeetingStatuses.SCHEDULED,
        createdById: userId,
      },
    });

    // Advance status to DISCUSSION
    await tx.sOPVersion.update({
      where: { id: versionId },
      data: { status: SOPStatuses.DISCUSSION },
    });

    await tx.sOP.update({
      where: { id: version.sopId },
      data: { status: SOPStatuses.DISCUSSION },
    });

    return m;
  });

  await logAudit({
    userId,
    action: 'SOP_MEETING_SCHEDULED',
    entity: 'SOPReviewMeeting',
    entityId: meeting.id,
    newValue: { agenda: input.agenda, meetingDate: input.meetingDate },
    ipAddress,
  });

  const concernedDeptIds = version.participants
    .filter((p) => p.participationType !== ParticipationTypes.NOT_INVOLVED)
    .map((p) => p.departmentId);

  await notifyConcernedUsers({
    departmentIds: concernedDeptIds,
    title: 'SOP Review Meeting Scheduled',
    message: `A review meeting for SOP ${version.sop.sopNumber} v${version.versionNumber} has been scheduled.`,
    type: 'MEETING_SCHEDULED',
    link: `/sops/${version.sopId}?tab=meeting`,
  });

  return meeting;
}

export async function confirmAgreement(
  versionId: string,
  departmentId: string,
  userId: string,
  ipAddress?: string
) {
  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { sop: true },
  });

  if (!version) throw new Error('SOP Version not found.');
  if (version.isFinalized) throw new Error('SOP Version is already finalized.');

  const participant = await prisma.sOPParticipant.findUnique({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: versionId,
        departmentId,
      },
    },
    include: { department: true },
  });

  if (!participant) {
    throw new Error('Department is not registered for this SOP.');
  }

  if (participant.participationType === ParticipationTypes.NOT_INVOLVED) {
    throw new Error('Not Involved departments cannot participate in agreement.');
  }

  const { updatedParticipant, allAgreed } = await prisma.$transaction(async (tx) => {
    const updated = await tx.sOPParticipant.update({
      where: { id: participant.id },
      data: {
        agreementConfirmed: true,
        agreementConfirmedAt: new Date(),
        status: participant.status === ParticipantStatuses.PENDING ? ParticipantStatuses.AGREED : participant.status,
      },
    });

    // Check if all required approvers have confirmed agreement
    const allParticipants = await tx.sOPParticipant.findMany({
      where: { sopVersionId: versionId },
    });

    const reqApprovers = allParticipants.filter(
      (p) => p.participationType === ParticipationTypes.REQUIRED_APPROVER
    );

    const agreed = reqApprovers.every((p) => (p.id === participant.id ? true : p.agreementConfirmed));

    if (agreed) {
      await tx.sOPVersion.update({
        where: { id: versionId },
        data: { status: SOPStatuses.DEPARTMENT_APPROVAL },
      });
      await tx.sOP.update({
        where: { id: version.sopId },
        data: { status: SOPStatuses.DEPARTMENT_APPROVAL },
      });
    }

    return { updatedParticipant: updated, allAgreed: agreed };
  });

  await logAudit({
    userId,
    action: 'AGREEMENT_CONFIRMED',
    entity: 'SOPParticipant',
    entityId: participant.id,
    metadata: { department: participant.department.name, allAgreed },
    ipAddress,
  });

  return updatedParticipant;
}

export async function submitApprovalDecision(
  versionId: string,
  departmentId: string,
  userId: string,
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED',
  reason?: string,
  ipAddress?: string,
  userAgent?: string
) {
  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { sop: true },
  });

  if (!version) throw new Error('SOP Version not found.');
  if (version.isFinalized) throw new Error('Finalized SOPs cannot receive approval decisions.');

  // Validate version is the latest active version of the SOP
  const latestVersion = await prisma.sOPVersion.findFirst({
    where: { sopId: version.sopId },
    orderBy: { versionInt: 'desc' },
  });

  if (latestVersion?.id !== version.id) {
    throw new Error('Outdated Version: Cannot approve an older SOP version after a newer version has been created.');
  }

  const participant = await prisma.sOPParticipant.findUnique({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: versionId,
        departmentId,
      },
    },
    include: { department: true },
  });

  if (!participant) {
    throw new Error('Department is not a participant in this SOP.');
  }

  if (participant.participationType === ParticipationTypes.NOT_INVOLVED) {
    throw new Error('Not Involved departments cannot approve or reject this SOP.');
  }

  if (participant.participationType !== ParticipationTypes.REQUIRED_APPROVER) {
    throw new Error(
      `Department '${participant.department.name}' is configured as ${participant.participationType} and does not have approval authority.`
    );
  }

  // If APPROVING: Agreement MUST be confirmed first!
  if (decision === ApprovalDecisions.APPROVED) {
    if (!participant.agreementConfirmed) {
      throw new Error(
        `Department '${participant.department.name}' has not confirmed agreement yet. Department representatives must discuss and confirm agreement before formal approval.`
      );
    }
  }

  // If CHANGES_REQUESTED or REJECTED: Reason is strictly mandatory
  if (decision === ApprovalDecisions.CHANGES_REQUESTED || decision === ApprovalDecisions.REJECTED) {
    if (!reason || reason.trim().length < 5) {
      throw new Error('A detailed reason is strictly required when requesting changes or rejecting an SOP.');
    }
  }

  // Execute database transaction for approval record & participant status update
  const approval = await prisma.$transaction(async (tx) => {
    const appRecord = await tx.sOPApproval.create({
      data: {
        sopVersionId: versionId,
        departmentId,
        approverUserId: userId,
        decision,
        reason: reason?.trim() || null,
        ipAddress,
        userAgent,
      },
    });

    if (decision === ApprovalDecisions.APPROVED) {
      await tx.sOPParticipant.update({
        where: { id: participant.id },
        data: {
          status: ParticipantStatuses.APPROVED,
          decisionUserId: userId,
          decisionAt: new Date(),
          remarks: reason?.trim() || null,
        },
      });
    } else {
      // CHANGES_REQUESTED or REJECTED
      await tx.sOPParticipant.update({
        where: { id: participant.id },
        data: {
          status: ParticipantStatuses.CHANGES_REQUESTED,
          decisionUserId: userId,
          decisionAt: new Date(),
          remarks: reason?.trim(),
          agreementConfirmed: false,
        },
      });

      await tx.sOPRemark.create({
        data: {
          sopVersionId: versionId,
          departmentId,
          userId,
          comment: `[CHANGES REQUESTED - ${decision}]: ${reason?.trim()}`,
          status: 'OPEN',
        },
      });

      await tx.sOPVersion.update({
        where: { id: versionId },
        data: { status: SOPStatuses.CHANGES_REQUESTED },
      });

      await tx.sOP.update({
        where: { id: version.sopId },
        data: { status: SOPStatuses.RETURNED_TO_CREATOR },
      });
    }

    return appRecord;
  });

  // Post-transaction check & notifications outside transaction
  if (decision === ApprovalDecisions.APPROVED) {
    const matrix = await calculateApprovalMatrix(versionId);
    if (matrix.canFinalize) {
      await prisma.sOPVersion.update({
        where: { id: versionId },
        data: { status: SOPStatuses.FINAL_REVIEW },
      });
      await prisma.sOP.update({
        where: { id: version.sopId },
        data: { status: SOPStatuses.FINAL_REVIEW },
      });

      await prisma.notification.create({
        data: {
          userId: version.createdById,
          title: 'All Required Approvals Completed',
          message: `All required departments have approved SOP ${version.sop.sopNumber} (v${version.versionNumber}). Ready for final review & finalization.`,
          type: 'ALL_APPROVED',
          link: `/sops/${version.sopId}?version=${version.versionNumber}`,
        },
      });
    }
  } else {
    await prisma.notification.create({
      data: {
        userId: version.createdById,
        title: `Changes Requested for SOP ${version.sop.sopNumber}`,
        message: `${participant.department.name} requested changes: "${reason?.trim()}"`,
        type: 'CHANGES_REQUESTED',
        link: `/sops/${version.sopId}?version=${version.versionNumber}`,
      },
    });
  }

  await logAudit({
    userId,
    action: decision === ApprovalDecisions.APPROVED ? 'SOP_APPROVED' : 'CHANGES_REQUESTED',
    entity: 'SOPApproval',
    entityId: approval.id,
    newValue: {
      department: participant.department.name,
      decision,
      reason: reason?.trim() || null,
      version: version.versionNumber,
    },
    ipAddress,
  });

  return approval;
}

export async function markReviewCompleted(
  versionId: string,
  departmentId: string,
  userId: string,
  remarks?: string,
  ipAddress?: string
) {
  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { sop: true },
  });

  if (!version) throw new Error('SOP Version not found.');
  if (version.isFinalized) throw new Error('SOP Version is already finalized.');

  const participant = await prisma.sOPParticipant.findUnique({
    where: {
      sopVersionId_departmentId: {
        sopVersionId: versionId,
        departmentId,
      },
    },
    include: { department: true },
  });

  if (!participant) throw new Error('Department not found for this SOP.');

  const updated = await prisma.$transaction(async (tx) => {
    return await tx.sOPParticipant.update({
      where: { id: participant.id },
      data: {
        status: ParticipantStatuses.REVIEWED,
        decisionUserId: userId,
        decisionAt: new Date(),
        remarks: remarks?.trim() || participant.remarks,
      },
    });
  });

  const matrix = await calculateApprovalMatrix(versionId);
  if (matrix.canFinalize && version.status === SOPStatuses.DEPARTMENT_APPROVAL) {
    await prisma.sOPVersion.update({
      where: { id: versionId },
      data: { status: SOPStatuses.FINAL_REVIEW },
    });
    await prisma.sOP.update({
      where: { id: version.sopId },
      data: { status: SOPStatuses.FINAL_REVIEW },
    });
  }

  await logAudit({
    userId,
    action: 'REVIEW_COMPLETED',
    entity: 'SOPParticipant',
    entityId: participant.id,
    metadata: { department: participant.department.name, remarks },
    ipAddress,
  });

  return updated;
}

export async function finalizeSOP(versionId: string, userId: string, ipAddress?: string) {
  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { sop: true },
  });

  if (!version) throw new Error('SOP Version not found.');
  if (version.isFinalized) throw new Error('This SOP Version is already finalized.');

  // Verify approval matrix
  const matrix = await calculateApprovalMatrix(versionId);

  if (matrix.hasBlockingChangesRequested) {
    throw new Error('Cannot finalize SOP: There are unresolved changes requested.');
  }

  if (!matrix.allRequiredApproved) {
    throw new Error(
      `Cannot finalize SOP: Pending approvals remain for required departments: ${matrix.pendingApproverDeptNames.join(', ')}`
    );
  }

  if (!matrix.allRequiredReviewsCompleted) {
    throw new Error(
      `Cannot finalize SOP: Pending reviews remain for required reviewer departments: ${matrix.pendingReviewerDeptNames.join(', ')}`
    );
  }

  const finalizedVersion = await prisma.$transaction(async (tx) => {
    const fVersion = await tx.sOPVersion.update({
      where: { id: versionId },
      data: {
        isFinalized: true,
        finalizedAt: new Date(),
        finalizedById: userId,
        status: SOPStatuses.FINALIZED,
      },
    });

    await tx.sOP.update({
      where: { id: version.sopId },
      data: {
        status: SOPStatuses.FINALIZED,
      },
    });

    return fVersion;
  });

  await logAudit({
    userId,
    action: 'SOP_FINALIZED',
    entity: 'SOPVersion',
    entityId: versionId,
    newValue: {
      sopNumber: version.sop.sopNumber,
      version: version.versionNumber,
      finalizedAt: new Date(),
    },
    ipAddress,
  });

  const concernedParticipants = await prisma.sOPParticipant.findMany({
    where: {
      sopVersionId: versionId,
      participationType: { not: ParticipationTypes.NOT_INVOLVED },
    },
    select: { departmentId: true },
  });

  await notifyConcernedUsers({
    departmentIds: concernedParticipants.map((p) => p.departmentId),
    title: `SOP ${version.sop.sopNumber} Finalized`,
    message: `SOP ${version.sop.sopNumber} (v${version.versionNumber}) - '${version.title}' has been officially finalized and published.`,
    type: 'SOP_FINALIZED',
    link: `/sops/${version.sopId}?version=${version.versionNumber}`,
  });

  return finalizedVersion;
}
