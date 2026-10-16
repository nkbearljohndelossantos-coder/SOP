import { NextFunction, Request, Response } from 'express';
import { hasPermission, Permission, Permissions } from '../config/rbac';
import { prisma } from '../prisma/client';
import { Roles, RoleType } from '../types';

const DEPT_AUTHORITY_PERMISSIONS: Permission[] = [
  Permissions.AGREEMENT_CONFIRM,
  Permissions.DEPARTMENT_APPROVE,
  Permissions.SOP_REVIEW,
  Permissions.MEETING_MANAGE,
  Permissions.SOP_FINALIZE,
];

export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role === Roles.SUPER_ADMIN) {
      return next();
    }

    if (hasPermission(req.user.role, permission)) {
      return next();
    }

    // Also allow users who are designated as a Department Head or Department Representative in the database
    if (DEPT_AUTHORITY_PERMISSIONS.includes(permission)) {
      const [headedDept, repRecord] = await Promise.all([
        prisma.department.findFirst({ where: { headUserId: req.user.id } }),
        prisma.departmentRepresentative.findFirst({ where: { userId: req.user.id } }),
      ]);
      if (headedDept || repRecord) {
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: `Forbidden: You do not have the required permission (${permission}) for this operation.`,
    });
  };
}

export function requireRole(allowedRoles: RoleType[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role === Roles.SUPER_ADMIN) {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to roles: ${allowedRoles.join(', ')}. Your role is ${req.user.role}.`,
      });
    }

    next();
  };
}

export function requireDepartmentAuthorization(departmentIdLocation: 'params' | 'body') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Super Admin and Admin have overall organization privileges
    if (req.user.role === Roles.SUPER_ADMIN || req.user.role === Roles.ADMIN) {
      return next();
    }

    const deptId = departmentIdLocation === 'params' ? req.params.departmentId : req.body.departmentId;

    if (!deptId) {
      return res.status(400).json({ success: false, message: 'Department ID is required.' });
    }

    // Check if department exists
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    // 1. Designated Department Head on the Department record
    if (dept.headUserId === req.user.id) {
      return next();
    }

    // 2. Registered Authorized Representative for this Department
    const rep = await prisma.departmentRepresentative.findUnique({
      where: {
        departmentId_userId: {
          departmentId: deptId,
          userId: req.user.id,
        },
      },
    });

    if (rep) {
      return next();
    }

    // 3. User belongs to this department AND holds an authorized department sign-off role
    const authorizedDeptRoles: RoleType[] = [
      Roles.DEPARTMENT_HEAD,
      Roles.DEPARTMENT_REPRESENTATIVE,
      Roles.APPROVER,
    ];
    if (req.user.departmentId === deptId && authorizedDeptRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Forbidden: You are not authorized to represent or approve on behalf of department '${dept.name}'. Only the designated Department Head or Authorized Representative can act for this department.`,
    });
  };
}

