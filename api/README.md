# Journal API

API minimale Node/Express TypeScript pour le journal intime.

## Namespace de deploiement

En production, l API est prevue sous:

- `https://api.rivierenathan.fr/journal-api`

La variable `API_BASE_PATH` est donc definie par defaut a `/journal-api`.

## Quick start

1. Demarrer une MariaDB locale (depuis la racine du repo, pas dans `api/`)

```bash
cp .env.example .env
docker compose up -d db
```

2. Installer les dependances de l API

```bash
npm install
```

3. Initialiser l environnement de l API

```bash
cp .env.example .env
```

4. Definir un vrai mot de passe admin dans `.env`

```env
JOURNAL_ADMIN_PASSWORD=change-me-now
```

5. Configurer MariaDB dans `.env` (le service `db` de `docker compose` est expose sur `127.0.0.1:3307` par defaut — port choisi pour ne pas entrer en conflit avec une MariaDB native eventuellement deja presente sur `3306`, voir `DB_HOST_PORT` dans le `.env.example` racine)

```env
DATABASE_URL=mysql://journal:change-me@localhost:3307/journal
```

6. Appliquer la migration

```bash
npx prisma migrate deploy
```

7. Lancer en dev

```bash
npm run dev
```

8. Injecter des donnees de test (optionnel)

```bash
npm run seed-test
```

## Tests

`npm run test:api` necessite une MariaDB accessible via `DATABASE_URL` (le service `db` de `docker compose` suffit). Les tests appliquent les migrations et vident la table `JournalEntry` au demarrage — ne pas lancer les tests contre une base contenant de vraies donnees.

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

- Les entrees sont stockees en MariaDB via Prisma.
- Les medias uploades sont stockes sur disque dans `api/storage/media`.

## Deploiement

Le deploiement se fait via Docker (voir `deploy.md` a la racine du repo) : `docker compose build api` construit l image (qui applique `prisma migrate deploy` a chaque demarrage du conteneur), `docker compose up -d api` la lance. Le script `deploy.sh` a la racine enchaine ces etapes ainsi que le build du frontend.
