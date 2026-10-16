import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { Permissions } from '../config/rbac';
import {
  archiveSOP,
  getNextSOPNumber,
  getPrintableSOP,
  getSOP,
  handleCreateRevision,
  handleCreateSOP,
  handleImportSOPDocument,
  handleUpdateDraft,
  listSOPs,
} from '../controllers/sopController';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max
    files: 1,
  },
});

function handleImportMulterUpload(req: Request, res: Response, next: NextFunction) {
  importUpload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds maximum limit of 25MB.',
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'Invalid file upload request.',
      });
    }
    next();
  });
}

router.use(authenticateToken);

router.get('/', asyncHandler(listSOPs));
router.get('/next-number/:departmentId', asyncHandler(getNextSOPNumber));
router.post(
  '/import-document',
  requirePermission(Permissions.SOP_CREATE),
  handleImportMulterUpload,
  asyncHandler(handleImportSOPDocument)
);
router.get('/:id/print', asyncHandler(getPrintableSOP));
router.get('/:id', asyncHandler(getSOP));
router.post('/', requirePermission(Permissions.SOP_CREATE), asyncHandler(handleCreateSOP));
router.put('/versions/:versionId', requirePermission(Permissions.SOP_EDIT_DRAFT), asyncHandler(handleUpdateDraft));
router.put('/:id', requirePermission(Permissions.SOP_EDIT_DRAFT), asyncHandler(handleUpdateDraft));
router.post('/:id/revisions', requirePermission(Permissions.SOP_REVISE), asyncHandler(handleCreateRevision));
router.patch('/:id/archive', requirePermission(Permissions.SOP_ARCHIVE), asyncHandler(archiveSOP));

export default router;
