import type { JournalEntry as PrismaJournalEntry } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { mediaDirectory } from '../lib/uploads.js';
import type { JournalEntry } from '../types/entry.js';

type CreateEntryInput = {
  title: string;
  date: string;
  tags?: string[];
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
};

type UpdateEntryInput = {
  title?: string;
  date?: string;
  tags?: string[];
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
};

type ListEntriesOptions = {
  offset: number;
  limit: number;
  q?: string;
  from?: string;
  to?: string;
};

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function toTagsJson(tags: string[] | undefined): string {
  return JSON.stringify(tags ?? []);
}

function fromTagsJson(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mapEntry(entry: PrismaJournalEntry): JournalEntry {
  return {
    id: entry.id,
    title: entry.title,
    date: entry.date.toISOString(),
    tags: fromTagsJson(entry.tagsJson),
    text: entry.text ?? undefined,
    audioUrl: entry.audioUrl ?? undefined,
    imageUrl: entry.imageUrl ?? undefined,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function getManagedMediaAbsolutePath(mediaUrl: string): string | undefined {
  const maybePathname = (() => {
    try {
      return new URL(mediaUrl).pathname;
    } catch {
      return mediaUrl;
    }
  })();

  const marker = '/media/';
  const markerIndex = maybePathname.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const relative = maybePathname.slice(markerIndex + marker.length).replace(/^\/+/, '');
  if (!relative || relative.includes('..')) {
    return undefined;
  }

  const absolute = path.resolve(mediaDirectory, relative);
  const normalizedMediaRoot = path.resolve(mediaDirectory);
  if (!absolute.startsWith(normalizedMediaRoot)) {
    return undefined;
  }

  return absolute;
}

async function isMediaUrlStillReferenced(mediaUrl: string, excludedEntryId?: string): Promise<boolean> {
  const count = await prisma.journalEntry.count({
    where: {
      id: excludedEntryId ? { not: excludedEntryId } : undefined,
      OR: [{ audioUrl: mediaUrl }, { imageUrl: mediaUrl }],
    },
  });

  return count > 0;
}

async function deleteManagedMediaIfOrphan(mediaUrl: string | undefined, excludedEntryId?: string): Promise<void> {
  if (!mediaUrl) {
    return;
  }

  const stillReferenced = await isMediaUrlStillReferenced(mediaUrl, excludedEntryId);
  if (stillReferenced) {
    return;
  }

  const absolutePath = getManagedMediaAbsolutePath(mediaUrl);
  if (!absolutePath) {
    return;
  }

  try {
    await unlink(absolutePath);
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function listEntries(options: ListEntriesOptions): Promise<{ data: JournalEntry[]; hasMore: boolean }> {
  const offset = Math.max(0, options.offset);
  const limit = Math.max(1, options.limit);
  const q = options.q?.trim().toLowerCase();
  const from = parseIsoDate(options.from);
  const to = parseIsoDate(options.to);

  const dateWhere =
    from || to
      ? {
          gte: from,
          lte: to,
        }
      : undefined;

  if (!q) {
    const rows = await prisma.journalEntry.findMany({
      orderBy: { date: 'desc' },
      where: {
        date: dateWhere,
      },
      skip: offset,
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(mapEntry);
    return { data, hasMore };
  }

  const allRows = await prisma.journalEntry.findMany({
    orderBy: { date: 'desc' },
    where: {
      date: dateWhere,
    },
  });

  const filteredRows = allRows.filter((row) => {
    const titleMatch = row.title.toLowerCase().includes(q);
    const tagMatch = fromTagsJson(row.tagsJson).some((tag) => tag.toLowerCase().includes(q));
    return titleMatch || tagMatch;
  });

  const hasMore = offset + limit < filteredRows.length;
  const data = filteredRows.slice(offset, offset + limit).map(mapEntry);

  return { data, hasMore };
}

export async function getEntryById(id: string): Promise<JournalEntry | undefined> {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  return entry ? mapEntry(entry) : undefined;
}

export async function createEntry(input: CreateEntryInput): Promise<JournalEntry> {
  const created = await prisma.journalEntry.create({
    data: {
      title: input.title,
      date: new Date(input.date),
      tagsJson: toTagsJson(input.tags),
      text: input.text,
      audioUrl: input.audioUrl,
      imageUrl: input.imageUrl,
    },
  });

  return mapEntry(created);
}

export async function updateEntry(id: string, input: UpdateEntryInput): Promise<JournalEntry | undefined> {
  const existing = await prisma.journalEntry.findUnique({ where: { id } });
  if (!existing) {
    return undefined;
  }

  const previousAudioUrl = existing.audioUrl ?? undefined;
  const previousImageUrl = existing.imageUrl ?? undefined;

  const updated = await prisma.journalEntry.update({
    where: { id },
    data: {
      title: input.title,
      date: input.date ? new Date(input.date) : undefined,
      tagsJson: input.tags ? toTagsJson(input.tags) : undefined,
      text: input.text,
      audioUrl: input.audioUrl,
      imageUrl: input.imageUrl,
    },
  });

  if (previousAudioUrl && previousAudioUrl !== updated.audioUrl) {
    await deleteManagedMediaIfOrphan(previousAudioUrl, id);
  }

  if (previousImageUrl && previousImageUrl !== updated.imageUrl) {
    await deleteManagedMediaIfOrphan(previousImageUrl, id);
  }

  return mapEntry(updated);
}

export async function deleteEntry(id: string): Promise<boolean> {
  const existing = await prisma.journalEntry.findUnique({ where: { id } });
  if (!existing) {
    return false;
  }

  const audioUrl = existing.audioUrl ?? undefined;
  const imageUrl = existing.imageUrl ?? undefined;

  await prisma.journalEntry.delete({ where: { id } });

  await deleteManagedMediaIfOrphan(audioUrl, id);
  await deleteManagedMediaIfOrphan(imageUrl, id);

  return true;
}
