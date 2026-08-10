# Journal API

API minimale Node/Express TypeScript pour le journal intime.

## Namespace de deploiement

En production, l API est prevue sous:

- `https://api.rivierenathan.fr/journal-api`

La variable `API_BASE_PATH` est donc definie par defaut a `/journal-api`.

## Quick start

1. Installer les dependances

```bash
npm install
```

2. Initialiser l environnement

```bash
cp .env.example .env
```

3. Definir un vrai mot de passe admin dans `.env`

```env
JOURNAL_ADMIN_PASSWORD=change-me-now
```

4. Configurer SQLite dans `.env`

```env
DATABASE_URL=file:./prisma/dev.db
```

5. Appliquer la migration

```bash
npx prisma migrate deploy
```

6. Lancer en dev

```bash
npm run dev
```

7. Injecter des donnees de test (optionnel)

```bash
npm run seed-test
```

## Endpoints minimaux

- `GET /journal-api/health`
- `POST /journal-api/auth/login`
- `GET /journal-api/entries` (auth requis)
- `GET /journal-api/entries/:id` (auth requis)
- `POST /journal-api/entries` (auth requis)
- `PATCH /journal-api/entries/:id` (auth requis)
- `POST /journal-api/uploads/image` (auth requis)
- `POST /journal-api/uploads/audio` (auth requis)

### Upload media (multipart)

- `POST /journal-api/uploads/image`
- `POST /journal-api/uploads/audio`

Format attendu:

- `Content-Type: multipart/form-data`
- champ fichier: `file`

Reponse:

- `data.url` contient l URL HTTP du media uploadee (a stocker dans l entree).

Les fichiers sont conserves sur le serveur dans `api/storage/media`.

Contraintes upload:

- Images: `image/jpeg`, `image/png`, `image/webp`, `image/gif` - max `8 MB`
- Audio: `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/webm`, `audio/ogg`, `audio/x-wav` - max `20 MB`

## Note importante

- Les entrees sont stockees en SQLite via Prisma.
- Les medias uploades sont stockes sur disque dans `api/storage/media`.

## Deploiement Prisma sur VPS

Depuis le dossier `journal/api` sur le serveur:

```bash
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run seed-test
npm run build
npm run start
```

Sequence recommandee en mise a jour:

```bash
git pull --ff-only
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run build
```
