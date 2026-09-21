import { Router } from 'express';
import { Permissions } from '../config/rbac';
import {
  archiveSOP,
  getNextSOPNumber,
  getPrintableSOP,
  getSOP,
  handleCreateRevision,
  handleCreateSOP,
  handleUpdateDraft,
  listSOPs,
} from '../controllers/sopController';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.get('/', asyncHandler(listSOPs));
router.get('/next-number/:departmentId', asyncHandler(getNextSOPNumber));
router.get('/:id/print', asyncHandler(getPrintableSOP));
router.get('/:id', asyncHandler(getSOP));
router.post('/', requirePermission(Permissions.SOP_CREATE), asyncHandler(handleCreateSOP));
router.put('/versions/:versionId', requirePermission(Permissions.SOP_EDIT_DRAFT), asyncHandler(handleUpdateDraft));
router.post('/:id/revisions', requirePermission(Permissions.SOP_REVISE), asyncHandler(handleCreateRevision));
router.patch('/:id/archive', requirePermission(Permissions.SOP_ARCHIVE), asyncHandler(archiveSOP));

export default router;
