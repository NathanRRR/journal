import { config as loadDotenv } from 'dotenv';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parseDatabaseUrl } from './lib/mariadb.mjs';

loadDotenv();

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const backupsRoot = path.resolve(rootDir, 'storage', 'backups');
const keepDays = Number.parseInt(process.env.BACKUP_KEEP_DAYS ?? '14', 10);

function nowStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
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

function dumpDatabase(connection, destination) {
  return new Promise((resolve, reject) => {
    const dump = execFile(
      'mysqldump',
      [
        `--host=${connection.host}`,
        `--port=${connection.port}`,
        `--user=${connection.user}`,
        `--password=${connection.password}`,
        '--single-transaction',
        '--routines',
        connection.database,
      ],
      { maxBuffer: 1024 * 1024 * 1024 },
    );

    const output = createWriteStream(destination);
    dump.stdout.pipe(output);
    dump.stderr.on('data', (chunk) => process.stderr.write(chunk));
    dump.on('error', reject);
    dump.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`mysqldump exited with code ${code}`))));
  });
}

async function main() {
  const connection = parseDatabaseUrl(process.env.DATABASE_URL);
  const mediaDir = path.resolve(rootDir, 'storage', 'media');

  const stamp = nowStamp();
  const destination = path.join(backupsRoot, stamp);
  await mkdir(destination, { recursive: true });

  await dumpDatabase(connection, path.join(destination, 'db.sql'));
  await cp(mediaDir, path.join(destination, 'media'), { recursive: true, force: true });

  await writeFile(
    path.join(destination, 'meta.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        keepDays,
        source: {
          database: connection.database,
          host: connection.host,
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
