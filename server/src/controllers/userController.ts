import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { logAudit } from '../services/auditService';
import { Roles } from '../types';

const createUserSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum([
    Roles.SUPER_ADMIN,
    Roles.ADMIN,
    Roles.SOP_CREATOR,
    Roles.DEPARTMENT_HEAD,
    Roles.DEPARTMENT_REPRESENTATIVE,
    Roles.REVIEWER,
    Roles.APPROVER,
    Roles.READ_ONLY,
  ]),
  departmentId: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z
    .enum([
      Roles.SUPER_ADMIN,
      Roles.ADMIN,
      Roles.SOP_CREATOR,
      Roles.DEPARTMENT_HEAD,
      Roles.DEPARTMENT_REPRESENTATIVE,
      Roles.REVIEWER,
      Roles.APPROVER,
      Roles.READ_ONLY,
    ])
    .optional(),
  departmentId: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  password: z.string().min(8).optional(),
});

export async function listUsers(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const search = (req.query.search as string)?.trim();
  const role = req.query.role as string;
  const departmentId = req.query.departmentId as string;
  const status = req.query.status as string;

  const where: any = {};

  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { username: { contains: search } },
      { employeeId: { contains: search } },
      { email: { contains: search } },
    ];
  }

  if (role) where.role = role;
  if (departmentId) where.departmentId = departmentId;
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        employeeId: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        position: true,
        isActive: true,
        isDemoUser: true,
        lastLoginAt: true,
        createdAt: true,
        department: {
          select: { id: true, name: true, code: true },
        },
        headedDepartment: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const mappedUsers = users.map((u) => {
    const nameParts = (u.fullName || '').trim().split(/\s+/);
    return {
      ...u,
      firstName: nameParts[0] || u.username,
      lastName: nameParts.slice(1).join(' ') || '',
    };
  });

  return res.json({
    success: true,
    users: mappedUsers,
    data: mappedUsers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function getUser(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      department: true,
      headedDepartment: true,
      representativeOf: { include: { department: true } },
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const { passwordHash, ...safeUser } = user;
  return res.json({ success: true, data: safeUser });
}

export async function createUser(req: Request, res: Response) {
  const data = createUserSchema.parse(req.body);

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: data.username.toLowerCase().trim() },
        { email: data.email.toLowerCase().trim() },
        { employeeId: data.employeeId.trim() },
      ],
    },
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'A user with this username, email, or employee ID already exists.',
    });
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      employeeId: data.employeeId.trim(),
      username: data.username.toLowerCase().trim(),
      fullName: data.fullName.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash,
      role: data.role,
      departmentId: data.departmentId || null,
      position: data.position || null,
      isActive: true,
      isDemoUser: false,
    },
    include: { department: true },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'USER_CREATED',
    entity: 'User',
    entityId: user.id,
    newValue: { username: user.username, role: user.role, department: user.department?.name },
    ipAddress: req.ip,
  });

  const { passwordHash: _, ...safeUser } = user;
  return res.status(201).json({ success: true, data: safeUser });
}

export async function updateUser(req: Request, res: Response) {
  const data = updateUserSchema.parse(req.body);
  const targetId = req.params.id;

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const updatePayload: any = {
    fullName: data.fullName?.trim(),
    email: data.email?.toLowerCase().trim(),
    role: data.role,
    departmentId: data.departmentId,
    position: data.position,
  };

  if (data.password) {
    updatePayload.passwordHash = await bcrypt.hash(data.password, 10);
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: updatePayload,
    include: { department: true },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'USER_UPDATED',
    entity: 'User',
    entityId: updated.id,
    oldValue: { role: existing.role, departmentId: existing.departmentId },
    newValue: { role: updated.role, departmentId: updated.departmentId },
    ipAddress: req.ip,
  });

  const { passwordHash: _, ...safeUser } = updated;
  return res.json({ success: true, data: safeUser });
}

export async function toggleUserStatus(req: Request, res: Response) {
  const targetId = req.params.id;

  if (targetId === req.user?.id) {
    return res.status(400).json({
      success: false,
      message: 'You cannot deactivate your own account.',
    });
  }

  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { isActive: !user.isActive },
  });

  await logAudit({
    userId: req.user?.id,
    action: updated.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entity: 'User',
    entityId: updated.id,
    oldValue: { isActive: user.isActive },
    newValue: { isActive: updated.isActive },
    ipAddress: req.ip,
  });

  return res.json({
    success: true,
    message: `User ${updated.fullName} has been ${updated.isActive ? 'activated' : 'deactivated'}.`,
    data: { id: updated.id, isActive: updated.isActive },
  });
}

export async function deleteUser(req: Request, res: Response) {
  const targetId = req.params.id;

  if (targetId === req.user?.id) {
    return res.status(400).json({
      success: false,
      message: 'You cannot delete your own active account.',
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      headedDepartment: true,
      _count: {
        select: {
          sopsCreated: true,
          versionsCreated: true,
          approvals: true,
        },
      },
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (user._count.sopsCreated > 0 || user._count.versionsCreated > 0 || user._count.approvals > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete ${user.fullName} because they have authored official SOPs or approved documents. Please deactivate their account instead to maintain ISO 9001 compliance audit integrity.`,
    });
  }

  // Clear department head reference if applicable
  if (user.headedDepartment) {
    await prisma.department.update({
      where: { id: user.headedDepartment.id },
      data: { headUserId: null },
    });
  }

  // Clean up non-critical foreign keys
  await prisma.departmentRepresentative.deleteMany({ where: { userId: targetId } });
  await prisma.notification.deleteMany({ where: { userId: targetId } });
  await prisma.sOPRemark.deleteMany({ where: { userId: targetId } });
  await prisma.auditLog.updateMany({ where: { userId: targetId }, data: { userId: null } });

  // Delete user record
  await prisma.user.delete({ where: { id: targetId } });

  await logAudit({
    userId: req.user?.id,
    action: 'USER_DELETED',
    entity: 'User',
    entityId: targetId,
    oldValue: { username: user.username, email: user.email, fullName: user.fullName },
    ipAddress: req.ip,
  });

  return res.json({
    success: true,
    message: `User ${user.fullName} (${user.username}) was successfully deleted.`,
  });
}

const createInviteSchema = z.object({
  role: z.enum([
    Roles.SUPER_ADMIN,
    Roles.ADMIN,
    Roles.SOP_CREATOR,
    Roles.DEPARTMENT_HEAD,
    Roles.DEPARTMENT_REPRESENTATIVE,
    Roles.REVIEWER,
    Roles.APPROVER,
    Roles.READ_ONLY,
  ]),
  departmentId: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  expiresInDays: z.number().int().min(1).max(90).default(7),
});

export async function createRegistrationInvite(req: Request, res: Response) {
  const data = createInviteSchema.parse(req.body);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresInDays = data.expiresInDays || 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const invite = await prisma.registrationInvite.create({
    data: {
      token,
      role: data.role,
      departmentId: data.departmentId || null,
      position: data.position || null,
      expiresAt,
      createdById: req.user!.id,
    },
    include: {
      department: true,
      createdBy: { select: { fullName: true, username: true } },
    },
  });

  await logAudit({
    userId: req.user?.id,
    action: 'INVITE_LINK_CREATED',
    entity: 'RegistrationInvite',
    entityId: invite.id,
    newValue: { role: invite.role, department: invite.department?.name, expiresAt: invite.expiresAt },
    ipAddress: req.ip,
  });

  return res.status(201).json({
    success: true,
    message: 'Registration link generated successfully.',
    data: {
      ...invite,
      inviteUrl: `/register?token=${invite.token}`,
    },
  });
}

export async function listRegistrationInvites(req: Request, res: Response) {
  const invites = await prisma.registrationInvite.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      department: true,
      createdBy: { select: { fullName: true, username: true } },
      usedBy: { select: { fullName: true, username: true, email: true, employeeId: true } },
    },
  });

  return res.json({
    success: true,
    data: invites.map((inv) => ({
      ...inv,
      inviteUrl: `/register?token=${inv.token}`,
      isExpired: new Date() > inv.expiresAt,
    })),
  });
}

export async function deleteRegistrationInvite(req: Request, res: Response) {
  const inviteId = req.params.id;
  const invite = await prisma.registrationInvite.findUnique({ where: { id: inviteId } });
  if (!invite) {
    return res.status(404).json({ success: false, message: 'Invitation link not found.' });
  }

  await prisma.registrationInvite.delete({ where: { id: inviteId } });

  await logAudit({
    userId: req.user?.id,
    action: 'INVITE_LINK_REVOKED',
    entity: 'RegistrationInvite',
    entityId: inviteId,
    oldValue: { role: invite.role, token: invite.token },
    ipAddress: req.ip,
  });

  return res.json({ success: true, message: 'Invitation link revoked successfully.' });
}


