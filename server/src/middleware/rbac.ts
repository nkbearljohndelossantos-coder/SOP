import { NextFunction, Request, Response } from 'express';
import { hasPermission, Permission } from '../config/rbac';
import { prisma } from '../prisma/client';
import { Roles, RoleType } from '../types';

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role === Roles.SUPER_ADMIN) {
      return next();
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: You do not have the required permission (${permission}) for this operation.`,
      });
    }

    next();
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

    // Check if user is Department Head
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    if (dept.headUserId === req.user.id) {
      return next();
    }

    // Check if user is registered Authorized Representative
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

    return res.status(403).json({
      success: false,
      message: `Forbidden: You are not authorized to represent or approve on behalf of department '${dept.name}'. Only the designated Department Head or Authorized Representative can act for this department.`,
    });
  };
}
