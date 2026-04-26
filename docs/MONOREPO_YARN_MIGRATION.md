# Yarn-Only Monorepo Migration (FurniCore ERP)

This guide reorganizes the repository while preserving existing features.

## Target Tree

```txt
furnicore-erp/
  package.json
  .yarnrc.yml
  yarn.lock
  contracts/
    analytics-rbac.v1.json
  frontend/
    package.json
    index.html
    src/
      components/
      pages/
      modules/
      layouts/
      services/
      store/
      hooks/
      utils/
  backend/
    package.json
    server.js
    .env
    prisma/
      schema.prisma
      migrations/
    src/
      config/
      modules/
        auth/
        inventory/
        suppliers/
        manufacturing/
        accounting/
        hr/
        payroll/
        admin/
      middlewares/
      routes/
      controllers/
      services/
      models/
      utils/
```

## Yarn Workspace Config

Root `package.json`:

```json
{
  "name": "furnicore-erp",
  "private": true,
  "packageManager": "yarn@4.9.2",
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "yarn workspaces foreach -pt run dev",
    "dev:frontend": "yarn workspace @furnicore/frontend dev",
    "dev:backend": "yarn workspace @furnicore/backend dev",
    "build": "yarn workspaces foreach -pt run build",
    "test": "yarn workspaces foreach -pt run test",
    "lint": "yarn workspaces foreach -pt run lint"
  }
}
```

`.yarnrc.yml`:

```yml
nodeLinker: node-modules
```

## Safe Cleanup / Reorganization Steps

1. Freeze current baseline (`build`, `test`, smoke login/dashboard).
2. Move app roots to `frontend/` and `backend/` without changing runtime logic.
3. Keep RBAC contract in `contracts/analytics-rbac.v1.json` and import from both apps.
4. Move dead or legacy assets to `/bin/legacy` first (do not delete immediately).
5. Replace path imports incrementally (module-by-module).
6. Add CI checks: build + test + RBAC contract drift tests.
7. After one stable release cycle, delete `bin/legacy` leftovers.

## Files/Folders Typically Safe to Move to /bin/legacy (after verification)

- old generated stubs not imported by app entrypoints
- duplicate lockfiles from nested packages not used by Yarn
- outdated experimental scripts/config snapshots
- test fixture files unrelated to active test runner

Always verify by running:

```bash
yarn build
yarn test
```

## RBAC Contract Endpoint

Backend includes admin-only endpoint:

- `GET /api/analytics/rbac-contract`

Returns active contract version and mapping for Settings display.

## Production Readiness Notes

- Keep env loading deterministic (`frontend` and `backend` separated).
- Keep API route paths unchanged during move to avoid frontend regressions.
- Preserve middleware order: auth -> RBAC -> handlers -> global error handler.
- Keep responsive chart containers (`ResponsiveContainer`) and shared chart schema.
