import { Router } from 'express';
import {
  listNotifications,
  markAllAsRead,
  markAsRead,
} from '../controllers/notificationController';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.get('/', asyncHandler(listNotifications));
router.patch('/:id/read', asyncHandler(markAsRead));
router.post('/read-all', asyncHandler(markAllAsRead));

export default router;
