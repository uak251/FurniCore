# Phase 3 Refactor Log (Backend -> Frontend)

This log tracks module-by-module moves with build/test gates.
All quarantined files remain in `bin/legacy`.

## Shared RBAC Contract

- Source of truth kept at `contracts/analytics-rbac.v1.json`.
- Backend endpoint remains: `GET /api/analytics/rbac-contract` (admin-only).

## Backend Module Moves (completed)

1. auth
   - moved: `src/routes/auth.js` -> `src/modules/auth/routes/auth.js`
   - route wiring: `src/routes/index.js` imports updated
   - gate: `pnpm run build` + `vitest src/__tests__/authenticate.test.js`

2. inventory
   - moved: `src/routes/inventory.js` -> `src/modules/inventory/routes/inventory.js`
   - route wiring: updated
   - gate: `pnpm run build` + inventory test set

3. suppliers
   - moved: `src/routes/suppliers.js` -> `src/modules/suppliers/routes/suppliers.js`
   - route wiring: updated
   - gate: `pnpm run build` + `portal-isolation` tests

4. manufacturing
   - moved: `src/routes/manufacturing.js` -> `src/modules/manufacturing/routes/manufacturing.js`
   - route wiring: updated
   - gate: `pnpm run build` + `data-scoping` tests

5. accounting
   - moved: `src/routes/accounting.js` -> `src/modules/accounting/routes/accounting.js`
   - route wiring: updated
   - internal import fixed to `src/routes/journal-entries`
   - gate: `pnpm run build` + `data-scoping` tests

6. hr
   - moved: `src/routes/hr.js` -> `src/modules/hr/routes/hr.js`
   - route wiring: updated
   - gate: `pnpm run build` + `data-scoping` tests

7. payroll
   - moved: `src/routes/payroll.js` -> `src/modules/payroll/routes/payroll.js`
   - route wiring: updated
   - internal import fixed to `src/routes/hr-portal`
   - gate: `pnpm run build` + `data-scoping` + `portal-isolation`

8. admin
   - moved: `src/routes/users.js` -> `src/modules/admin/routes/users.js`
   - route wiring: updated
   - gate: `pnpm run build` + `authenticate` + `portal-isolation`

## Frontend Module Moves (completed)

To avoid route regressions, page compatibility stubs were left in `src/pages/*` that re-export from `src/modules/*/pages/*`.

1. auth
   - moved: `src/pages/login.jsx` -> `src/modules/auth/pages/login.jsx`
   - stub: `src/pages/login.jsx`
   - gate: `pnpm run build` + `login-redirect`

2. inventory
   - moved: `src/pages/inventory.jsx` -> `src/modules/inventory/pages/inventory.jsx`
   - stub: `src/pages/inventory.jsx`
   - gate: `pnpm run build` + `module-gallery`

3. suppliers
   - moved: `src/pages/suppliers.jsx` -> `src/modules/suppliers/pages/suppliers.jsx`
   - stub: `src/pages/suppliers.jsx`
   - gate: `pnpm run build` + `layout-redirect`

4. manufacturing
   - moved: `src/pages/manufacturing.jsx` -> `src/modules/manufacturing/pages/manufacturing.jsx`
   - stub: `src/pages/manufacturing.jsx`
   - gate: `pnpm run build` + `module-gallery`

5. accounting
   - moved: `src/pages/accounting.jsx` -> `src/modules/accounting/pages/accounting.jsx`
   - stub: `src/pages/accounting.jsx`
   - gate: `pnpm run build` + `role-guard`

6. hr
   - moved: `src/pages/hr.jsx` -> `src/modules/hr/pages/hr.jsx`
   - stub: `src/pages/hr.jsx`
   - gate: `pnpm run build` + `role-guard`

7. payroll
   - moved: `src/pages/payroll.jsx` -> `src/modules/payroll/pages/payroll.jsx`
   - stub: `src/pages/payroll.jsx`
   - gate: `pnpm run build` + `role-guard`

8. admin
   - moved: `src/pages/users.jsx` -> `src/modules/admin/pages/users.jsx`
   - stub: `src/pages/users.jsx`
   - gate: `pnpm run build` + `role-guard` + `layout-redirect`

## Updated Trees

### backend/api-server/src (relevant)

```txt
src/
  modules/
    auth/routes/auth.js
    inventory/routes/inventory.js
    suppliers/routes/suppliers.js
    manufacturing/routes/manufacturing.js
    accounting/routes/accounting.js
    hr/routes/hr.js
    payroll/routes/payroll.js
    admin/routes/users.js
  middlewares/
  routes/
  services/
  lib/
```

### frontend/furnicore/src (relevant)

```txt
src/
  modules/
    auth/pages/login.jsx
    inventory/pages/inventory.jsx
    suppliers/pages/suppliers.jsx
    manufacturing/pages/manufacturing.jsx
    accounting/pages/accounting.jsx
    hr/pages/hr.jsx
    payroll/pages/payroll.jsx
    admin/pages/users.jsx
  pages/
    login.jsx (stub)
    inventory.jsx (stub)
    suppliers.jsx (stub)
    manufacturing.jsx (stub)
    accounting.jsx (stub)
    hr.jsx (stub)
    payroll.jsx (stub)
    users.jsx (stub)
```

## Final Verification

- Backend full gate passed:
  - `pnpm run build`
  - `pnpm run test`
- Frontend full gate passed:
  - `pnpm run build`
  - `pnpm run test`

## Next Safe Steps

1. Move additional pages/hooks/services into `src/modules/*` by domain.
2. Replace compatibility stubs by updating imports in `App.jsx` and related consumers.
3. Add `src/config`, `src/controllers`, `src/models`, `src/utils` split in backend and migrate from `src/lib`.
4. Keep all removed or uncertain artifacts in `bin/legacy` until one release cycle confirms stability.
