import { Router } from 'express';
import { Permissions } from '../config/rbac';
import {
  getDashboardSummary,
  getPendingApprovalsReport,
  getStatusBreakdownReport,
} from '../controllers/reportController';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.get('/summary', asyncHandler(getDashboardSummary));
router.get('/status-breakdown', requirePermission(Permissions.REPORTS_VIEW), asyncHandler(getStatusBreakdownReport));
router.get('/pending-approvals', requirePermission(Permissions.REPORTS_VIEW), asyncHandler(getPendingApprovalsReport));

export default router;
