# ERP deck (“What App will cover”) vs FurniCore

This maps each slide item to **what exists today**, **how to use it**, and **what still needs product/design work**.

## Operational: admin login and API

| Topic | Notes |
|-------|--------|
| **Bootstrap admin** | Run `pnpm --filter @workspace/scripts seed-admin` (uses `ADMIN_EMAIL` / `ADMIN_PASS` from `.env`, defaults `admin@furnicore.com` / `Admin@123456`). Idempotent: resets password and role. |
| **Full demo data** | `pnpm --filter @workspace/scripts seed-all-demo` — runs admin, catalog, suppliers + quotes, HR, manufacturing, COGM, accounting, etc. |
| **Dev SPA + API** | Vite proxies `/api` and `/uploads` to `VITE_API_URL` (default `http://localhost:3000`). If the API is down, the login page shows **Cannot reach API**. |
| **401 Invalid credentials** | Usually wrong password or user missing in the DB tied to the API’s `DATABASE_URL`. Re-run `seed-admin` against the **same** database the API process uses. |
| **Migrations before seeds** | If inserts fail with “column does not exist”, apply SQL migrations: `pnpm --filter @workspace/scripts migrate`, then re-run seeds. |

---

## Business rules vs implementation

### 1. Price approval workflow

| Layer | Coverage | Where |
|-------|------------|--------|
| **Supplier quotes** | Procurement submits drafts → Purchase Manager (`pending_pm`) → Finance when `requiresFinanceStep` / threshold (`pending_finance`) → approved rates stored as **official supplier rates** | `artifacts/api-server/src/lib/quoteWorkflow.js`, `routes/quotes.js`, UI **Procurement** (`/procurement`) and **Price approvals** (`/price-approvals`) |
| **Customer / catalog prices** | Sales proposes selling price / discount; Admin/Manager approve or reject; on approve, product selling price updates | `routes/price-proposals.js`, UI **Price approvals** (customer proposals section) |
| **Audit** | Activity log on create/approve/reject | `logActivity` in quote + price-proposal routes |

### 2. COGM and variance

| Topic | Coverage | Where |
|-------|------------|--------|
| **Monthly standard cost** | Stored per product / year / month (material, labor, overhead) | `GET/POST /api/cogm/standard-costs` |
| **Variance records** | Estimated vs actual material/labor/total vs standard (monthly snapshots) | `GET /api/cogm/variance-records`, computation in `routes/cogm.js` |
| **Material / labor inputs** | Inventory usage + manufacturing tasks / hours | `material_usage`, `manufacturing_tasks`, `app_settings` `LABOR_HOURLY_RATE` |
| **Accounting link** | Optional / partial — journals exist elsewhere; COGM tables are analytics-first | See deck row **10** below |

### 3. Data seeding (suppliers, quotes, inventory, products)

| Data | Source | Notes |
|------|--------|--------|
| Raw materials & products | `scripts/data/demo-catalog.json` | Wood, fabric, fasteners, polish; tables, chairs, sofas |
| Suppliers & quotes | `scripts/data/demo-suppliers-quotes.json` | Multiple quotes per inventory item (e.g. oak planks, birch plywood) for comparison |
| Commands | `seed-demo-catalog`, `seed-demo-suppliers`, or `seed-all-demo` | Quotes resolve `inventoryItemId` by **exact inventory name** match |

### 4. UI pages (connected to APIs)

| Page | Route | Roles (typical) |
|------|--------|------------------|
| Supplier quote management + rate comparison | `/procurement` | Ops / procurement roles |
| Price approval workflow (supplier + customer proposals) | `/price-approvals` | Manager, accountant, sales_manager, admin |
| COGM & variance | `/cogm-reports` | Finance + ops as gated |
| Inventory usage | `/inventory-usage` | Inventory + manufacturing visibility |

### 5. Reporting & analytics

| Report | API | Seeded? |
|--------|-----|---------|
| Supplier rate comparison | `GET /api/quotes/rate-comparison`, `GET /api/analytics/deck/supplier-comparison?inventoryItemId=` | Yes, when quotes carry `inventoryItemId` |
| Supplier rate variance (last two quotes) | `GET /api/analytics/deck/supplier-rate-variance` | Data-dependent |
| COGM variance | `GET /api/cogm/variance-records` | `seed-demo-cogm` in `seed-all-demo` |
| Inventory consumption | `GET /api/analytics/deck/task-material-cost`, inventory routes | Manufacturing + catalog seed |

---

## Original deck table (concise)

| # | Requirement | Coverage | Notes |
|---|-------------|----------|--------|
| **01** | Inventory reorder + supplier portal | **Partial → stronger** | Reorder levels, low-stock API, notifications, procurement demand, supplier portal |
| **02** | Customer selling price lock + owner approval | **Stronger** | Product price proposals with pending/approved/rejected; supplier quotes use workflow + official rates |
| **03** | Per-unit cost; worker usage; live inventory rate | **Partial** | `products.costPrice`, `inventory.unitCost`, material usage, task endpoints |
| **04** | Labor, HR, payroll, bonus/penalty | **Partial** | HR, payroll, performance reviews, payroll_adjustments; not full automation of delay rules |
| **05** | Supplier rate comparison, safe stock, demand | **Partial → stronger** | Comparison endpoints + procurement demand; safe stock = reorder semantics |
| **06** | Suggest worker / supplier | **Partial** | Heuristic endpoints in `analytics-deck` |
| **07** | Per-unit cost vs workers / time | **Partial** | `worker-product-efficiency` and task hours |
| **08** | Customer order tracking | **Covered** | Customer portal |
| **09** | Supplier rate variance | **Covered (data-dependent)** | `supplier-rate-variance` |
| **10** | COGM variance + remarks | **Partial → stronger** | Standard costs + `cogm_variance_records`; not full GL automation |

---

## New / notable API routes (staff)

- `GET /api/analytics/deck/supplier-rate-variance`
- `GET /api/analytics/deck/supplier-comparison?inventoryItemId=`
- `GET /api/analytics/deck/worker-product-efficiency`
- `GET /api/analytics/deck/suggested-workers?productId=`
- `GET /api/analytics/deck/task-material-cost`
- `POST /api/inventory/procurement-demand`
- `GET/POST /api/cogm/standard-costs`, `GET /api/cogm/variance-records`
- `GET/POST /api/price-proposals`, `POST .../approve`, `POST .../reject`
- Quote workflow: `POST /api/quotes/:id/workflow/submit`, `pm-approve`, `finance-approve`, etc. (see `quotes.js`)

---

## How you can help next

1. **Threshold rules:** Encode finance review triggers (amount bands) only in policy docs or add columns on quotes/settings.
2. **COGM ↔ GL:** Decide whether to post variance to journal entries automatically from `cogm_variance_records`.
3. **Power BI / external BI:** Point reports at the same PostgreSQL or expose read-only views.
