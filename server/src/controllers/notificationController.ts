import { Request, Response } from 'express';
import { prisma } from '../prisma/client';

export async function listNotifications(req: Request, res: Response) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });

  return res.json({
    success: true,
    data: notifications,
    unreadCount,
  });
}

export async function markAsRead(req: Request, res: Response) {
  const { id } = req.params;

  await prisma.notification.updateMany({
    where: { id, userId: req.user!.id },
    data: { isRead: true },
  });

  return res.json({ success: true, message: 'Notification marked as read.' });
}

export async function markAllAsRead(req: Request, res: Response) {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });

  return res.json({ success: true, message: 'All notifications marked as read.' });
}
