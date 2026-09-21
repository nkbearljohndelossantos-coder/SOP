import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../prisma/client';
import { AuthUser, RoleType } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface JwtPayload {
  userId: string;
  role: RoleType;
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // Check HTTP-only cookie first
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No session token provided.',
      });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        employeeId: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        departmentId: true,
        position: true,
        isActive: true,
        isDemoUser: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account is inactive or no longer exists.',
      });
    }

    req.user = {
      id: user.id,
      employeeId: user.employeeId,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role as RoleType,
      departmentId: user.departmentId,
      position: user.position,
      isDemoUser: user.isDemoUser,
    };

    next();
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }
}
