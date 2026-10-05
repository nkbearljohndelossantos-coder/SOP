import { Router } from 'express';
import { Permissions } from '../config/rbac';
import {
  addRelationship,
  addRepresentative,
  createDepartment,
  deleteDepartment,
  getDepartment,
  listDepartments,
  removeRepresentative,
  updateDepartment,
} from '../controllers/departmentController';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.get('/', asyncHandler(listDepartments));
router.get('/:id', asyncHandler(getDepartment));
router.post('/', requirePermission(Permissions.DEPARTMENTS_MANAGE), asyncHandler(createDepartment));
router.put('/:id', requirePermission(Permissions.DEPARTMENTS_MANAGE), asyncHandler(updateDepartment));
router.patch('/:id', requirePermission(Permissions.DEPARTMENTS_MANAGE), asyncHandler(updateDepartment));
router.patch('/:id/head', requirePermission(Permissions.DEPARTMENTS_MANAGE), asyncHandler(updateDepartment));
router.delete('/:id', requirePermission(Permissions.DEPARTMENTS_MANAGE), asyncHandler(deleteDepartment));
router.post('/:id/representatives', requirePermission(Permissions.DEPARTMENTS_MANAGE), asyncHandler(addRepresentative));
router.delete('/:id/representatives/:userId', requirePermission(Permissions.DEPARTMENTS_MANAGE), asyncHandler(removeRepresentative));
router.post('/relationships', requirePermission(Permissions.DEPARTMENTS_MANAGE), asyncHandler(addRelationship));

export default router;
