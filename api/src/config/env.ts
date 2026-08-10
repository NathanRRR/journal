import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4300),
  API_BASE_PATH: z.string().default('/journal-api'),
  ALLOWED_ORIGINS: z
    .string()
    .default('https://journal.rivierenathan.fr,http://localhost:5173,http://127.0.0.1:5173'),
  JOURNAL_ADMIN_PASSWORD: z.string().min(8),
  JOURNAL_AUTH_SECRET: z.string().min(16),
  COOKIE_DOMAIN: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

const allowedOrigins = parsedEnv.data.ALLOWED_ORIGINS.split(',')
  .map((item) => item.trim())
  .filter(Boolean);

export const env = {
  port: parsedEnv.data.API_PORT,
  apiBasePath: parsedEnv.data.API_BASE_PATH,
  allowedOrigins,
  adminPassword: parsedEnv.data.JOURNAL_ADMIN_PASSWORD,
  authSecret: parsedEnv.data.JOURNAL_AUTH_SECRET,
  cookieDomain: parsedEnv.data.COOKIE_DOMAIN?.trim() || undefined,
};
