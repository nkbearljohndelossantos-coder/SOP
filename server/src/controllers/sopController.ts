import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { logAudit } from '../services/auditService';
import {
  calculateApprovalMatrix,
  createNewRevision,
  createSOP,
  generateNextSOPNumber,
  updateDraft,
} from '../services/sopService';
import { ParticipationTypes, SOPStatuses } from '../types';

const createSOPSchema = z.object({
  sopNumber: z.string().optional(),
  title: z.string().min(5),
  category: z.string().optional().default('Standard Operating Procedure'),
  ownerDeptId: z.string().optional(),
  departmentId: z.string().optional(),
  purpose: z.string().min(10),
  scope: z.string().min(10),
  responsibilities: z.string().min(10),
  procedure: z.string().min(10),
  relatedForms: z.string().optional(),
  references: z.string().optional(),
  effectiveDate: z.string().optional().nullable(),
  reviewDate: z.string().optional().nullable(),
  revisionReason: z.string().optional(),
  changeSummary: z.string().optional(),
  participants: z.array(
    z.object({
      departmentId: z.string(),
      participationType: z.enum([
        ParticipationTypes.REQUIRED_APPROVER,
        ParticipationTypes.REQUIRED_REVIEWER,
        ParticipationTypes.CONSULTED,
        ParticipationTypes.NOT_INVOLVED,
      ]),
    })
  ),
});

const updateDraftSchema = z.object({
  title: z.string().optional(),
  category: z.string().optional(),
  purpose: z.string().optional(),
  scope: z.string().optional(),
  responsibilities: z.string().optional(),
  procedure: z.string().optional(),
  relatedForms: z.string().optional(),
  references: z.string().optional(),
  effectiveDate: z.string().optional().nullable(),
  reviewDate: z.string().optional().nullable(),
  revisionReason: z.string().optional(),
  changeSummary: z.string().optional(),
  lockVersion: z.number(),
  participants: z
    .array(
      z.object({
        departmentId: z.string(),
        participationType: z.enum([
          ParticipationTypes.REQUIRED_APPROVER,
          ParticipationTypes.REQUIRED_REVIEWER,
          ParticipationTypes.CONSULTED,
          ParticipationTypes.NOT_INVOLVED,
        ]),
      })
    )
    .optional(),
});

const revisionSchema = z.object({
  revisionReason: z.string().min(5, 'Revision reason is mandatory'),
  changeSummary: z.string().min(5, 'Change summary is mandatory'),
  purpose: z.string().optional(),
  scope: z.string().optional(),
  responsibilities: z.string().optional(),
  procedure: z.string().optional(),
  relatedForms: z.string().optional(),
  references: z.string().optional(),
  effectiveDate: z.string().optional().nullable(),
  reviewDate: z.string().optional().nullable(),
  participants: z
    .array(
      z.object({
        departmentId: z.string(),
        participationType: z.enum([
          ParticipationTypes.REQUIRED_APPROVER,
          ParticipationTypes.REQUIRED_REVIEWER,
          ParticipationTypes.CONSULTED,
          ParticipationTypes.NOT_INVOLVED,
        ]),
      })
    )
    .optional(),
});

export async function listSOPs(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const search = (req.query.search as string)?.trim();
  const status = req.query.status as string;
  const category = req.query.category as string;
  const ownerDeptId = req.query.ownerDeptId as string;

  const where: any = {};

  if (search) {
    where.OR = [
      { sopNumber: { contains: search } },
      { title: { contains: search } },
      { category: { contains: search } },
    ];
  }

  if (status) where.status = status;
  if (category) where.category = category;
  if (ownerDeptId) where.ownerDeptId = ownerDeptId;

  const [total, sops] = await Promise.all([
    prisma.sOP.count({ where }),
    prisma.sOP.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        ownerDept: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, employeeId: true } },
        versions: {
          orderBy: { versionInt: 'desc' },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            status: true,
            effectiveDate: true,
            reviewDate: true,
            isFinalized: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return res.json({
    success: true,
    data: sops,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function getSOP(req: Request, res: Response) {
  const { id } = req.params;
  const requestedVersion = req.query.version as string;

  const sop = await prisma.sOP.findUnique({
    where: { id },
    include: {
      ownerDept: {
        include: {
          head: { select: { id: true, fullName: true, employeeId: true } },
        },
      },
      createdBy: { select: { id: true, fullName: true, employeeId: true, email: true } },
      versions: {
        orderBy: { versionInt: 'desc' },
        select: {
          id: true,
          versionNumber: true,
          versionInt: true,
          status: true,
          revisionReason: true,
          changeSummary: true,
          isFinalized: true,
          createdAt: true,
          createdBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  if (!sop) {
    return res.status(404).json({ success: false, message: 'SOP not found' });
  }

  // Find target version (or latest)
  const targetVersionNumber = requestedVersion || sop.currentVersionNumber;
  const version = await prisma.sOPVersion.findUnique({
    where: {
      sopId_versionNumber: {
        sopId: sop.id,
        versionNumber: targetVersionNumber,
      },
    },
    include: {
      createdBy: { select: { id: true, fullName: true, employeeId: true } },
      finalizedBy: { select: { id: true, fullName: true, employeeId: true } },
      participants: {
        include: {
          department: {
            include: {
              head: { select: { id: true, fullName: true, employeeId: true } },
              representatives: {
                include: {
                  user: { select: { id: true, fullName: true, employeeId: true } },
                },
              },
            },
          },
          decisionUser: { select: { id: true, fullName: true, employeeId: true } },
        },
        orderBy: { department: { name: 'asc' } },
      },
      reviewMeetings: {
        include: { createdBy: { select: { id: true, fullName: true } } },
        orderBy: { meetingDate: 'desc' },
      },
      remarks: {
        where: { parentId: null }, // Top level remarks
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
      },
      approvals: {
        include: {
          department: { select: { id: true, name: true, code: true } },
          approverUser: { select: { id: true, fullName: true, employeeId: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      attachments: {
        include: { uploadedBy: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!version) {
    return res.status(404).json({
      success: false,
      message: `Version ${targetVersionNumber} not found for this SOP.`,
    });
  }

  const matrix = await calculateApprovalMatrix(version.id);

  return res.json({
    success: true,
    data: {
      sop,
      currentVersion: version,
      matrix,
    },
  });
}

export async function getNextSOPNumber(req: Request, res: Response) {
  const { departmentId } = req.params;
  const sopNumber = await generateNextSOPNumber(departmentId);
  return res.json({
    success: true,
    sopNumber,
    nextNumber: sopNumber,
  });
}

export async function handleCreateSOP(req: Request, res: Response) {
  const data = createSOPSchema.parse(req.body);
  const ownerDeptId = data.ownerDeptId || data.departmentId;
  if (!ownerDeptId) {
    return res.status(400).json({ success: false, message: 'Owning department is required.' });
  }

  const effectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : null;
  const reviewDate = data.reviewDate ? new Date(data.reviewDate) : null;

  const result = await createSOP(
    {
      sopNumber: data.sopNumber || 'AUTO',
      title: data.title,
      category: data.category || 'Standard Operating Procedure',
      ownerDeptId,
      createdById: req.user!.id,
      purpose: data.purpose,
      scope: data.scope,
      responsibilities: data.responsibilities,
      procedure: data.procedure,
      relatedForms: data.relatedForms,
      references: data.references,
      effectiveDate,
      reviewDate,
      revisionReason: data.revisionReason,
      changeSummary: data.changeSummary,
      participants: data.participants,
    },
    req.ip
  );

  return res.status(201).json({
    success: true,
    message: 'SOP created successfully as Draft',
    sop: result.sop,
    version: result.version,
    data: result,
  });
}

export async function handleUpdateDraft(req: Request, res: Response) {
  const { versionId } = req.params;
  const data = updateDraftSchema.parse(req.body);

  const effectiveDate = data.effectiveDate !== undefined ? (data.effectiveDate ? new Date(data.effectiveDate) : null) : undefined;
  const reviewDate = data.reviewDate !== undefined ? (data.reviewDate ? new Date(data.reviewDate) : null) : undefined;

  const updated = await updateDraft(
    versionId,
    req.user!.id,
    {
      ...data,
      effectiveDate,
      reviewDate,
    },
    req.ip
  );

  return res.json({
    success: true,
    message: 'Draft updated successfully',
    data: updated,
  });
}

export async function handleCreateRevision(req: Request, res: Response) {
  const { id } = req.params;
  const data = revisionSchema.parse(req.body);

  const effectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : null;
  const reviewDate = data.reviewDate ? new Date(data.reviewDate) : null;

  const newVersion = await createNewRevision(
    id,
    req.user!.id,
    {
      ...data,
      effectiveDate,
      reviewDate,
    },
    req.ip
  );

  return res.status(201).json({
    success: true,
    message: `New revision v${newVersion.versionNumber} created successfully. Previous version remains locked.`,
    data: newVersion,
  });
}

export async function archiveSOP(req: Request, res: Response) {
  const { id } = req.params;

  const sop = await prisma.sOP.findUnique({ where: { id } });
  if (!sop) {
    return res.status(404).json({ success: false, message: 'SOP not found' });
  }

  const updated = await prisma.sOP.update({
    where: { id },
    data: { status: SOPStatuses.ARCHIVED },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'SOP_ARCHIVED',
    entity: 'SOP',
    entityId: id,
    ipAddress: req.ip,
  });

  return res.json({ success: true, message: 'SOP archived successfully.', data: updated });
}

export async function getPrintableSOP(req: Request, res: Response) {
  const { id } = req.params;
  const versionNumber = req.query.version as string;

  const sop = await prisma.sOP.findUnique({
    where: { id },
    include: {
      ownerDept: true,
      createdBy: { select: { fullName: true, employeeId: true, position: true } },
      versions: {
        orderBy: { versionInt: 'asc' },
        select: {
          versionNumber: true,
          revisionReason: true,
          changeSummary: true,
          createdAt: true,
          createdBy: { select: { fullName: true } },
        },
      },
    },
  });

  if (!sop) {
    return res.status(404).json({ success: false, message: 'SOP not found' });
  }

  const targetVersionNumber = versionNumber || sop.currentVersionNumber;
  const version = await prisma.sOPVersion.findUnique({
    where: {
      sopId_versionNumber: {
        sopId: sop.id,
        versionNumber: targetVersionNumber,
      },
    },
    include: {
      createdBy: { select: { fullName: true, employeeId: true, position: true } },
      finalizedBy: { select: { fullName: true, employeeId: true, position: true } },
      approvals: {
        where: { decision: 'APPROVED' },
        include: {
          department: true,
          approverUser: { select: { fullName: true, employeeId: true, position: true } },
        },
      },
      participants: {
        where: { participationType: 'REQUIRED_REVIEWER' },
        include: {
          department: true,
          decisionUser: { select: { fullName: true, position: true } },
        },
      },
    },
  });

  if (!version) {
    return res.status(404).json({ success: false, message: 'SOP Version not found' });
  }

  return res.json({
    success: true,
    data: {
      organizationName: 'NKB Manufacturing Corp.',
      sopNumber: sop.sopNumber,
      title: version.title,
      category: sop.category,
      department: sop.ownerDept.name,
      version: version.versionNumber,
      status: version.status,
      isFinalized: version.isFinalized,
      effectiveDate: version.effectiveDate,
      reviewDate: version.reviewDate,
      preparedBy: {
        name: version.createdBy.fullName,
        position: version.createdBy.position || 'Documentation Specialist',
        date: version.createdAt,
      },
      reviewedBy: version.participants.map((p) => ({
        department: p.department.name,
        name: p.decisionUser?.fullName || 'Assigned Reviewer',
        status: p.status,
        date: p.decisionAt,
      })),
      approvedBy: version.approvals.map((a) => ({
        department: a.department.name,
        name: a.approverUser.fullName,
        position: a.approverUser.position || 'Department Head',
        date: a.createdAt,
        decision: a.decision,
      })),
      content: {
        purpose: version.purpose,
        scope: version.scope,
        responsibilities: version.responsibilities,
        procedure: version.procedure,
        relatedForms: version.relatedForms,
        references: version.references,
      },
      revisionHistory: sop.versions,
    },
  });
}
