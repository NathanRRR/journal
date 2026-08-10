import { config as loadDotenv } from 'dotenv';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadDotenv();

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const backupsRoot = path.resolve(rootDir, 'storage', 'backups');
const keepDays = Number.parseInt(process.env.BACKUP_KEEP_DAYS ?? '14', 10);

function getSqlitePathFromEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a SQLite file URL (file:...)');
  }

  const sqliteRelativePath = databaseUrl.slice('file:'.length);
  const primaryPath = path.resolve(rootDir, sqliteRelativePath);
  if (existsSync(primaryPath)) {
    return primaryPath;
  }

  const fallbackPath = path.resolve(rootDir, 'prisma', sqliteRelativePath.replace(/^\.\//, ''));
  if (existsSync(fallbackPath)) {
    return fallbackPath;
  }

  return primaryPath;
}

function nowStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

async function ensureSqliteFileLooksValid(dbPath) {
  const headerBuffer = await readFile(dbPath);
  const header = headerBuffer.subarray(0, 16).toString('utf8');
  if (header !== 'SQLite format 3\u0000') {
    throw new Error(`Database file at ${dbPath} is not a valid SQLite file`);
  }
}

async function rotateOldBackups() {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(backupsRoot, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const backupPath = path.join(backupsRoot, entry.name);
    const details = await stat(backupPath);
    if (details.mtimeMs < cutoff) {
      await rm(backupPath, { recursive: true, force: true });
    }
  }
}

async function main() {
  const dbPath = getSqlitePathFromEnv();
  const mediaDir = path.resolve(rootDir, 'storage', 'media');
  await ensureSqliteFileLooksValid(dbPath);

  const stamp = nowStamp();
  const destination = path.join(backupsRoot, stamp);
  await mkdir(destination, { recursive: true });

  await cp(dbPath, path.join(destination, 'dev.db'));
  await cp(mediaDir, path.join(destination, 'media'), { recursive: true, force: true });

  await writeFile(
    path.join(destination, 'meta.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        keepDays,
        source: {
          databasePath: dbPath,
          mediaPath: mediaDir,
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  await rotateOldBackups();

  console.log(`[backup] OK -> ${destination}`);
}

main().catch((error) => {
  console.error('[backup] failed:', error);
  process.exitCode = 1;
});
