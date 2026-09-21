import { Router } from 'express';
import { Permissions } from '../config/rbac';
import {
  createRemark,
  listRemarks,
  toggleRemarkStatus,
} from '../controllers/remarkController';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.get('/versions/:versionId', asyncHandler(listRemarks));
router.post('/versions/:versionId', requirePermission(Permissions.REMARKS_ADD), asyncHandler(createRemark));
router.patch('/:id/resolve', requirePermission(Permissions.REMARKS_RESOLVE), asyncHandler(toggleRemarkStatus));

export default router;
