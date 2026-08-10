import { Router, type Response } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { sendApiError } from '../lib/api-errors.js';
import { requireAdminAuth } from '../middleware/auth.js';
import {
  AUDIO_MAX_SIZE_BYTES,
  AUDIO_MIME_TYPES,
  IMAGE_MAX_SIZE_BYTES,
  IMAGE_MIME_TYPES,
  audioUpload,
  imageUpload,
} from '../lib/uploads.js';

export const uploadsRouter = Router();

uploadsRouter.use(requireAdminAuth);

function handleUploadError(
  error: unknown,
  response: Response,
  kind: 'image' | 'audio',
) {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    sendApiError(response, 413, {
      error: 'FILE_TOO_LARGE',
      message: `Fichier ${kind} trop volumineux.`,
      details: { maxSizeBytes: kind === 'image' ? IMAGE_MAX_SIZE_BYTES : AUDIO_MAX_SIZE_BYTES },
    });
    return true;
  }

  if (error instanceof Error) {
    if (error.message === 'INVALID_IMAGE_TYPE') {
      sendApiError(response, 415, {
        error: 'INVALID_IMAGE_TYPE',
        message: 'Type image non autorise.',
        details: { allowedMimeTypes: IMAGE_MIME_TYPES },
      });
      return true;
    }

    if (error.message === 'INVALID_AUDIO_TYPE') {
      sendApiError(response, 415, {
        error: 'INVALID_AUDIO_TYPE',
        message: 'Type audio non autorise.',
        details: { allowedMimeTypes: AUDIO_MIME_TYPES },
      });
      return true;
    }
  }

  return false;
}

uploadsRouter.post('/uploads/image', (request, response) => {
  imageUpload.single('file')(request, response, (error) => {
    if (error && handleUploadError(error, response, 'image')) {
      return;
    }

    if (error) {
      sendApiError(response, 500, {
        error: 'UPLOAD_FAILED',
        message: 'Echec upload image.',
      });
      return;
    }

    if (!request.file) {
      sendApiError(response, 400, {
        error: 'FILE_REQUIRED',
        message: 'Fichier image requis.',
      });
      return;
    }

    const host = request.get('host');
    const protocol = request.protocol;
    const mediaUrl = `${protocol}://${host}${env.apiBasePath}/media/images/${request.file.filename}`;

    response.status(201).json({
      data: {
        url: mediaUrl,
        fileName: request.file.filename,
        size: request.file.size,
        mimeType: request.file.mimetype,
      },
    });
  });
});

uploadsRouter.post('/uploads/audio', (request, response) => {
  audioUpload.single('file')(request, response, (error) => {
    if (error && handleUploadError(error, response, 'audio')) {
      return;
    }

    if (error) {
      sendApiError(response, 500, {
        error: 'UPLOAD_FAILED',
        message: 'Echec upload audio.',
      });
      return;
    }

    if (!request.file) {
      sendApiError(response, 400, {
        error: 'FILE_REQUIRED',
        message: 'Fichier audio requis.',
      });
      return;
    }

    const host = request.get('host');
    const protocol = request.protocol;
    const mediaUrl = `${protocol}://${host}${env.apiBasePath}/media/audio/${request.file.filename}`;

    response.status(201).json({
      data: {
        url: mediaUrl,
        fileName: request.file.filename,
        size: request.file.size,
        mimeType: request.file.mimetype,
      },
    });
  });
});
