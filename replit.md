# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Local setup (first time)

1. Install dependencies from the repo root: `pnpm install`
2. Copy env templates:
   - Root: copy `.env.example` to `.env` and set `DATABASE_URL`, `PORT`, and `SESSION_SECRET` (see comments in `.env.example`).
   - FurniCore: copy `frontend/furnicore/.env.example` to `frontend/furnicore/.env` (set `PORT` / `BASE_PATH`; Vite uses a different `PORT` than the API, e.g. 5173 vs 3000).
   - Mockup sandbox (optional): copy `frontend/mockup-sandbox/.env.example` to `frontend/mockup-sandbox/.env` when present.
3. Ensure PostgreSQL is running and `DATABASE_URL` in the root `.env` is valid.
4. Apply the schema (dev): `pnpm --filter @workspace/db run push`

The API and Drizzle load the **root** `.env` automatically. Vite apps load `.env` from their own package directory.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only); uses root `.env` for `DATABASE_URL`
- `pnpm --filter @workspace/api-server run dev` — build and run API server locally (reads root `.env`)
- `pnpm --filter @workspace/furnicore run dev` — FurniCore Vite dev server
- `pnpm --filter @workspace/mockup-sandbox run dev` — mockup sandbox Vite dev server

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
