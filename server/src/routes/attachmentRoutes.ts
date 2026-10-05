import { Router } from 'express';
import {
  deleteAttachment,
  downloadAttachment,
  uploadAttachment,
  uploadMiddleware,
  uploadMultipleAttachments,
  uploadMultipleMiddleware,
} from '../controllers/attachmentController';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.post('/versions/:versionId', uploadMiddleware.single('file'), asyncHandler(uploadAttachment));
router.post('/versions/:versionId/batch', uploadMultipleMiddleware, asyncHandler(uploadMultipleAttachments));
router.get('/:id/download', asyncHandler(downloadAttachment));
router.delete('/:id', asyncHandler(deleteAttachment));

export default router;
