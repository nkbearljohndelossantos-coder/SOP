import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { logAudit } from '../services/auditService';

const departmentSchema = z.object({
  code: z.string().min(2).max(10).toUpperCase(),
  name: z.string().min(2),
  description: z.string().optional(),
  headUserId: z.string().optional().nullable(),
});

export async function listDepartments(req: Request, res: Response) {
  const departments = await prisma.department.findMany({
    include: {
      head: {
        select: { id: true, fullName: true, employeeId: true, email: true, username: true },
      },
      representatives: {
        include: {
          user: {
            select: { id: true, fullName: true, employeeId: true, email: true, username: true },
          },
        },
      },
      relationshipsFrom: {
        include: { toDept: { select: { id: true, name: true, code: true } } },
      },
      _count: {
        select: { members: true, sopsOwned: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return res.json({
    success: true,
    departments,
    data: departments,
  });
}

export async function getDepartment(req: Request, res: Response) {
  const dept = await prisma.department.findUnique({
    where: { id: req.params.id },
    include: {
      head: {
        select: { id: true, fullName: true, employeeId: true, email: true, username: true },
      },
      representatives: {
        include: {
          user: {
            select: { id: true, fullName: true, employeeId: true, email: true, username: true },
          },
        },
      },
      members: {
        where: { isActive: true },
        select: { id: true, fullName: true, employeeId: true, email: true, role: true, position: true },
      },
      relationshipsFrom: {
        include: { toDept: true },
      },
    },
  });

  if (!dept) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }

  return res.json({ success: true, data: dept });
}

export async function createDepartment(req: Request, res: Response) {
  const data = departmentSchema.parse(req.body);

  const existing = await prisma.department.findFirst({
    where: {
      OR: [{ code: data.code }, { name: data.name }],
    },
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'A department with this code or name already exists.',
    });
  }

  const dept = await prisma.department.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description || null,
      headUserId: data.headUserId || null,
    },
    include: { head: true },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'DEPARTMENT_CREATED',
    entity: 'Department',
    entityId: dept.id,
    newValue: { code: dept.code, name: dept.name },
    ipAddress: req.ip,
  });

  return res.status(201).json({ success: true, data: dept });
}

export async function updateDepartment(req: Request, res: Response) {
  const headIdParam = req.body.headUserId !== undefined ? req.body.headUserId : req.body.headId;
  const data = departmentSchema.partial().parse({
    ...req.body,
    headUserId: headIdParam === '' ? null : headIdParam,
  });
  const deptId = req.params.id;

  const existing = await prisma.department.findUnique({ where: { id: deptId } });
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }

  // Check code/name conflict with other departments
  if (data.code || data.name) {
    const conflict = await prisma.department.findFirst({
      where: {
        id: { not: deptId },
        OR: [
          ...(data.code ? [{ code: data.code.toUpperCase() }] : []),
          ...(data.name ? [{ name: data.name }] : []),
        ],
      },
    });
    if (conflict) {
      return res.status(400).json({
        success: false,
        message: 'A department with this code or name already exists.',
      });
    }
  }

  // Clear any existing department headed by this user if assigning a head (headUserId is unique)
  if (data.headUserId) {
    await prisma.department.updateMany({
      where: {
        id: { not: deptId },
        headUserId: data.headUserId,
      },
      data: { headUserId: null },
    });
  }

  const updated = await prisma.department.update({
    where: { id: deptId },
    data: {
      code: data.code ? data.code.toUpperCase() : undefined,
      name: data.name || undefined,
      description: data.description !== undefined ? data.description : undefined,
      headUserId: data.headUserId !== undefined ? data.headUserId : undefined,
    },
    include: { head: true },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'DEPARTMENT_UPDATED',
    entity: 'Department',
    entityId: updated.id,
    oldValue: { code: existing.code, name: existing.name, headUserId: existing.headUserId, description: existing.description },
    newValue: { code: updated.code, name: updated.name, headUserId: updated.headUserId, description: updated.description },
    ipAddress: req.ip,
  });

  return res.json({ success: true, data: updated });
}

export async function addRepresentative(req: Request, res: Response) {
  const deptId = req.params.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  const rep = await prisma.departmentRepresentative.upsert({
    where: {
      departmentId_userId: {
        departmentId: deptId,
        userId,
      },
    },
    update: {},
    create: {
      departmentId: deptId,
      userId,
    },
    include: {
      user: { select: { id: true, fullName: true, employeeId: true, email: true } },
    },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'DEPARTMENT_REPRESENTATIVE_ASSIGNED',
    entity: 'DepartmentRepresentative',
    entityId: rep.id,
    newValue: { departmentId: deptId, userId },
    ipAddress: req.ip,
  });

  return res.status(201).json({ success: true, data: rep });
}

export async function removeRepresentative(req: Request, res: Response) {
  const { id: departmentId, userId } = req.params;

  await prisma.departmentRepresentative.deleteMany({
    where: { departmentId, userId },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'DEPARTMENT_REPRESENTATIVE_REMOVED',
    entity: 'DepartmentRepresentative',
    entityId: `${departmentId}:${userId}`,
    ipAddress: req.ip,
  });

  return res.json({ success: true, message: 'Representative removed successfully.' });
}

export async function addRelationship(req: Request, res: Response) {
  const { fromDeptId, toDeptId, relationType } = req.body;

  if (!fromDeptId || !toDeptId) {
    return res.status(400).json({ success: false, message: 'Both department IDs are required' });
  }

  const rel = await prisma.departmentRelationship.upsert({
    where: {
      fromDeptId_toDeptId: { fromDeptId, toDeptId },
    },
    update: { relationType: relationType || 'COLLABORATOR' },
    create: {
      fromDeptId,
      toDeptId,
      relationType: relationType || 'COLLABORATOR',
    },
  });

  return res.status(201).json({ success: true, data: rel });
}

export async function deleteDepartment(req: Request, res: Response) {
  const deptId = req.params.id;

  const dept = await prisma.department.findUnique({
    where: { id: deptId },
    include: {
      _count: {
        select: { sopsOwned: true, members: true },
      },
    },
  });

  if (!dept) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }

  if (dept._count.sopsOwned > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete department "${dept.name}" because it owns ${dept._count.sopsOwned} SOP(s). Reassign or delete those procedures first.`,
    });
  }

  // Clear relations & foreign keys
  await prisma.departmentRelationship.deleteMany({
    where: { OR: [{ fromDeptId: deptId }, { toDeptId: deptId }] },
  });
  await prisma.departmentRepresentative.deleteMany({
    where: { departmentId: deptId },
  });
  await prisma.user.updateMany({
    where: { departmentId: deptId },
    data: { departmentId: null },
  });
  await prisma.department.delete({
    where: { id: deptId },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'DEPARTMENT_DELETED',
    entity: 'Department',
    entityId: deptId,
    oldValue: { code: dept.code, name: dept.name },
    ipAddress: req.ip,
  });

  return res.json({ success: true, message: `Department "${dept.name}" was successfully deleted.` });
}
