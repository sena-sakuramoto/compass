/**
 * Google OAuth API エンドポイント
 * Per-user Google接続の管理
 */

import { Router } from 'express';
import { authMiddleware } from '../lib/auth';
import {
  exchangeCodeForTokens,
  getUserGoogleTokens,
  revokeGoogleConnection,
} from '../lib/perUserGoogleClient';

const router = Router();

router.use(authMiddleware());

/**
 * POST /api/google/connect
 * Authorization code をトークンに交換して保存
 */
router.post('/connect', async (req: any, res, next) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const result = await exchangeCodeForTokens(req.uid, code);
    console.log('[google-oauth] Connected Google account:', result.email, 'for user:', req.uid);

    res.json({
      connected: true,
      email: result.email,
    });
  } catch (error: any) {
    console.error('[google-oauth] Failed to connect:', error);
    if (error.message?.includes('No refresh token')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * GET /api/google/status
 * 接続状態を確認
 */
router.get('/status', async (req: any, res, next) => {
  try {
    const tokens = await getUserGoogleTokens(req.uid);
    if (tokens?.refreshToken) {
      res.json({
        connected: true,
        email: tokens.connectedEmail || null,
        connectedAt: tokens.connectedAt || null,
      });
    } else {
      res.json({ connected: false });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/google/disconnect
 * トークン失効・削除
 */
router.post('/disconnect', async (req: any, res, next) => {
  try {
    await revokeGoogleConnection(req.uid);
    console.log('[google-oauth] Disconnected Google account for user:', req.uid);
    res.json({ disconnected: true });
  } catch (error) {
    next(error);
  }
});

export default router;
