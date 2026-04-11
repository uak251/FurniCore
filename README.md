# FurniCore

Monorepo layout (ERP app + API):

| Area | Path |
|------|------|
| FurniCore web (Vite + React) | `frontend/furnicore` |
| REST API (Express) | `backend/api-server` |
| Shared libraries | `lib/*` (e.g. `lib/db`, `lib/api-zod`) |
| Root env | `.env` (copy from `.env.example`; API loads this file) |

Optional: **`frontend/mockup-sandbox`** — separate prototyping canvas, not part of the ERP UI.

**Local setup:** [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) — `pnpm run setup:env`, Postgres via Docker (`pnpm run db:up`), `pnpm run dev:stack`. If port **3000** is busy: `pnpm run ports:free` or change **`PORT`** in `.env`.