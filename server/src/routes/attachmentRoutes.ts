import { Router } from 'express';
import {
  deleteAttachment,
  downloadAttachment,
  uploadAttachment,
  uploadMiddleware,
} from '../controllers/attachmentController';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.post('/versions/:versionId', uploadMiddleware.single('file'), asyncHandler(uploadAttachment));
router.get('/:id/download', asyncHandler(downloadAttachment));
router.delete('/:id', asyncHandler(deleteAttachment));

export default router;
