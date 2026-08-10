import { Router } from 'express';
import { z } from 'zod';
import { sendApiError } from '../lib/api-errors.js';
import { clearAdminSession, issueAdminSession, requireAdminAuth } from '../middleware/auth.js';

const loginSchema = z.object({
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/auth/login', (request, response) => {
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
    sendApiError(response, 401, {
      error: 'INVALID_PASSWORD',
      message: 'Mot de passe invalide.',
    });
    return;
  }

  response.json({ ok: true, expiresInSeconds: 7 * 24 * 60 * 60 });
});

authRouter.post('/auth/logout', (_request, response) => {
  clearAdminSession(response);
  response.json({ ok: true });
});

authRouter.get('/auth/session', requireAdminAuth, (_request, response) => {
  response.json({ ok: true });
});
