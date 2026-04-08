# TypeScript → JavaScript migration (FurniCore artifacts)

This document describes how the `artifacts/api-server` and `artifacts/furnicore` packages were moved from TypeScript to JavaScript, and how to repeat or extend the process.

## Scope

| Area | Status |
|------|--------|
| `artifacts/api-server` | Converted: `src/**/*.ts` → `.js` |
| `artifacts/furnicore` | Converted: `src/**/*.{ts,tsx}` → `.{js,jsx}`, configs `vite.config.js`, `vitest.config.js` |
| `lib/*` (db, api-zod, api-client-react, …) | **Still TypeScript** — consumed as workspace sources; bundlers (esbuild / Vite) compile them when imported |

Root `pnpm run typecheck` still runs `tsc --build` for shared libraries. If `lib/` fails typecheck in your tree, fix or exclude that project separately; artifact packages use `typecheck` scripts that exit successfully so the monorepo step can proceed once libs are clean.

## Migration steps (checklist)

1. **Backup / branch** — Commit or branch before bulk renames.
2. **Automated strip** — Run the repo script (see below) or use the same approach (`typescript.transpileModule` or esbuild with `loader: "ts"` / `"tsx"`).
3. **Entry points** — Update bundler entries (e.g. `build.mjs` → `src/index.js`; `index.html` → `/src/main.jsx`).
4. **Configs** — Rename `vite.config.ts` / `vitest.config.ts` to `.js`, fix any string references to old paths (`setupFiles`, coverage `include`, etc.).
5. **Remove TS project files** — Delete `tsconfig.json` in artifacts; add `jsconfig.json` for editor path aliases (`@/*`) where helpful.
6. **Package scripts** — Point `dev` / `build` / `test` at `.js` configs; replace `tsc --noEmit` with a no-op or ESLint-only check for JS packages.
7. **ESLint** — Use flat config (`eslint.config.js`) with `@eslint/js` + React plugins for `.jsx`; do **not** use `@typescript-eslint/*` for pure JS trees.
8. **Hooks / lint** — Fix valid `react-hooks/rules-of-hooks` issues (e.g. move `useEffect` above early `return`s).
9. **Verify** — `pnpm -r --filter "./artifacts/api-server" --filter "./artifacts/furnicore" run build` and `run test`.

## Converter script

From the repo root:

```bash
node scripts/ts-to-js-convert.mjs artifacts/api-server
node scripts/ts-to-js-convert.mjs artifacts/furnicore
```

The script walks the package tree (skips `node_modules`, `dist`), transpiles with `typescript.transpileModule`, writes `.js` / `.jsx`, and deletes the `.ts` / `.tsx` sources. For **new** runs on `.tsx`, prefer `jsx: JsxEmit.Preserve` in the script so output stays readable (JSX left to Vite). The FurniCore tree was converted with the React JSX emit at the time of migration; re-running with Preserve is optional for readability.

## ESLint

- Root: `eslint.config.js` — `recommended` for Node (`artifacts/api-server/src`) and React (`artifacts/furnicore/src`).
- `eslint-plugin-react-hooks@5` — classic `rules-of-hooks` + `exhaustive-deps` (avoids React Compiler–only rules from v7 that conflict with many codebases).
- Run: `pnpm run lint` at the repo root, or `pnpm run lint` inside each artifact (`eslint src`).

## Sample conversions

### Backend route (`health`)

**Before (`health.ts`):**

```ts
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
```

**After (`health.js`):**

```js
import { Router } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
const router = Router();
router.get("/healthz", (_req, res) => {
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
});
export default router;
```

### Frontend utility (`utils`)

**Before (`utils.ts`):**

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**After (`utils.js`):**

```js
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
```

## Optional follow-ups

- Convert `lib/*` to JavaScript or keep TS and treat artifacts as the JS application layer.
- Tighten ESLint (stricter `no-unused-vars`, import sorting) once warnings are cleaned up.
- Regenerate `.jsx` with JSX **Preserve** if you want files without `_jsx`/`_jsxs` runtime output from `tsc` emit.
