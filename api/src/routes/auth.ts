import { Router } from 'express';
import { z } from 'zod';
import { sendApiError } from '../lib/api-errors.js';
import { clearAdminSession, issueAdminSession, requireAdminAuth } from '../middleware/auth.js';
import { clearFailedLoginAttempts, getLoginBlockStatus, registerFailedLoginAttempt } from '../utils/loginThrottle.js';

const loginSchema = z.object({
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/auth/login', (request, response) => {
  const blockStatus = getLoginBlockStatus(request);
  if (blockStatus.blocked) {
    sendApiError(response, 429, {
      error: 'AUTH_LOCKED',
      message: 'Trop de tentatives. Reessayer plus tard.',
      retryAfterSeconds: blockStatus.retryAfterSeconds,
    });
    return;
  }

  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    sendApiError(response, 400, {
      error: 'INVALID_PAYLOAD',
      message: 'Payload login invalide.',
      details: parsed.error.issues,
    });
    return;
  }

  const ok = issueAdminSession(response, parsed.data.password);
  if (!ok) {
    const failedAttemptResult = registerFailedLoginAttempt(request);

    if (failedAttemptResult.blocked) {
      sendApiError(response, 429, {
        error: 'AUTH_LOCKED',
        message: 'Trop de tentatives. Compte bloque 12 heures.',
        retryAfterSeconds: failedAttemptResult.retryAfterSeconds,
      });
      return;
    }

    sendApiError(response, 401, {
      error: 'INVALID_PASSWORD',
      message: 'Mot de passe invalide.',
      remainingAttempts: failedAttemptResult.remainingAttempts,
    });
    return;
  }

  clearFailedLoginAttempts(request);
  response.json({ ok: true, expiresInSeconds: 7 * 24 * 60 * 60 });
});

authRouter.post('/auth/logout', (_request, response) => {
  clearAdminSession(response);
  response.json({ ok: true });
});

authRouter.get('/auth/session', requireAdminAuth, (_request, response) => {
  response.json({ ok: true });
});
