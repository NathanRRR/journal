import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import { env } from './config/env.js';
import { sendApiError } from './lib/api-errors.js';
import { mediaDirectory } from './lib/uploads.js';
import { authRouter } from './routes/auth.js';
import { entriesRouter } from './routes/entries.js';
import { healthRouter } from './routes/health.js';
import { uploadsRouter } from './routes/uploads.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', true);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('CORS_BLOCKED'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use(`${env.apiBasePath}/media`, express.static(mediaDirectory));

  app.use(env.apiBasePath, healthRouter);
  app.use(env.apiBasePath, authRouter);
  app.use(env.apiBasePath, entriesRouter);
  app.use(env.apiBasePath, uploadsRouter);

  app.use((_request, response) => {
    sendApiError(response, 404, {
      error: 'NOT_FOUND',
      message: 'Endpoint introuvable.',
    });
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const bodyParserError = error as { type?: string; status?: number; statusCode?: number } | undefined;
    if (bodyParserError?.type === 'entity.parse.failed' || bodyParserError?.status === 400 || bodyParserError?.statusCode === 400) {
      sendApiError(response, 400, {
        error: 'INVALID_JSON',
        message: 'Corps JSON invalide.',
      });
      return;
    }

    if ((error as { message?: string } | undefined)?.message === 'CORS_BLOCKED') {
      sendApiError(response, 403, {
        error: 'CORS_BLOCKED',
        message: 'Origine non autorisee.',
        hint: 'Verifier ALLOWED_ORIGINS.',
      });
      return;
    }

    // eslint-disable-next-line no-console
    console.error('[journal-api] unhandled error', error);

    sendApiError(response, 500, {
      error: 'INTERNAL_ERROR',
      message: 'Erreur interne non geree.',
    });
  });

  return app;
}
