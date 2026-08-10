import { cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
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
process.env.DATABASE_URL = 'file:./prisma/test.db';

let app: ReturnType<(typeof import('./app.js'))['createApp']>;
let token = '';
let createdEntryId = '';

beforeAll(async () => {
  const templateCandidates = [
    path.resolve(rootDir, 'prisma', 'dev.db'),
    path.resolve(rootDir, 'prisma', 'prisma', 'dev.db'),
  ];
  const templateDbPath = templateCandidates.find((candidate) => existsSync(candidate));
  if (!templateDbPath) {
    throw new Error('Unable to find template SQLite database file for tests');
  }
  const testDbPath = path.resolve(rootDir, 'prisma', 'test.db');

  await rm(testDbPath, { force: true });
  await cp(templateDbPath, testDbPath);

  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "JournalEntry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "tagsJson" TEXT NOT NULL DEFAULT '[]',
      "text" TEXT,
      "audioUrl" TEXT,
      "imageUrl" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "JournalEntry_date_idx" ON "JournalEntry"("date")');
  await prisma.journalEntry.deleteMany();
  await prisma.$disconnect();

  const module = await import('./app.js');
  app = module.createApp();

  const loginResponse = await request(app).post('/journal-api/auth/login').send({
    password: 'password-1234',
  });

  token = loginResponse.body.token as string;
});

describe('journal api', () => {
  it('rejects unauthenticated access', async () => {
    const response = await request(app).get('/journal-api/entries');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('creates an entry', async () => {
    const response = await request(app)
      .post('/journal-api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
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
    const response = await request(app)
      .get('/journal-api/entries?limit=10&offset=0')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('updates an entry', async () => {
    const response = await request(app)
      .patch(`/journal-api/entries/${createdEntryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Updated title',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Updated title');
  });

  it('returns upload error for invalid image type', async () => {
    const response = await request(app)
      .post('/journal-api/uploads/image')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not-an-image'), 'bad.txt');

    expect(response.status).toBe(415);
    expect(response.body.error).toBe('INVALID_IMAGE_TYPE');
  });

  it('deletes an entry', async () => {
    const response = await request(app)
      .delete(`/journal-api/entries/${createdEntryId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(204);
  });
});
