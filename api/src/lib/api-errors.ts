import type { Response } from 'express';

type ApiErrorPayload = {
  error: string;
  message: string;
  details?: unknown;
  hint?: string;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
};

export function sendApiError(
  response: Response,
  status: number,
  payload: ApiErrorPayload,
): void {
  response.status(status).json({
    ok: false,
    code: payload.error,
    ...payload,
  });
}
