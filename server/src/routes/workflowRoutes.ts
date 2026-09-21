import { Router } from 'express';
import { Permissions } from '../config/rbac';
import {
  handleConfirmAgreement,
  handleFinalizeSOP,
  handleReviewComplete,
  handleScheduleMeeting,
  handleSubmitApproval,
  handleSubmitForReview,
} from '../controllers/workflowController';
import { authenticateToken } from '../middleware/auth';
import { requireDepartmentAuthorization, requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticateToken);

// Submit for review
router.post(
  '/versions/:versionId/submit',
  requirePermission(Permissions.SOP_SUBMIT),
  asyncHandler(handleSubmitForReview)
);

// Review meeting scheduling
router.post(
  '/versions/:versionId/meeting',
  requirePermission(Permissions.MEETING_MANAGE),
  asyncHandler(handleScheduleMeeting)
);

// Confirm agreement (requires authorization for the department!)
router.post(
  '/versions/:versionId/agreement',
  requirePermission(Permissions.AGREEMENT_CONFIRM),
  requireDepartmentAuthorization('body'),
  asyncHandler(handleConfirmAgreement)
);

// Submit approval decision (requires authorization for the department!)
router.post(
  '/versions/:versionId/approve',
  requirePermission(Permissions.DEPARTMENT_APPROVE),
  requireDepartmentAuthorization('body'),
  asyncHandler(handleSubmitApproval)
);

// Mark review completed
router.post(
  '/versions/:versionId/review-complete',
  requirePermission(Permissions.SOP_REVIEW),
  requireDepartmentAuthorization('body'),
  asyncHandler(handleReviewComplete)
);

// Finalize SOP
router.post(
  '/versions/:versionId/finalize',
  requirePermission(Permissions.SOP_FINALIZE),
  asyncHandler(handleFinalizeSOP)
);

export default router;
