import path from 'node:path';
import { execSync } from 'node:child_process';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');

process.env.API_PORT = '4300';
process.env.API_BASE_PATH = '/journal-api';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.JOURNAL_ADMIN_PASSWORD = 'password-1234';
process.env.JOURNAL_AUTH_SECRET = 'test-secret-value-123456';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'mysql://journal:change-me@localhost:3306/journal_test';

let app: ReturnType<(typeof import('./app.js'))['createApp']>;
let cookieHeader = '';
let createdEntryId = '';

// The session cookie is `secure: true` (correct in prod, where the browser's own
// connection to Nginx is HTTPS). supertest talks to the app over plain HTTP, so its
// cookie jar won't resend a Secure cookie automatically — forward it manually instead.
function authed(req: request.Test): request.Test {
  return req.set('Cookie', cookieHeader);
}

beforeAll(async () => {
  // Requires a running MariaDB reachable at DATABASE_URL (see api/README.md).
  // The target database must already exist; `migrate deploy` only creates the schema.
  execSync('npx prisma migrate deploy', { cwd: rootDir, env: process.env, stdio: 'inherit' });

  const prisma = new PrismaClient();
  await prisma.journalEntry.deleteMany();
  await prisma.$disconnect();

  const module = await import('./app.js');
  app = module.createApp();

  const loginResponse = await request(app).post('/journal-api/auth/login').send({ password: 'password-1234' });
  const setCookie = loginResponse.headers['set-cookie'] as unknown as string[] | undefined;
  cookieHeader = (setCookie ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
});

describe('journal api', () => {
  it('rejects unauthenticated access', async () => {
    const response = await request(app).get('/journal-api/entries');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('creates an entry', async () => {
    const response = await authed(request(app).post('/journal-api/entries')).send({
      title: 'Test entry',
      date: new Date().toISOString(),
      tags: ['test'],
      text: 'hello world',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBeTruthy();
    createdEntryId = response.body.data.id as string;
  });

  it('lists entries', async () => {
    const response = await authed(request(app).get('/journal-api/entries?limit=10&offset=0'));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('updates an entry', async () => {
    const response = await authed(request(app).patch(`/journal-api/entries/${createdEntryId}`)).send({
      title: 'Updated title',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Updated title');
  });

  it('returns upload error for invalid image type', async () => {
    const response = await authed(request(app).post('/journal-api/uploads/image')).attach(
      'file',
      Buffer.from('not-an-image'),
      'bad.txt',
    );

    expect(response.status).toBe(415);
    expect(response.body.error).toBe('INVALID_IMAGE_TYPE');
  });

  it('deletes an entry', async () => {
    const response = await authed(request(app).delete(`/journal-api/entries/${createdEntryId}`));

    expect(response.status).toBe(204);
  });
});
