# Phase 2 Cleanup Report (Safe Legacy Quarantine)

This report documents concrete cleanup actions executed without deleting files.
All moved items are kept under version-controlled `bin/legacy` for rollback.

## Moved to bin/legacy

- `frontend/mockup-sandbox` -> `bin/legacy/frontend/mockup-sandbox`
- `Furnicore-backend` -> `bin/legacy/root/Furnicore-backend`
- `frontend/package.json` -> `bin/legacy/frontend-root/package.json`
- `frontend/pnpm-lock.yaml` -> `bin/legacy/frontend-root/pnpm-lock.yaml`
- `frontend/pnpm-workspace.yaml` -> `bin/legacy/frontend-root/pnpm-workspace.yaml`
- `backend/api-server/pnpm-lock.yaml` -> `bin/legacy/backend-api-server/pnpm-lock.yaml`

## Workspace Wiring Changes

- Updated `pnpm-workspace.yaml` to remove legacy optional package entry:
  - removed `frontend/mockup-sandbox`

## Verification Performed After Moves

Backend checks:

```bash
cd backend/api-server
pnpm run build
pnpm run test
```

Frontend checks:

```bash
cd frontend/furnicore
pnpm run build
pnpm run test
```

Result: all checks passed after each move batch.

## Current Active Tree (cleanup state)

```txt
FurniCore/
  backend/
    api-server/
      src/
        lib/
        middlewares/
        routes/
        services/
        __tests__/
  frontend/
    furnicore/
      src/
        components/
        context/
        contexts/
        hooks/
        lib/
        pages/
        types/
        __tests__/
  contracts/
    analytics-rbac.v1.json
  bin/
    legacy/
      backend-api-server/
      frontend/
      frontend-root/
      root/
```

## Migration Steps to Reach Final Modular Layout (No Breakage)

1. Create target folders without moving runtime entrypoints first.
2. Backend: split `src/lib` into `src/config`, `src/controllers`, `src/models`, `src/utils`, `src/modules/*` by domain.
3. Backend: keep `src/routes/index.js` stable and remap imports incrementally per module.
4. Frontend: split `src/lib` + `src/context(s)` into `src/services`, `src/store`, `src/utils`, `src/layouts`, `src/modules/*`.
5. Keep `contracts/analytics-rbac.v1.json` as shared source for both apps.
6. Run build+test after each module move.
7. After at least one stable cycle, permanently delete selected `bin/legacy` items.

## Yarn-Only Workspace Config (target)

See: `docs/MONOREPO_YARN_MIGRATION.md`

