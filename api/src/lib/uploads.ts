import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const storageRoot = path.resolve(process.cwd(), 'storage');
const mediaRoot = path.join(storageRoot, 'media');
const imageRoot = path.join(mediaRoot, 'images');
const audioRoot = path.join(mediaRoot, 'audio');

for (const directory of [storageRoot, mediaRoot, imageRoot, audioRoot]) {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

export const IMAGE_MAX_SIZE_BYTES = 8 * 1024 * 1024;
export const AUDIO_MAX_SIZE_BYTES = 20 * 1024 * 1024;

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-wav'] as const;

const imageMimeTypes = new Set<string>(IMAGE_MIME_TYPES);
const audioMimeTypes = new Set<string>(AUDIO_MIME_TYPES);

function sanitizeName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function createStorage(targetDirectory: string) {
  return multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, targetDirectory);
    },
    filename: (_request, file, callback) => {
      const timestamp = Date.now();
      callback(null, `${timestamp}-${sanitizeName(file.originalname)}`);
    },
  });
}

export const imageUpload = multer({
  storage: createStorage(imageRoot),
  limits: { fileSize: IMAGE_MAX_SIZE_BYTES },
  fileFilter: (_request, file, callback) => {
    if (!imageMimeTypes.has(file.mimetype)) {
      callback(new Error('INVALID_IMAGE_TYPE'));
      return;
    }

    callback(null, true);
  },
});

export const audioUpload = multer({
  storage: createStorage(audioRoot),
  limits: { fileSize: AUDIO_MAX_SIZE_BYTES },
  fileFilter: (_request, file, callback) => {
    if (!audioMimeTypes.has(file.mimetype)) {
      callback(new Error('INVALID_AUDIO_TYPE'));
      return;
    }

    callback(null, true);
  },
});

export const mediaDirectory = mediaRoot;
