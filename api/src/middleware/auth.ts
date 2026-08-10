import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { sendApiError } from '../lib/api-errors.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = 'journal_admin_session';

const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_MS,
  path: '/',
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
};

type TokenPayload = {
  exp: number;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signSegment(segment: string): string {
  return createHmac('sha256', env.authSecret).update(segment).digest('base64url');
}

function issueSessionToken(): string {
  const payload: TokenPayload = {
    exp: Date.now() + SESSION_TTL_MS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signSegment(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function writeSessionCookie(response: Response): string {
  const token = issueSessionToken();
  response.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  return token;
}

function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signSegment(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as TokenPayload;
    if (typeof payload.exp !== 'number') {
      return null;
    }

    if (payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function issueAdminSession(response: Response, password: string): boolean {
  if (password !== env.adminPassword) {
    return false;
  }

  writeSessionCookie(response);
  return true;
}

export function clearAdminSession(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
}

export function requireAdminAuth(request: Request, response: Response, next: NextFunction): void {
  const authHeader = request.header('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cookieToken = (request as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME] ?? '';
  const token = cookieToken || bearerToken;
  const payload = token ? verifySessionToken(token) : null;

  if (!payload) {
    sendApiError(response, 401, {
      error: 'UNAUTHORIZED',
      message: 'Session invalide ou expiree.',
      hint: 'Reconnecter l administrateur.',
    });
    return;
  }

  writeSessionCookie(response);

  next();
}
