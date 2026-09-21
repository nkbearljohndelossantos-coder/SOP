import { Router } from 'express';
import { Permissions } from '../config/rbac';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  toggleUserStatus,
  updateUser,
} from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

// Directory view is accessible to authenticated staff
router.get('/', asyncHandler(listUsers));
router.get('/:id', asyncHandler(getUser));

// Administrative user mutations
router.post('/', requirePermission(Permissions.USERS_MANAGE), asyncHandler(createUser));
router.put('/:id', requirePermission(Permissions.USERS_MANAGE), asyncHandler(updateUser));
router.patch('/:id', requirePermission(Permissions.USERS_MANAGE), asyncHandler(toggleUserStatus));
router.patch('/:id/status', requirePermission(Permissions.USERS_MANAGE), asyncHandler(toggleUserStatus));
router.delete('/:id', requirePermission(Permissions.USERS_MANAGE), asyncHandler(deleteUser));

export default router;
