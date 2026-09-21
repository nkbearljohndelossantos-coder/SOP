import { prisma } from '../prisma/client';

interface NotificationParams {
  userId: string;
  title: string;
  message: string;
  type: string;
  link?: string;
}

export async function createNotification(params: NotificationParams) {
  try {
    return await prisma.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        message: params.message,
        type: params.type,
        link: params.link,
      },
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export async function notifyConcernedUsers(params: {
  departmentIds?: string[];
  userIds?: string[];
  title: string;
  message: string;
  type: string;
  link?: string;
}) {
  const targetUserIds = new Set<string>(params.userIds || []);

  if (params.departmentIds && params.departmentIds.length > 0) {
    const deptMembers = await prisma.user.findMany({
      where: {
        departmentId: { in: params.departmentIds },
        isActive: true,
      },
      select: { id: true },
    });
    deptMembers.forEach((u) => targetUserIds.add(u.id));

    // Also notify department heads
    const depts = await prisma.department.findMany({
      where: { id: { in: params.departmentIds } },
      select: { headUserId: true },
    });
    depts.forEach((d) => {
      if (d.headUserId) targetUserIds.add(d.headUserId);
    });
  }

  for (const userId of targetUserIds) {
    await createNotification({
      userId,
      title: params.title,
      message: params.message,
      type: params.type,
      link: params.link,
    });
  }
}
