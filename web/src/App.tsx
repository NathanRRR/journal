import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type JournalEntry = {
  id: string;
  title: string;
  date: string;
  tags: string[];
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type View = 'auth' | 'list' | 'add' | 'detail';

type SuccessNotice = {
  id: number;
  text: string;
};

const PAGE_SIZE = 30;
const IMAGE_MAX_SIZE_BYTES = 8 * 1024 * 1024;
const AUDIO_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-wav'];

function toLocalDateTimeInputValue(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  const pad = (number: number): string => String(number).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function excerpt(value: string, maxLength = 180): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function validateMediaFile(kind: 'audio' | 'image', file: File): string | null {
  const allowed = kind === 'image' ? IMAGE_MIME_TYPES : AUDIO_MIME_TYPES;
  const maxSize = kind === 'image' ? IMAGE_MAX_SIZE_BYTES : AUDIO_MAX_SIZE_BYTES;

  if (!allowed.includes(file.type)) {
    return `Type ${kind} invalide: ${file.type || 'inconnu'}`;
  }

  if (file.size > maxSize) {
    return `Fichier ${kind} trop lourd: max ${Math.round(maxSize / (1024 * 1024))} Mo`;
  }

  return null;
}

export default function App() {
  const apiBaseUrl = useMemo(() => {
    return import.meta.env.VITE_JOURNAL_API_BASE_URL ?? 'http://localhost:4300/journal-api';
  }, []);

  const apiOrigin = useMemo(() => {
    try {
      return new URL(apiBaseUrl).origin;
    } catch {
      return '';
    }
  }, [apiBaseUrl]);

  const [view, setView] = useState<View>('auth');
  const [authChecking, setAuthChecking] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [message, setMessage] = useState('');

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFromInput, setFilterFromInput] = useState('');
  const [filterToInput, setFilterToInput] = useState('');
  const [filterFrom, setFilterFrom] = useState<string | undefined>(undefined);
  const [filterTo, setFilterTo] = useState<string | undefined>(undefined);
  const [successNotice, setSuccessNotice] = useState<SuccessNotice | null>(null);

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [addLoading, setAddLoading] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDate, setAddDate] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [addTags, setAddTags] = useState('');
  const [addText, setAddText] = useState('');
  const [addAudioFile, setAddAudioFile] = useState<File | null>(null);
  const [addImageFile, setAddImageFile] = useState<File | null>(null);
  const [addAudioPreviewUrl, setAddAudioPreviewUrl] = useState<string | null>(null);
  const [addImagePreviewUrl, setAddImagePreviewUrl] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editText, setEditText] = useState('');
  const [editAudioFile, setEditAudioFile] = useState<File | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editAudioPreviewUrl, setEditAudioPreviewUrl] = useState<string | null>(null);
  const [editImagePreviewUrl, setEditImagePreviewUrl] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  function resolveMediaUrl(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    if (!apiOrigin) {
      return value;
    }

    return value.startsWith('/') ? `${apiOrigin}${value}` : `${apiOrigin}/${value}`;
  }

  function showSuccess(text: string) {
    setSuccessNotice({ id: Date.now(), text });
  }

  function toIsoFromDateStart(value: string): string | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString();
  }

  function toIsoFromDateEnd(value: string): string | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(`${value}T23:59:59.999`);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString();
  }

  function formatDateOnly(value: string): string {
    return new Date(value).toLocaleDateString('fr-FR');
  }

  function handleAddAudioSelection(file: File | null) {
    if (!file) {
      setAddAudioFile(null);
      return;
    }

    const error = validateMediaFile('audio', file);
    if (error) {
      setMessage(error);
      setAddAudioFile(null);
      return;
    }

    setAddAudioFile(file);
  }

  function handleAddImageSelection(file: File | null) {
    if (!file) {
      setAddImageFile(null);
      return;
    }

    const error = validateMediaFile('image', file);
    if (error) {
      setMessage(error);
      setAddImageFile(null);
      return;
    }

    setAddImageFile(file);
  }

  function handleEditAudioSelection(file: File | null) {
    if (!file) {
      setEditAudioFile(null);
      return;
    }

    const error = validateMediaFile('audio', file);
    if (error) {
      setMessage(error);
      setEditAudioFile(null);
      return;
    }

    setEditAudioFile(file);
  }

  function handleEditImageSelection(file: File | null) {
    if (!file) {
      setEditImageFile(null);
      return;
    }

    const error = validateMediaFile('image', file);
    if (error) {
      setMessage(error);
      setEditImageFile(null);
      return;
    }

    setEditImageFile(file);
  }

  async function apiRequest(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers ?? {});

    if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { response, payload };
  }

  function logoutLocalState() {
    setIsAuthenticated(false);
    setEntries([]);
    setSelectedEntryId(null);
    setSelectedEntry(null);
    setView('auth');
    setMessage('Session terminee.');
  }

  async function uploadMediaFile(kind: 'audio' | 'image', file: File): Promise<string> {
    const validationError = validateMediaFile(kind, file);
    if (validationError) {
      throw new Error(validationError);
    }

    const formData = new FormData();
    formData.append('file', file);

    const { response, payload } = await apiRequest(`/uploads/${kind}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok || !payload.data || typeof (payload.data as { url?: unknown }).url !== 'string') {
      const apiError = typeof payload.message === 'string'
        ? payload.message
        : typeof payload.error === 'string'
          ? payload.error
          : `UPLOAD_${kind.toUpperCase()}_FAILED`;
      throw new Error(apiError);
    }

    return (payload.data as { url: string }).url;
  }

  async function loadEntries(
    options: { reset: boolean; query: string; from?: string; to?: string },
  ) {
    const offset = options.reset ? 0 : entries.length;

    setIsLoadingEntries(true);

    try {
      const queryParams = new URLSearchParams();
      queryParams.set('offset', String(offset));
      queryParams.set('limit', String(PAGE_SIZE));
      if (options.query.trim()) {
        queryParams.set('q', options.query.trim());
      }
      if (options.from) {
        queryParams.set('from', options.from);
      }
      if (options.to) {
        queryParams.set('to', options.to);
      }

      const { response, payload } = await apiRequest(`/entries?${queryParams.toString()}`);
      if (!response.ok) {
        if (response.status === 401) {
          logoutLocalState();
          return;
        }

        setMessage('Erreur lors du chargement des entrees.');
        return;
      }

      const data = Array.isArray(payload.data) ? (payload.data as JournalEntry[]) : [];
      const nextHasMore = Boolean(payload.hasMore);

      setEntries((prev) => (options.reset ? data : [...prev, ...data]));
      setHasMore(nextHasMore);
      setMessage((prev) => {
        if (prev === 'Erreur lors du chargement des entrees.' || prev === 'Erreur reseau pendant le chargement des entrees.') {
          return '';
        }

        return prev;
      });
    } catch {
      setMessage('Erreur reseau pendant le chargement des entrees.');
    } finally {
      setIsLoadingEntries(false);
    }
  }

  async function openDetail(id: string) {
    setSelectedEntryId(id);
    setView('detail');
    setDetailLoading(true);
    setEditMode(false);

    try {
      const { response, payload } = await apiRequest(`/entries/${id}`);
      if (!response.ok || !payload.data) {
        if (response.status === 401) {
          logoutLocalState();
          return;
        }

        setMessage('Entree introuvable.');
        setView('list');
        return;
      }

      const entry = payload.data as JournalEntry;
      setSelectedEntry(entry);
      setEditTitle(entry.title);
      setEditDate(toLocalDateTimeInputValue(entry.date));
      setEditTags(entry.tags.join(', '));
      setEditText(entry.text ?? '');
      setEditAudioFile(null);
      setEditImageFile(null);
    } catch {
      setMessage('Erreur reseau pendant le chargement du detail.');
      setView('list');
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    setAuthChecking(true);

    apiRequest('/auth/session', { method: 'GET' })
      .then(async ({ response }) => {
        if (!response.ok) {
          setIsAuthenticated(false);
          setView('auth');
          return;
        }

        setIsAuthenticated(true);
        setView('list');
        await loadEntries({ reset: true, query: '', from: undefined, to: undefined });
      })
      .catch(() => {
        setIsAuthenticated(false);
        setView('auth');
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    if (view !== 'list' || !isAuthenticated || !hasMore || isLoadingEntries) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entriesList) => {
      const [entry] = entriesList;
      if (!entry.isIntersecting) {
        return;
      }

      void loadEntries({ reset: false, query: searchTerm, from: filterFrom, to: filterTo });
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [view, isAuthenticated, hasMore, isLoadingEntries, searchTerm, filterFrom, filterTo, entries.length]);

  useEffect(() => {
    if (!addAudioFile) {
      setAddAudioPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(addAudioFile);
    setAddAudioPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [addAudioFile]);

  useEffect(() => {
    if (!addImageFile) {
      setAddImagePreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(addImageFile);
    setAddImagePreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [addImageFile]);

  useEffect(() => {
    if (!editAudioFile) {
      setEditAudioPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(editAudioFile);
    setEditAudioPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [editAudioFile]);

  useEffect(() => {
    if (!editImageFile) {
      setEditImagePreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(editImageFile);
    setEditImagePreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [editImageFile]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSuccessNotice((current) => (current?.id === successNotice.id ? null : current));
    }, 2600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [successNotice]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password.trim()) {
      setMessage('Entre le mot de passe.');
      return;
    }

    setAuthLoading(true);
    setMessage('Connexion en cours...');

    try {
      const { response, payload } = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setMessage('Mot de passe invalide.');
        return;
      }

      setIsAuthenticated(true);
      setPassword('');
      setView('list');
      setSearchTerm('');
      setSearchInput('');
      await loadEntries({ reset: true, query: '', from: undefined, to: undefined });
      setMessage('Connexion validee. Session active 7 jours glissants.');
    } catch {
      setMessage('Impossible de joindre l API.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogoutClick() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Keep local logout behavior even if API logout fails.
    }

    setPassword('');
    logoutLocalState();
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTerm = searchInput.trim();
    const nextFrom = toIsoFromDateStart(filterFromInput);
    const nextTo = toIsoFromDateEnd(filterToInput);

    if (filterFromInput && !nextFrom) {
      setMessage('Date debut invalide.');
      return;
    }

    if (filterToInput && !nextTo) {
      setMessage('Date fin invalide.');
      return;
    }

    if (nextFrom && nextTo && nextFrom > nextTo) {
      setMessage('La date debut doit etre anterieure a la date fin.');
      return;
    }

    setFilterFrom(nextFrom);
    setFilterTo(nextTo);
    setSearchTerm(nextTerm);
    await loadEntries({ reset: true, query: nextTerm, from: nextFrom, to: nextTo });
  }

  async function handleAddEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!addTitle.trim()) {
      setMessage('Le titre est obligatoire.');
      return;
    }

    if (!addText.trim() && !addAudioFile && !addImageFile) {
      setMessage('Ajoute un texte, un audio, ou une image.');
      return;
    }

    setAddLoading(true);

    try {
      const tags = addTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const uploadedAudioUrl = addAudioFile ? await uploadMediaFile('audio', addAudioFile) : undefined;
      const uploadedImageUrl = addImageFile ? await uploadMediaFile('image', addImageFile) : undefined;

      const { response, payload } = await apiRequest('/entries', {
        method: 'POST',
        body: JSON.stringify({
          title: addTitle.trim(),
          date: new Date(addDate).toISOString(),
          tags,
          text: addText.trim() || undefined,
          audioUrl: uploadedAudioUrl,
          imageUrl: uploadedImageUrl,
        }),
      });

      if (!response.ok || !payload.data) {
        const errorCode = typeof payload.error === 'string' ? payload.error : '';
        const errorMessage = typeof payload.message === 'string' ? payload.message : '';

        if (errorCode === 'DATABASE_UNAVAILABLE') {
          setMessage('Creation impossible: base SQLite indisponible en local.');
          return;
        }

        if (errorCode === 'DATABASE_SCHEMA_MISSING') {
          setMessage('Creation impossible: migration Prisma non appliquee.');
          return;
        }

        if (errorMessage) {
          setMessage(errorMessage);
          return;
        }

        setMessage('Creation impossible. Verifie les champs.');
        return;
      }

      setAddTitle('');
      setAddDate(toLocalDateTimeInputValue(new Date()));
      setAddTags('');
      setAddText('');
      setAddAudioFile(null);
      setAddImageFile(null);
      setView('list');
      await loadEntries({ reset: true, query: searchTerm, from: filterFrom, to: filterTo });
      showSuccess('Entree creee avec succes.');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur reseau pendant la creation.');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedEntryId) {
      return;
    }

    setEditLoading(true);

    try {
      const tags = editTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const uploadedAudioUrl = editAudioFile ? await uploadMediaFile('audio', editAudioFile) : selectedEntry?.audioUrl;
      const uploadedImageUrl = editImageFile ? await uploadMediaFile('image', editImageFile) : selectedEntry?.imageUrl;

      const { response, payload } = await apiRequest(`/entries/${selectedEntryId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle.trim(),
          date: new Date(editDate).toISOString(),
          tags,
          text: editText.trim() || undefined,
          audioUrl: uploadedAudioUrl,
          imageUrl: uploadedImageUrl,
        }),
      });

      if (!response.ok || !payload.data) {
        const errorMessage = typeof payload.message === 'string' ? payload.message : '';
        setMessage(errorMessage || 'Modification impossible.');
        return;
      }

      const updated = payload.data as JournalEntry;
      setSelectedEntry(updated);
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setEditMode(false);
      setEditAudioFile(null);
      setEditImageFile(null);
      showSuccess('Modifications enregistrees.');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur reseau pendant la modification.');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteEntry() {
    if (!selectedEntryId) {
      return;
    }

    const confirmed = window.confirm('Supprimer cette entree ? Cette action est irreversible.');
    if (!confirmed) {
      return;
    }

    setDeleteLoading(true);

    try {
      const { response } = await apiRequest(`/entries/${selectedEntryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        setMessage('Suppression impossible.');
        return;
      }

      setEntries((prev) => prev.filter((entry) => entry.id !== selectedEntryId));
      setSelectedEntryId(null);
      setSelectedEntry(null);
      setEditMode(false);
      setView('list');
      await loadEntries({ reset: true, query: searchTerm, from: filterFrom, to: filterTo });
      showSuccess('Entree supprimee.');
      setMessage('');
    } catch {
      setMessage('Erreur reseau pendant la suppression.');
    } finally {
      setDeleteLoading(false);
    }
  }

  if (authChecking) {
    return (
      <main className="app-shell min-h-screen text-paper">
        <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm uppercase tracking-[0.2em] text-paper/70">Verification session</p>
          <h1 className="mt-4 font-serif text-3xl text-white sm:text-4xl">Journal intime</h1>
          <p className="mt-4 text-paper/80">Chargement...</p>
        </div>
      </main>
    );
  }

  if (view === 'auth') {
    return (
      <main className="app-shell min-h-screen text-paper">
        <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm uppercase tracking-[0.2em] text-paper/70">journal.rivierenathan.fr</p>
          <h1 className="mt-4 font-serif text-3xl text-white sm:text-4xl">Authentification</h1>
          <p className="mt-3 text-paper/80">Entree reservee admin. Session 7 jours glissants.</p>

          <form className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6" onSubmit={handleLogin}>
            <label htmlFor="password" className="block text-sm text-paper/80">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white"
              placeholder="Saisir le mot de passe"
            />
            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-xl bg-accent px-5 py-3 font-medium text-white disabled:opacity-70 sm:w-auto"
            >
              {authLoading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          {message ? <p className="mt-4 text-sm text-paper/80">{message}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell min-h-screen text-paper">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-paper/60">journal.rivierenathan.fr</p>
            <h1 className="mt-2 font-serif text-3xl text-white sm:text-4xl">Journal intime</h1>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button
              onClick={() => {
                setView('list');
                setSelectedEntryId(null);
                setSelectedEntry(null);
              }}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm"
            >
              Liste
            </button>
            <button onClick={() => setView('add')} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white">
              Ajouter entree
            </button>
            <button onClick={handleLogoutClick} className="rounded-xl border border-white/20 px-4 py-2 text-sm">
              Deconnexion
            </button>
          </div>
        </header>

        {view === 'list' ? (
          <section className="space-y-5">
            <form className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" onSubmit={handleSearch}>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Rechercher par titre ou tag"
                className="w-full flex-1 rounded-xl border border-white/20 bg-black/20 px-4 py-3"
              />
              <input
                type="date"
                value={filterFromInput}
                onChange={(event) => setFilterFromInput(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 sm:w-auto"
                aria-label="Date de debut"
              />
              <input
                type="date"
                value={filterToInput}
                onChange={(event) => setFilterToInput(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 sm:w-auto"
                aria-label="Date de fin"
              />
              <button type="submit" className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white sm:w-auto">
                Rechercher
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchTerm('');
                  setFilterFromInput('');
                  setFilterToInput('');
                  setFilterFrom(undefined);
                  setFilterTo(undefined);
                  void loadEntries({ reset: true, query: '', from: undefined, to: undefined });
                }}
                className="w-full rounded-xl border border-white/20 px-4 py-3 text-sm sm:w-auto"
              >
                Reinitialiser
              </button>
            </form>

            <div className="space-y-3">
              {entries.map((entry) => {
                const imageSrc = resolveMediaUrl(entry.imageUrl);
                const audioSrc = resolveMediaUrl(entry.audioUrl);

                return (
                  <article key={entry.id} className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left sm:p-4">
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div>
                        <h3 className="font-semibold text-white">{entry.title}</h3>
                        <span className="text-xs text-paper/70">{formatDateOnly(entry.date)}</span>
                      </div>
                      <button
                        onClick={() => void openDetail(entry.id)}
                        className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-paper hover:bg-white/10"
                      >
                        Ouvrir
                      </button>
                    </div>

                    {entry.tags.length > 0 ? <p className="mt-2 text-xs text-paper/60">{entry.tags.join(', ')}</p> : null}
                    {entry.text ? <p className="mt-2 text-sm text-paper/85">{excerpt(entry.text)}</p> : null}

                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={`Illustration de l entree ${entry.title}`}
                        className="mt-3 h-40 w-full rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : null}

                    {audioSrc ? <audio className="mt-3 w-full" controls preload="none" src={audioSrc} /> : null}
                  </article>
                );
              })}
              {entries.length === 0 && !isLoadingEntries ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-paper/70">Aucune entree.</p>
              ) : null}
              <div ref={sentinelRef} className="h-6" />
              {isLoadingEntries ? <p className="text-sm text-paper/70">Chargement...</p> : null}
              {!hasMore && entries.length > 0 ? <p className="text-sm text-paper/60">Fin de liste.</p> : null}
            </div>
          </section>
        ) : null}

        {view === 'add' ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-white">Nouvelle entree</h2>
            <form className="mt-5 space-y-3" onSubmit={handleAddEntry}>
              <input
                value={addTitle}
                onChange={(event) => setAddTitle(event.target.value)}
                placeholder="Titre"
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
              />
              <input
                type="datetime-local"
                value={addDate}
                onChange={(event) => setAddDate(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
              />
              <input
                value={addTags}
                onChange={(event) => setAddTags(event.target.value)}
                placeholder="Tags separes par virgule"
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
              />
              <textarea
                value={addText}
                onChange={(event) => setAddText(event.target.value)}
                placeholder="Texte"
                rows={6}
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
              />
              <input
                type="file"
                accept="audio/*"
                onChange={(event) => handleAddAudioSelection(event.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
              />
              {addAudioFile ? <p className="text-xs text-paper/70">Audio selectionne: {addAudioFile.name}</p> : null}
              {addAudioPreviewUrl ? <audio className="w-full" controls preload="metadata" src={addAudioPreviewUrl} /> : null}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => handleAddImageSelection(event.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
              />
              {addImageFile ? <p className="text-xs text-paper/70">Image selectionnee: {addImageFile.name}</p> : null}
              {addImagePreviewUrl ? (
                <img
                  src={addImagePreviewUrl}
                  alt="Apercu image a ajouter"
                  className="h-auto max-h-72 w-full rounded-xl object-contain"
                />
              ) : null}
              <button type="submit" disabled={addLoading} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white sm:w-auto">
                {addLoading ? 'Creation...' : 'Creer'}
              </button>
            </form>
          </section>
        ) : null}

        {view === 'detail' ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
            {detailLoading ? <p>Chargement detail...</p> : null}

            {!detailLoading && selectedEntry ? (
              <>
                {!editMode ? (
                  <div className="space-y-3">
                    <h2 className="text-2xl font-semibold text-white">{selectedEntry.title}</h2>
                    <p className="text-sm text-paper/70">{new Date(selectedEntry.date).toLocaleString('fr-FR')}</p>
                    {selectedEntry.tags.length > 0 ? <p className="text-sm text-paper/70">{selectedEntry.tags.join(', ')}</p> : null}
                    {selectedEntry.text ? <p className="whitespace-pre-wrap text-paper/90">{selectedEntry.text}</p> : null}
                    {selectedEntry.imageUrl ? (
                      <img
                        src={resolveMediaUrl(selectedEntry.imageUrl)}
                        alt={`Image de l entree ${selectedEntry.title}`}
                        className="h-auto max-h-[420px] w-full rounded-xl object-contain"
                        loading="lazy"
                      />
                    ) : null}
                    {selectedEntry.audioUrl ? (
                      <audio className="w-full" controls preload="metadata" src={resolveMediaUrl(selectedEntry.audioUrl)} />
                    ) : null}
                    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                      <button onClick={() => setEditMode(true)} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white">
                        Modifier
                      </button>
                      <button
                        onClick={() => void handleDeleteEntry()}
                        disabled={deleteLoading}
                        className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 disabled:opacity-70"
                      >
                        {deleteLoading ? 'Suppression...' : 'Supprimer'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form className="space-y-3" onSubmit={handleSaveEdit}>
                    <input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
                    />
                    <input
                      type="datetime-local"
                      value={editDate}
                      onChange={(event) => setEditDate(event.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
                    />
                    <input
                      value={editTags}
                      onChange={(event) => setEditTags(event.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
                    />
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={6}
                      className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
                    />
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(event) => handleEditAudioSelection(event.target.files?.[0] ?? null)}
                      className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
                    />
                    {editAudioFile ? <p className="text-xs text-paper/70">Nouvel audio: {editAudioFile.name}</p> : null}
                    {editAudioPreviewUrl ? <audio className="w-full" controls preload="metadata" src={editAudioPreviewUrl} /> : null}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleEditImageSelection(event.target.files?.[0] ?? null)}
                      className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3"
                    />
                    {editImageFile ? <p className="text-xs text-paper/70">Nouvelle image: {editImageFile.name}</p> : null}
                    {editImagePreviewUrl ? (
                      <img
                        src={editImagePreviewUrl}
                        alt="Apercu nouvelle image"
                        className="h-auto max-h-72 w-full rounded-xl object-contain"
                      />
                    ) : null}
                    <div className="grid grid-cols-1 gap-2 sm:flex">
                      <button
                        type="submit"
                        disabled={editLoading}
                        className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white"
                      >
                        {editLoading ? 'Sauvegarde...' : 'Sauvegarder'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMode(false)}
                        className="rounded-xl border border-white/20 px-4 py-2 text-sm"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : null}
          </section>
        ) : null}

        {successNotice ? (
          <p className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{successNotice.text}</p>
        ) : null}
        {message ? <p className="mt-6 text-sm text-paper/80">{message}</p> : null}
      </div>
    </main>
  );
}
