import { prisma } from '../prisma/client';

interface AuditLogParams {
  userId?: string | null;
  username?: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
}

export async function logAudit(params: AuditLogParams) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        username: params.username || 'SYSTEM',
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        oldValue: params.oldValue ? JSON.stringify(params.oldValue) : null,
        newValue: params.newValue ? JSON.stringify(params.newValue) : null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch (err) {
    console.error('Failed to create audit log:', err);
    // Never let audit log failure crash the primary business transaction, but log error
  }
}
