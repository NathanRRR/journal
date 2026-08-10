import { config as loadDotenv } from 'dotenv';
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadDotenv();

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const backupsRoot = path.resolve(rootDir, 'storage', 'backups');
const restoreSandboxRoot = path.resolve(rootDir, 'storage', 'restore-test');

function sqlitePath() {
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

async function latestBackupDir() {
  const entries = await readdir(backupsRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  if (directories.length === 0) {
    throw new Error('No backup directory found. Run npm run backup:daily first.');
  }

  directories.sort((a, b) => (a < b ? 1 : -1));
  return path.join(backupsRoot, directories[0]);
}

async function validateSqliteHeader(dbPath) {
  const content = await readFile(dbPath);
  const header = content.subarray(0, 16).toString('utf8');
  if (header !== 'SQLite format 3\u0000') {
    throw new Error(`Invalid SQLite backup header for ${dbPath}`);
  }
}

async function main() {
  const sourceBackup = await latestBackupDir();
  const sandboxDir = path.join(restoreSandboxRoot, path.basename(sourceBackup));

  await rm(sandboxDir, { recursive: true, force: true });
  await mkdir(sandboxDir, { recursive: true });

  await cp(path.join(sourceBackup, 'dev.db'), path.join(sandboxDir, 'dev.db'));
  await cp(path.join(sourceBackup, 'media'), path.join(sandboxDir, 'media'), { recursive: true, force: true });

  await validateSqliteHeader(path.join(sandboxDir, 'dev.db'));

  const mediaStats = await stat(path.join(sandboxDir, 'media'));
  if (!mediaStats.isDirectory()) {
    throw new Error('Restored media is not a directory');
  }

  const liveDb = sqlitePath();
  console.log(`[restore-test] OK from ${sourceBackup}`);
  console.log(`[restore-test] live database path: ${liveDb}`);
  console.log(`[restore-test] sandbox path: ${sandboxDir}`);
}

main().catch((error) => {
  console.error('[restore-test] failed:', error);
  process.exitCode = 1;
});
