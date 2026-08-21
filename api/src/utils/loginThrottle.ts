import type { Request } from 'express';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type AttemptRecord = {
  windowStartAt: number;
  failedCount: number;
  blockedUntilAt: number;
};

const attemptsByKey = new Map<string, AttemptRecord>();

function getClientKey(req: Request): string {
  // req.ip is safe to trust here: "trust proxy" is set to 1 (see app.ts),
  // so Express resolves it from the X-Forwarded-For entry nginx itself
  // appended, not from whatever a client puts at the front of that header.
  return req.ip ?? 'unknown';
}

function getOrCreateRecord(key: string): AttemptRecord {
  const now = Date.now();
  const existing = attemptsByKey.get(key);

  if (!existing) {
    const created: AttemptRecord = { windowStartAt: now, failedCount: 0, blockedUntilAt: 0 };
    attemptsByKey.set(key, created);
    return created;
  }

  // Reset rolling failure window after 5 minutes when not blocked.
  if (existing.blockedUntilAt <= now && now - existing.windowStartAt > FIVE_MINUTES_MS) {
    existing.windowStartAt = now;
    existing.failedCount = 0;
  }

  return existing;
}

export function getLoginBlockStatus(req: Request): { blocked: boolean; retryAfterSeconds: number } {
  const record = getOrCreateRecord(getClientKey(req));
  const now = Date.now();

  if (record.blockedUntilAt > now) {
    return { blocked: true, retryAfterSeconds: Math.ceil((record.blockedUntilAt - now) / 1000) };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export function registerFailedLoginAttempt(req: Request): {
  blocked: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
} {
  const record = getOrCreateRecord(getClientKey(req));
  const now = Date.now();

  if (record.blockedUntilAt > now) {
    return { blocked: true, retryAfterSeconds: Math.ceil((record.blockedUntilAt - now) / 1000), remainingAttempts: 0 };
  }

  if (now - record.windowStartAt > FIVE_MINUTES_MS) {
    record.windowStartAt = now;
    record.failedCount = 0;
  }

  record.failedCount += 1;

  if (record.failedCount >= MAX_ATTEMPTS) {
    record.blockedUntilAt = now + TWELVE_HOURS_MS;
    return { blocked: true, retryAfterSeconds: Math.ceil(TWELVE_HOURS_MS / 1000), remainingAttempts: 0 };
  }

  return { blocked: false, retryAfterSeconds: 0, remainingAttempts: Math.max(0, MAX_ATTEMPTS - record.failedCount) };
}

export function clearFailedLoginAttempts(req: Request): void {
  attemptsByKey.delete(getClientKey(req));
}
