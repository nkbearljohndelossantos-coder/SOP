import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { logAudit } from '../services/auditService';
import { notifyConcernedUsers } from '../services/notificationService';

const remarkSchema = z.object({
  departmentId: z.string().min(1),
  comment: z.string().min(2, 'Remark cannot be empty'),
  sectionRef: z.string().optional(),
  parentId: z.string().optional().nullable(),
});

export async function listRemarks(req: Request, res: Response) {
  const { versionId } = req.params;

  const remarks = await prisma.sOPRemark.findMany({
    where: {
      sopVersionId: versionId,
      parentId: null,
    },
    include: {
      user: { select: { id: true, fullName: true, employeeId: true, role: true } },
      department: { select: { id: true, name: true, code: true } },
      replies: {
        include: {
          user: { select: { id: true, fullName: true, employeeId: true, role: true } },
          department: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ success: true, data: remarks });
}

export async function createRemark(req: Request, res: Response) {
  const { versionId } = req.params;
  const data = remarkSchema.parse(req.body);

  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { sop: true },
  });

  if (!version) {
    return res.status(404).json({ success: false, message: 'SOP version not found' });
  }

  const remark = await prisma.sOPRemark.create({
    data: {
      sopVersionId: versionId,
      departmentId: data.departmentId,
      userId: req.user!.id,
      comment: data.comment.trim(),
      sectionRef: data.sectionRef?.trim() || null,
      parentId: data.parentId || null,
      status: 'OPEN',
    },
    include: {
      user: { select: { id: true, fullName: true, employeeId: true, role: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });

  await logAudit({
    userId: req.user?.id,
    action: data.parentId ? 'REMARK_REPLIED' : 'REMARK_ADDED',
    entity: 'SOPRemark',
    entityId: remark.id,
    newValue: { comment: remark.comment, sectionRef: remark.sectionRef },
    ipAddress: req.ip,
  });

  // Notify creator
  if (version.createdById !== req.user!.id) {
    await notifyConcernedUsers({
      userIds: [version.createdById],
      title: 'New Remark Added',
      message: `${req.user!.fullName} added a remark on SOP ${version.sop.sopNumber} v${version.versionNumber}`,
      type: 'REMARK_ADDED',
      link: `/sops/${version.sopId}?tab=remarks`,
    });
  }

  return res.status(201).json({ success: true, data: remark });
}

export async function toggleRemarkStatus(req: Request, res: Response) {
  const { id } = req.params;

  const remark = await prisma.sOPRemark.findUnique({ where: { id } });
  if (!remark) {
    return res.status(404).json({ success: false, message: 'Remark not found' });
  }

  const newStatus = remark.status === 'OPEN' ? 'RESOLVED' : 'OPEN';

  const updated = await prisma.sOPRemark.update({
    where: { id },
    data: { status: newStatus },
  });

  await logAudit({
    userId: req.user?.id,
    action: newStatus === 'RESOLVED' ? 'REMARK_RESOLVED' : 'REMARK_REOPENED',
    entity: 'SOPRemark',
    entityId: remark.id,
    oldValue: { status: remark.status },
    newValue: { status: newStatus },
    ipAddress: req.ip,
  });

  return res.json({ success: true, data: updated });
}
