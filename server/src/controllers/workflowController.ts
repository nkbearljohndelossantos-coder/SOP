import { Request, Response } from 'express';
import { z } from 'zod';
import { ApprovalDecisions } from '../types';
import {
  advanceToApproval,
  advanceToDiscussion,
  confirmAgreement,
  finalizeSOP,
  markReviewCompleted,
  scheduleReviewMeeting,
  submitApprovalDecision,
  submitForReview,
} from '../services/workflowEngine';

const meetingSchema = z.object({
  meetingDate: z.string(),
  agenda: z.string().optional(),
  concerns: z.string().optional(),
  recommendations: z.string().optional(),
  meetingMode: z.string().optional(),
  minutesOfMeeting: z.string().optional(),
  attendees: z.string().optional(),
  decisions: z.string().optional(),
});

const agreementSchema = z.object({
  departmentId: z.string().min(1),
});

const approvalSchema = z.object({
  departmentId: z.string().min(1),
  decision: z
    .enum([
      ApprovalDecisions.APPROVED,
      ApprovalDecisions.CHANGES_REQUESTED,
      ApprovalDecisions.REJECTED,
    ])
    .optional()
    .default(ApprovalDecisions.APPROVED),
  reason: z.string().optional(),
});

const reviewCompleteSchema = z.object({
  departmentId: z.string().min(1),
  remarks: z.string().optional(),
});

export async function handleSubmitForReview(req: Request, res: Response) {
  const { versionId } = req.params;
  const result = await submitForReview(versionId, req.user!.id, req.ip);
  return res.json({
    success: true,
    message: 'SOP successfully submitted for department review.',
    data: result,
  });
}

export async function handleScheduleMeeting(req: Request, res: Response) {
  const { versionId } = req.params;
  const data = meetingSchema.parse(req.body);

  const meeting = await scheduleReviewMeeting(
    versionId,
    req.user!.id,
    {
      meetingDate: new Date(data.meetingDate),
      agenda: data.agenda || data.minutesOfMeeting || 'Inter-department Review Meeting',
      concerns: data.concerns || data.attendees,
      recommendations: data.recommendations || data.decisions,
    },
    req.ip
  );

  return res.status(201).json({
    success: true,
    message: 'Review meeting scheduled. Concerned departments notified.',
    data: meeting,
  });
}

export async function handleConfirmAgreement(req: Request, res: Response) {
  const { versionId } = req.params;
  const { departmentId } = agreementSchema.parse(req.body);

  const updated = await confirmAgreement(versionId, departmentId, req.user!.id, req.ip);

  return res.json({
    success: true,
    message: 'Department agreement successfully confirmed.',
    data: updated,
  });
}

export async function handleSubmitApproval(req: Request, res: Response) {
  const { versionId } = req.params;
  const data = approvalSchema.parse(req.body);

  const approval = await submitApprovalDecision(
    versionId,
    data.departmentId,
    req.user!.id,
    data.decision,
    data.reason,
    req.ip,
    req.headers['user-agent']
  );

  return res.json({
    success: true,
    message:
      data.decision === ApprovalDecisions.APPROVED
        ? 'Department approval successfully recorded in audit trail.'
        : 'Changes requested. SOP returned to creator with documented reason.',
    data: approval,
  });
}

export async function handleReviewComplete(req: Request, res: Response) {
  const { versionId } = req.params;
  const data = reviewCompleteSchema.parse(req.body);

  const result = await markReviewCompleted(
    versionId,
    data.departmentId,
    req.user!.id,
    data.remarks,
    req.ip
  );

  return res.json({
    success: true,
    message: 'Review checklist marked as completed.',
    data: result,
  });
}

export async function handleFinalizeSOP(req: Request, res: Response) {
  const { versionId } = req.params;

  const finalized = await finalizeSOP(versionId, req.user!.id, req.ip);

  return res.json({
    success: true,
    message: 'SOP successfully finalized and published. The document is now permanently locked and read-only.',
    data: finalized,
  });
}

export async function handleRequestChanges(req: Request, res: Response) {
  const { versionId } = req.params;
  const { departmentId, reason } = req.body;
  if (!departmentId) {
    return res.status(400).json({ success: false, message: 'Department ID is required.' });
  }
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ success: false, message: 'A detailed reason is required when requesting changes.' });
  }

  const approval = await submitApprovalDecision(
    versionId,
    departmentId,
    req.user!.id,
    ApprovalDecisions.CHANGES_REQUESTED,
    reason.trim(),
    req.ip,
    req.headers['user-agent']
  );

  return res.json({
    success: true,
    message: 'Changes requested. SOP returned to creator with documented reason.',
    data: approval,
  });
}

export async function handleAdvanceToDiscussion(req: Request, res: Response) {
  const { versionId } = req.params;
  const result = await advanceToDiscussion(versionId, req.user!.id, req.ip);
  return res.json({
    success: true,
    message: 'Workflow advanced to Discussion stage.',
    data: result,
  });
}

export async function handleAdvanceToApproval(req: Request, res: Response) {
  const { versionId } = req.params;
  const result = await advanceToApproval(versionId, req.user!.id, req.ip);
  return res.json({
    success: true,
    message: 'Workflow advanced to Department Approval stage.',
    data: result,
  });
}
