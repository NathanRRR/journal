import { config as loadDotenv } from 'dotenv';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parseDatabaseUrl } from './lib/mariadb.mjs';

loadDotenv();

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const backupsRoot = path.resolve(rootDir, 'storage', 'backups');
const restoreSandboxRoot = path.resolve(rootDir, 'storage', 'restore-test');

async function latestBackupDir() {
  const entries = await readdir(backupsRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  if (directories.length === 0) {
    throw new Error('No backup directory found. Run npm run backup:daily first.');
  }

  directories.sort((a, b) => (a < b ? 1 : -1));
  return path.join(backupsRoot, directories[0]);
}

function runMysqlCommand(admin, extraArgs) {
  return new Promise((resolve, reject) => {
    execFile(
      'mysql',
      [`--host=${admin.host}`, `--port=${admin.port}`, '--user=root', `--password=${admin.rootPassword}`, ...extraArgs],
      { maxBuffer: 1024 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

function importDump(admin, database, dumpPath) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'mysql',
      [`--host=${admin.host}`, `--port=${admin.port}`, '--user=root', `--password=${admin.rootPassword}`, database],
      { maxBuffer: 1024 * 1024 * 1024 },
      (error) => (error ? reject(error) : resolve()),
    );
    createReadStream(dumpPath).pipe(child.stdin);
  });
}

async function main() {
  const connection = parseDatabaseUrl(process.env.DATABASE_URL);
  const rootPassword = process.env.MARIADB_ROOT_PASSWORD;
  if (!rootPassword) {
    throw new Error('MARIADB_ROOT_PASSWORD is required to run a restore test');
  }
  const admin = { host: connection.host, port: connection.port, rootPassword };

  const sourceBackup = await latestBackupDir();
  const sandboxDir = path.join(restoreSandboxRoot, path.basename(sourceBackup));
  const scratchDatabase = `${connection.database}_restore_test`;

  await rm(sandboxDir, { recursive: true, force: true });
  await mkdir(sandboxDir, { recursive: true });
  await cp(path.join(sourceBackup, 'db.sql'), path.join(sandboxDir, 'db.sql'));
  await cp(path.join(sourceBackup, 'media'), path.join(sandboxDir, 'media'), { recursive: true, force: true });

  await runMysqlCommand(admin, [
    '--execute',
    `DROP DATABASE IF EXISTS \`${scratchDatabase}\`; CREATE DATABASE \`${scratchDatabase}\`;`,
  ]);

  try {
    await importDump(admin, scratchDatabase, path.join(sandboxDir, 'db.sql'));

    const countOutput = await runMysqlCommand(admin, [
      '--batch',
      '--skip-column-names',
      scratchDatabase,
      '--execute',
      'SELECT COUNT(*) FROM JournalEntry;',
    ]);
    const entryCount = Number.parseInt(countOutput.toString().trim(), 10);
    if (Number.isNaN(entryCount)) {
      throw new Error('Restore verification query did not return a numeric count');
    }

    const mediaStats = await stat(path.join(sandboxDir, 'media'));
    if (!mediaStats.isDirectory()) {
      throw new Error('Restored media is not a directory');
    }

    console.log(`[restore-test] OK from ${sourceBackup} (${entryCount} entries restored, media OK)`);
    console.log(`[restore-test] sandbox path: ${sandboxDir}`);
  } finally {
    await runMysqlCommand(admin, ['--execute', `DROP DATABASE IF EXISTS \`${scratchDatabase}\`;`]);
  }
}

main().catch((error) => {
  console.error('[restore-test] failed:', error);
  process.exitCode = 1;
});
