import { Router } from 'express';
import { Permissions } from '../config/rbac';
import {
  handleAdvanceToApproval,
  handleAdvanceToDiscussion,
  handleConfirmAgreement,
  handleFinalizeSOP,
  handleRequestChanges,
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

// Submit for review (supports both /versions/:versionId and /:versionId)
const submitRoutes = [
  '/versions/:versionId/submit',
  '/versions/:versionId/submit-for-review',
  '/:versionId/submit',
  '/:versionId/submit-for-review',
];
submitRoutes.forEach((path) => {
  router.post(path, requirePermission(Permissions.SOP_SUBMIT), asyncHandler(handleSubmitForReview));
});

// Review meeting scheduling
const meetingRoutes = [
  '/versions/:versionId/meeting',
  '/versions/:versionId/meetings',
  '/:versionId/meeting',
  '/:versionId/meetings',
];
meetingRoutes.forEach((path) => {
  router.post(path, requirePermission(Permissions.MEETING_MANAGE), asyncHandler(handleScheduleMeeting));
});

// Confirm agreement (requires authorization for the department)
const agreementRoutes = [
  '/versions/:versionId/agreement',
  '/versions/:versionId/confirm-agreement',
  '/:versionId/agreement',
  '/:versionId/confirm-agreement',
];
agreementRoutes.forEach((path) => {
  router.post(
    path,
    requirePermission(Permissions.AGREEMENT_CONFIRM),
    requireDepartmentAuthorization('body'),
    asyncHandler(handleConfirmAgreement)
  );
});

// Submit approval decision
const approveRoutes = ['/versions/:versionId/approve', '/:versionId/approve'];
approveRoutes.forEach((path) => {
  router.post(
    path,
    requirePermission(Permissions.DEPARTMENT_APPROVE),
    requireDepartmentAuthorization('body'),
    asyncHandler(handleSubmitApproval)
  );
});

// Request changes
const requestChangesRoutes = [
  '/versions/:versionId/request-changes',
  '/:versionId/request-changes',
];
requestChangesRoutes.forEach((path) => {
  router.post(
    path,
    requirePermission(Permissions.DEPARTMENT_APPROVE),
    requireDepartmentAuthorization('body'),
    asyncHandler(handleRequestChanges)
  );
});

// Stage advances
const advanceDiscussionRoutes = [
  '/versions/:versionId/advance-to-discussion',
  '/:versionId/advance-to-discussion',
];
advanceDiscussionRoutes.forEach((path) => {
  router.post(path, requirePermission(Permissions.SOP_SUBMIT), asyncHandler(handleAdvanceToDiscussion));
});

const advanceApprovalRoutes = [
  '/versions/:versionId/advance-to-approval',
  '/:versionId/advance-to-approval',
];
advanceApprovalRoutes.forEach((path) => {
  router.post(path, requirePermission(Permissions.SOP_SUBMIT), asyncHandler(handleAdvanceToApproval));
});

// Mark review completed
const reviewCompleteRoutes = [
  '/versions/:versionId/review-complete',
  '/:versionId/review-complete',
];
reviewCompleteRoutes.forEach((path) => {
  router.post(
    path,
    requirePermission(Permissions.SOP_REVIEW),
    requireDepartmentAuthorization('body'),
    asyncHandler(handleReviewComplete)
  );
});

// Finalize SOP
const finalizeRoutes = ['/versions/:versionId/finalize', '/:versionId/finalize'];
finalizeRoutes.forEach((path) => {
  router.post(path, requirePermission(Permissions.SOP_FINALIZE), asyncHandler(handleFinalizeSOP));
});

export default router;

