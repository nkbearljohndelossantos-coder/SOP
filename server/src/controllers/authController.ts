import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { allowDemoAccounts, env, isProduction } from '../config/env';
import { prisma } from '../prisma/client';
import { logAudit } from '../services/auditService';
import { Roles } from '../types';

const loginSchema = z
  .object({
    username: z.string().optional(),
    email: z.string().optional(),
    employeeId: z.string().optional(),
    identifier: z.string().optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => data.username || data.email || data.employeeId || data.identifier, {
    message: 'Employee ID, username, or email is required',
  });

const setupAdminSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').optional(),
  fullName: z.string().min(2, 'Full name is required').optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  employeeId: z.string().optional(),
});

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.parse(req.body);
  const rawId = (parsed.identifier || parsed.employeeId || parsed.username || parsed.email || '').trim();
  const lowerId = rawId.toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { employeeId: rawId },
        { employeeId: rawId.toUpperCase() },
        { employeeId: lowerId },
        { username: lowerId },
        { email: lowerId },
      ],
    },
    include: { department: true },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Invalid Employee ID, username, or password, or account is disabled.',
    });
  }

  const isValidPassword = await bcrypt.compare(parsed.password, user.passwordHash);
  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid username/email or password.',
    });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  // Update lastLoginAt
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await logAudit({
    userId: user.id,
    username: user.username,
    action: 'USER_LOGIN',
    entity: 'User',
    entityId: user.id,
    ipAddress: req.ip,
  });

  // Set HTTP-only cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });

  const nameParts = (user.fullName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || user.username;
  const lastName = nameParts.slice(1).join(' ') || '';

  const userPayload = {
    id: user.id,
    employeeId: user.employeeId,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    firstName,
    lastName,
    role: user.role,
    position: user.position,
    departmentId: user.departmentId,
    department: user.department ? { id: user.department.id, name: user.department.name, code: user.department.code } : null,
    isDemoUser: user.isDemoUser,
  };

  return res.json({
    success: true,
    message: 'Login successful',
    token,
    user: userPayload,
    data: {
      token,
      user: userPayload,
    },
  });
}

export async function logout(req: Request, res: Response) {
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'USER_LOGOUT',
      entity: 'User',
      entityId: req.user.id,
      ipAddress: req.ip,
    });
  }

  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully' });
}

export async function getMe(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      department: true,
      headedDepartment: true,
      representativeOf: {
        include: { department: true },
      },
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const nameParts = (user.fullName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || user.username;
  const lastName = nameParts.slice(1).join(' ') || '';

  const userPayload = {
    id: user.id,
    employeeId: user.employeeId,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    firstName,
    lastName,
    role: user.role,
    position: user.position,
    departmentId: user.departmentId,
    department: user.department ? { id: user.department.id, name: user.department.name, code: user.department.code } : null,
    headedDepartment: user.headedDepartment ? { id: user.headedDepartment.id, name: user.headedDepartment.name, code: user.headedDepartment.code } : null,
    representativeDepartments: user.representativeOf.map((r) => ({ id: r.department.id, name: r.department.name, code: r.department.code })),
    isDemoUser: user.isDemoUser,
  };

  return res.json({
    success: true,
    user: userPayload,
    data: userPayload,
  });
}

export async function getSetupStatus(req: Request, res: Response) {
  const superAdminCount = await prisma.user.count({
    where: { role: Roles.SUPER_ADMIN, isActive: true },
  });

  const payload = {
    needsInitialAdmin: superAdminCount === 0,
    allowDemoAccounts,
    isProduction,
  };

  return res.json({
    success: true,
    ...payload,
    data: payload,
  });
}

export async function setupFirstAdmin(req: Request, res: Response) {
  const superAdminCount = await prisma.user.count({
    where: { role: Roles.SUPER_ADMIN, isActive: true },
  });

  if (superAdminCount > 0) {
    return res.status(403).json({
      success: false,
      message: 'System already has an active Super Administrator. Setup endpoint is disabled.',
    });
  }

  const data = setupAdminSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);

  const fullName = data.fullName || [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Super Administrator';
  const username = (data.username || data.email.split('@')[0] || 'admin').toLowerCase().trim();
  const employeeId = data.employeeId || 'EMP-001';

  // Find IT department if exists to associate
  const itDept = await prisma.department.findUnique({ where: { code: 'IT' } });

  const admin = await prisma.user.create({
    data: {
      employeeId,
      username,
      fullName,
      email: data.email.toLowerCase().trim(),
      passwordHash,
      role: Roles.SUPER_ADMIN,
      departmentId: itDept?.id || null,
      position: 'Super Administrator',
      isDemoUser: false,
      isActive: true,
    },
  });

  await logAudit({
    userId: admin.id,
    username: admin.username,
    action: 'INITIAL_ADMIN_SETUP',
    entity: 'User',
    entityId: admin.id,
    newValue: { username: admin.username, email: admin.email },
    ipAddress: req.ip,
  });

  return res.status(201).json({
    success: true,
    message: 'First Super Administrator created successfully. You can now log in.',
    data: { id: admin.id, username: admin.username, role: admin.role },
  });
}

export async function getDemoAccounts(req: Request, res: Response) {
  if (isProduction || !allowDemoAccounts) {
    return res.status(403).json({
      success: false,
      message: 'Demo accounts are strictly disabled in production mode.',
    });
  }

  const demoUsers = await prisma.user.findMany({
    where: { isDemoUser: true, isActive: true },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      position: true,
      department: {
        select: { code: true, name: true },
      },
    },
    orderBy: { role: 'asc' },
  });

  return res.json({ success: true, data: demoUsers });
}

export async function demoLogin(req: Request, res: Response) {
  if (isProduction || !allowDemoAccounts) {
    return res.status(403).json({
      success: false,
      message: 'Demo login is strictly disabled in production mode.',
    });
  }

  const rawId = (req.body.identifier || req.body.employeeId || req.body.username || req.body.email || '').trim();
  const lowerId = rawId.toLowerCase();
  if (!rawId) {
    return res.status(400).json({ success: false, message: 'Employee ID, username, or email is required' });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { employeeId: rawId },
        { employeeId: rawId.toUpperCase() },
        { username: lowerId },
        { email: lowerId },
      ],
      isDemoUser: true,
      isActive: true,
    },
    include: { department: true },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: 'Demo user not found or inactive.' });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  res.cookie('token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });

  const nameParts = (user.fullName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || user.username;
  const lastName = nameParts.slice(1).join(' ') || '';

  const userPayload = {
    id: user.id,
    employeeId: user.employeeId,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    firstName,
    lastName,
    role: user.role,
    position: user.position,
    departmentId: user.departmentId,
    department: user.department ? { id: user.department.id, name: user.department.name, code: user.department.code } : null,
    isDemoUser: true,
  };

  return res.json({
    success: true,
    message: `Logged in as demo user: ${user.fullName} (${user.role})`,
    token,
    user: userPayload,
    data: {
      token,
      user: userPayload,
    },
  });
}

const registerWithInviteSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  fullName: z.string().min(2, 'Full name is required').optional(),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function getInviteInfo(req: Request, res: Response) {
  const { token } = req.params;

  const invite = await prisma.registrationInvite.findUnique({
    where: { token },
    include: {
      department: true,
      createdBy: { select: { fullName: true } },
    },
  });

  if (!invite) {
    return res.status(404).json({
      success: false,
      message: 'This registration link is invalid or not found.',
    });
  }

  if (invite.isUsed) {
    return res.status(410).json({
      success: false,
      message: 'This registration link has already been used.',
    });
  }

  if (new Date() > invite.expiresAt) {
    return res.status(410).json({
      success: false,
      message: 'This registration link has expired. Please request a new link from your administrator.',
    });
  }

  return res.json({
    success: true,
    data: {
      token: invite.token,
      role: invite.role,
      departmentId: invite.departmentId,
      department: invite.department ? { id: invite.department.id, name: invite.department.name, code: invite.department.code } : null,
      position: invite.position,
      expiresAt: invite.expiresAt,
      createdByName: invite.createdBy?.fullName,
    },
  });
}

export async function registerWithInvite(req: Request, res: Response) {
  const data = registerWithInviteSchema.parse(req.body);

  const invite = await prisma.registrationInvite.findUnique({
    where: { token: data.token },
    include: { department: true },
  });

  if (!invite) {
    return res.status(404).json({
      success: false,
      message: 'This registration link is invalid or does not exist.',
    });
  }

  if (invite.isUsed) {
    return res.status(410).json({
      success: false,
      message: 'This registration link has already been used.',
    });
  }

  if (new Date() > invite.expiresAt) {
    return res.status(410).json({
      success: false,
      message: 'This registration link has expired.',
    });
  }

  const normalizedUsername = data.username.toLowerCase().trim();
  const normalizedEmail = data.email.toLowerCase().trim();
  const normalizedEmpId = data.employeeId.trim();

  // Check unique constraints
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: normalizedUsername },
        { email: normalizedEmail },
        { employeeId: normalizedEmpId },
      ],
    },
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'A user with this Employee ID, username, or email already exists.',
    });
  }

  const fullName = data.fullName?.trim() || [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
  if (!fullName) {
    return res.status(400).json({ success: false, message: 'Full name is required' });
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  // Transaction: Create user and mark invite as used
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        employeeId: normalizedEmpId,
        username: normalizedUsername,
        fullName,
        email: normalizedEmail,
        passwordHash,
        role: invite.role,
        departmentId: invite.departmentId,
        position: invite.position,
        isActive: true,
        isDemoUser: false,
      },
      include: { department: true },
    });

    await tx.registrationInvite.update({
      where: { id: invite.id },
      data: {
        isUsed: true,
        usedAt: new Date(),
        usedByUserId: newUser.id,
      },
    });

    return newUser;
  });

  await logAudit({
    userId: user.id,
    username: user.username,
    action: 'USER_REGISTERED_VIA_INVITE',
    entity: 'User',
    entityId: user.id,
    newValue: { username: user.username, email: user.email, role: user.role, department: user.department?.name },
    ipAddress: req.ip,
  });

  return res.status(201).json({
    success: true,
    message: 'Account successfully registered. You can now log in.',
    data: {
      id: user.id,
      username: user.username,
      employeeId: user.employeeId,
      fullName: user.fullName,
      role: user.role,
      department: user.department?.name,
    },
  });
}

