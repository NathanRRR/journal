import { Router, type Response } from 'express';
import { z } from 'zod';
import { sendApiError } from '../lib/api-errors.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { createEntry, deleteEntry, getEntryById, listEntries, updateEntry } from '../store/memory-store.js';

function handleRepositoryError(error: unknown, response: Response) {
  const code = (error as { code?: string } | undefined)?.code;
  const message = (error as { message?: string } | undefined)?.message ?? '';

  if (code === 'P1001' || message.includes('P1001') || message.includes("Can't reach database server")) {
    sendApiError(response, 503, {
      error: 'DATABASE_UNAVAILABLE',
      message: 'Base de donnees indisponible.',
      hint: 'Verifier la connexion MariaDB et les identifiants.',
    });
    return;
  }

  if (code === 'P2021' || message.includes('P2021')) {
    sendApiError(response, 500, {
      error: 'DATABASE_SCHEMA_MISSING',
      message: 'Schema base manquant ou non migre.',
      hint: 'Executer npm run prisma:migrate',
    });
    return;
  }

  sendApiError(response, 500, {
    error: 'INTERNAL_ERROR',
    message: 'Erreur interne lors de l acces aux entrees.',
  });
}

const listEntriesQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(60).default(30),
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const createEntrySchema = z
  .object({
    title: z.string().min(1),
    date: z.string().min(1),
    tags: z.array(z.string()).optional(),
    text: z.string().optional(),
    audioUrl: z.string().url().optional(),
    imageUrl: z.string().url().optional(),
  })
  .refine((payload) => Boolean(payload.text || payload.audioUrl || payload.imageUrl), {
    message: 'At least one content field is required',
  });

const updateEntrySchema = z
  .object({
    title: z.string().min(1).optional(),
    date: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    text: z.string().optional(),
    audioUrl: z.string().url().optional(),
    imageUrl: z.string().url().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required',
  });

export const entriesRouter = Router();

entriesRouter.use(requireAdminAuth);

entriesRouter.get('/entries', async (request, response) => {
  try {
    const parsedQuery = listEntriesQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      sendApiError(response, 400, {
        error: 'INVALID_QUERY',
        message: 'Parametres de requete invalides.',
        details: parsedQuery.error.issues,
      });
      return;
    }

    const result = await listEntries(parsedQuery.data);
    response.json(result);
  } catch (error) {
    handleRepositoryError(error, response);
  }
});

entriesRouter.get('/entries/:id', async (request, response) => {
  try {
    const entry = await getEntryById(request.params.id);

    if (!entry) {
      sendApiError(response, 404, {
        error: 'ENTRY_NOT_FOUND',
        message: 'Entree introuvable.',
      });
      return;
    }

    response.json({ data: entry });
  } catch (error) {
    handleRepositoryError(error, response);
  }
});

entriesRouter.post('/entries', async (request, response) => {
  try {
    const parsed = createEntrySchema.safeParse(request.body);

    if (!parsed.success) {
      sendApiError(response, 400, {
        error: 'INVALID_PAYLOAD',
        message: 'Payload creation invalide.',
        details: parsed.error.issues,
      });
      return;
    }

    const entry = await createEntry(parsed.data);
    response.status(201).json({ data: entry });
  } catch (error) {
    handleRepositoryError(error, response);
  }
});

entriesRouter.patch('/entries/:id', async (request, response) => {
  try {
    const parsed = updateEntrySchema.safeParse(request.body);

    if (!parsed.success) {
      sendApiError(response, 400, {
        error: 'INVALID_PAYLOAD',
        message: 'Payload modification invalide.',
        details: parsed.error.issues,
      });
      return;
    }

    const updated = await updateEntry(request.params.id, parsed.data);

    if (!updated) {
      sendApiError(response, 404, {
        error: 'ENTRY_NOT_FOUND',
        message: 'Entree introuvable.',
      });
      return;
    }

    response.json({ data: updated });
  } catch (error) {
    handleRepositoryError(error, response);
  }
});

entriesRouter.delete('/entries/:id', async (request, response) => {
  try {
    const deleted = await deleteEntry(request.params.id);

    if (!deleted) {
      sendApiError(response, 404, {
        error: 'ENTRY_NOT_FOUND',
        message: 'Entree introuvable.',
      });
      return;
    }

    response.status(204).send();
  } catch (error) {
    handleRepositoryError(error, response);
  }
});
