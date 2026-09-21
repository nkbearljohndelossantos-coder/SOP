import { Request, Response } from 'express';
import { prisma } from '../prisma/client';

export async function listAuditLogs(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const entity = req.query.entity as string;
  const action = req.query.action as string;
  const username = req.query.username as string;
  const search = (req.query.search as string)?.trim();

  const where: any = {};

  if (entity) where.entity = entity;
  if (action) where.action = action;
  if (username) where.username = username;

  if (search) {
    where.OR = [
      { action: { contains: search } },
      { entity: { contains: search } },
      { entityId: { contains: search } },
      { username: { contains: search } },
      { newValue: { contains: search } },
    ];
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, employeeId: true, role: true } },
      },
    }),
  ]);

  return res.json({
    success: true,
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
