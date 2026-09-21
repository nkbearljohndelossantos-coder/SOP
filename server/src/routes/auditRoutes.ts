import { Router } from 'express';
import { Permissions } from '../config/rbac';
import { listAuditLogs } from '../controllers/auditController';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission(Permissions.AUDIT_VIEW), asyncHandler(listAuditLogs));

export default router;
