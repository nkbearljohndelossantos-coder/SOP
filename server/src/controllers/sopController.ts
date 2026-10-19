import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { logAudit } from '../services/auditService';
import {
  DocumentValidationError,
  importAndExtractSOPDocument,
} from '../services/documentImportService';
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
  purpose: z.string().optional().default(''),
  scope: z.string().optional().default(''),
  responsibilities: z.string().optional().default(''),
  procedure: z.string().optional().default(''),
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

function withSplitName<T extends { fullName?: string | null } | null | undefined>(user: T): any {
  if (!user) return user;
  const parts = (user.fullName || '').trim().split(/\s+/);
  return {
    ...user,
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

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
            participants: {
              select: {
                id: true,
                departmentId: true,
                participationType: true,
                status: true,
                agreementConfirmed: true,
                department: {
                  select: { id: true, name: true, code: true },
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const sopsFormatted = sops.map((s) => ({
    ...s,
    createdBy: withSplitName(s.createdBy),
    department: s.ownerDept,
    departmentId: s.ownerDeptId,
    currentVersion: s.versions?.[0] || null,
  }));

  return res.json({
    success: true,
    data: sopsFormatted,
    sops: sopsFormatted,
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
          finalizedAt: true,
          finalizedBy: { select: { id: true, fullName: true } },
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
      signatures: {
        include: {
          signerUser: { select: { id: true, fullName: true, position: true, email: true } },
          revokedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { signedAt: 'asc' },
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

  const enrichedVersion = {
    ...version,
    createdBy: withSplitName(version.createdBy),
    finalizedBy: withSplitName(version.finalizedBy),
    participants: version.participants.map((p) => ({
      ...p,
      decisionUser: withSplitName(p.decisionUser),
    })),
    approvals: version.approvals.map((a) => ({
      ...a,
      approverUser: withSplitName(a.approverUser),
      signatureToken: crypto
        .createHash('sha256')
        .update(`${a.id}:${a.sopVersionId}:${a.departmentId}:${a.approverUserId}:${a.decision}`)
        .digest('hex')
        .slice(0, 32)
        .toUpperCase(),
    })),
    meetings: version.reviewMeetings.map((m) => ({
      ...m,
      meetingMode: 'Inter-Department Review',
      attendees: 'Department Representatives',
      minutesOfMeeting: m.agenda,
      decisions: m.recommendations || m.concerns || 'Recorded in review log.',
      recordedBy: withSplitName(m.createdBy),
    })),
    attachments: version.attachments.map((att) => ({
      ...att,
      uploadedBy: withSplitName(att.uploadedBy),
    })),
  };

  const sopPayload = {
    ...sop,
    createdBy: withSplitName(sop.createdBy),
    versions: sop.versions.map((v) => ({
      ...v,
      createdBy: withSplitName(v.createdBy),
      finalizedBy: withSplitName((v as any).finalizedBy),
    })),
    department: sop.ownerDept,
    departmentId: sop.ownerDeptId,
    currentVersion: enrichedVersion,
    currentVersionNumber: enrichedVersion.versionNumber,
  };

  return res.json({
    success: true,
    sop: sopPayload,
    currentVersion: enrichedVersion,
    matrix,
    data: {
      sop: sopPayload,
      currentVersion: enrichedVersion,
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
  let targetVersionId = req.params.versionId || req.params.id;
  const data = updateDraftSchema.parse(req.body);

  // If the parameter is an SOP ID instead of a Version ID, find the latest draft version for this SOP
  const versionExists = await prisma.sOPVersion.findUnique({ where: { id: targetVersionId } });
  if (!versionExists) {
    const sopExists = await prisma.sOP.findUnique({
      where: { id: targetVersionId },
      include: {
        versions: {
          orderBy: { versionInt: 'desc' },
          take: 1,
        },
      },
    });

    if (sopExists && sopExists.versions[0]) {
      targetVersionId = sopExists.versions[0].id;
    } else {
      return res.status(404).json({ success: false, message: 'SOP or Version not found.' });
    }
  }

  const effectiveDate = data.effectiveDate !== undefined ? (data.effectiveDate ? new Date(data.effectiveDate) : null) : undefined;
  const reviewDate = data.reviewDate !== undefined ? (data.reviewDate ? new Date(data.reviewDate) : null) : undefined;

  const updated = await updateDraft(
    targetVersionId,
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

export async function handleImportSOPDocument(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No document file uploaded. Please attach a valid .docx or .pdf file.',
    });
  }

  try {
    const result = await importAndExtractSOPDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (req.user) {
      await logAudit({
        userId: req.user.id,
        username: req.user.username || req.user.fullName,
        action: 'SOP_DOCUMENT_IMPORTED',
        entity: 'SOP',
        entityId: result.fields.sopNumber || req.file.originalname,
        metadata: {
          fileName: result.fileName,
          fileSize: result.fileSize,
          fileType: result.fileType,
          extractionMethod: result.extractionMethod,
          ocrConfidence: result.ocrConfidence,
          extractedSopNumber: result.fields.sopNumber,
          extractedTitle: result.fields.title,
          matchedDepartmentId: result.fields.departmentId,
          missingRequiredFields: result.missingRequiredFields,
          warningsCount: result.warnings.length,
        },
        ipAddress: req.ip,
      });
    }

    return res.status(200).json({
      success: true,
      message:
        result.extractionMethod === 'OCR'
          ? 'Scanned document processed with OCR. Please verify all extracted fields carefully.'
          : 'Document parsed and mapped to SOP fields successfully.',
      data: result,
    });
  } catch (err: any) {
    if (err instanceof DocumentValidationError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    throw err;
  }
}

