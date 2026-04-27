# Local development (monorepo)

Paths in this repo use **`frontend/furnicore`** for the Vite app and **`backend/api-server`** for Express.

## 1. One-time setup

- Copy **`.env.example`** → **`.env`** at the repo root.
- Copy **`frontend/furnicore/.env.example`** → **`frontend/furnicore/.env`**.
- Set **`DATABASE_URL`** in root `.env` to match Postgres (see below).
- **`pnpm install`** from the **repo root** (this repo uses **pnpm**, not npm workspaces).
- Or run **`pnpm run setup:env`** once to create `.env` files from the `*.env.example` templates (skips existing files).

## 2. Database

### Option A — Docker (local)

```bash
pnpm run db:up
```

Default URL (matches `docker-compose.yml`):

`postgresql://furnicore:furnicore_dev@localhost:5432/furnicore`

If **`pnpm run db:up`** fails with **port 5432 already allocated**, another Postgres (or container) is using that port. Set **`POSTGRES_HOST_PORT=5433`** (or any free port) in repo-root **`.env`**, set **`DATABASE_URL`** to use **`localhost:5433`** (same port), then run **`pnpm run db:up`** again. On Windows you can see what owns 5432: `netstat -ano | findstr :5432`.

### Option B — Supabase (hosted Postgres)

In the Supabase dashboard: **Project Settings → Database → Connection string** (URI). Use the **direct** connection (host like `db.<project-ref>.supabase.co`). Put the full URI in root **`.env`** as **`DATABASE_URL`**. If your password contains `@`, `#`, etc., URL-encode it. The **`@workspace/db`** pool enables TLS automatically when the host contains **`supabase.co`**.

Apply the same schema your app expects (e.g. **`pnpm --filter @workspace/db run push`** from the repo root when your `lib/db` package exposes that script).

Also set **`PORT=3000`**, **`SESSION_SECRET`**, etc. in **`.env`**.

## 3. API workspace packages (`lib/db`, `lib/api-zod`, `backend/api-server`)

The repo includes **`backend/api-server`** in **`pnpm-workspace.yaml`** so **`pnpm install`** installs **`esbuild-plugin-pino`** and other devDependencies correctly (run **`pnpm install` from the repo root**, not only inside `backend/api-server`).

**`lib/db`** and **`lib/api-zod`** ship **minimal dev stubs** so the API **builds and starts**. They are **not** a full production schema: replace them with the real packages from upstream FurniCore when you have them, then run your DB migrations / `push` as usual.

**`scripts/`** is **not** in the workspace (it depends on a full `lib/db`). Add it back under `packages:` when you restore the real `lib/db` and need seed/migrate scripts.

## 4. Free stuck ports (optional)

```bash
pnpm run ports:free
```

## 5. Run UI + API

**Terminal A — API**

```bash
pnpm run dev:api
```

**Terminal B — frontend**

```bash
pnpm run dev
```

Or a single terminal (both processes):

```bash
pnpm run dev:stack
```

**Health-only stub** (no DB, no real login): `pnpm run dev:api:stub`

## 6. Ports

| Service    | Default |
|-----------|---------|
| Vite      | `5173` (`PORT` in `frontend/furnicore/.env`) |
| API       | `3000` (`PORT` in root `.env`) |
| Postgres  | `5432` (Docker) |

**`VITE_API_URL`** in `frontend/furnicore/.env` must match the API origin (e.g. `http://localhost:3000`).
