import { Router } from 'express';
import {
  deleteAttachment,
  downloadAttachment,
  getAttachmentInfo,
  stageAttachment,
  uploadAttachment,
  uploadMiddleware,
  uploadMultipleAttachments,
  uploadMultipleMiddleware,
} from '../controllers/attachmentController';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

router.post('/stage', uploadMiddleware.single('file'), asyncHandler(stageAttachment));
router.post('/versions/:versionId', uploadMiddleware.single('file'), asyncHandler(uploadAttachment));
router.post('/versions/:versionId/batch', uploadMultipleMiddleware, asyncHandler(uploadMultipleAttachments));
router.get('/:id/download', asyncHandler(downloadAttachment));
router.get('/:id/info', asyncHandler(getAttachmentInfo));
router.delete('/:id', asyncHandler(deleteAttachment));

export default router;
