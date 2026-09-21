import { Router } from 'express';
import {
  demoLogin,
  getDemoAccounts,
  getInviteInfo,
  getMe,
  getSetupStatus,
  login,
  logout,
  registerWithInvite,
  setupFirstAdmin,
} from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/login', asyncHandler(login));
router.post('/logout', asyncHandler(logout));
router.get('/me', authenticateToken, asyncHandler(getMe));
router.get('/setup-status', asyncHandler(getSetupStatus));
router.get('/config', asyncHandler(getSetupStatus));
router.post('/setup-admin', asyncHandler(setupFirstAdmin));

// Self-Registration via Invite Link (Public)
router.get('/invite/:token', asyncHandler(getInviteInfo));
router.post('/register-with-invite', asyncHandler(registerWithInvite));

// Demo Routes (Hard protected inside controller against production)
router.get('/demo-accounts', asyncHandler(getDemoAccounts));
router.post('/demo-login', asyncHandler(demoLogin));
router.post('/demo-switch', asyncHandler(demoLogin));

export default router;
