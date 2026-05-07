# ABC Metals — Cash Flow Management System

A production-grade petty cash & employee allocation tracker built on a double-entry ledger.
Stack: **React + Vite** (frontend) · **Node + Express** (backend) · **Supabase** (Postgres + Auth + Storage).

---

## What this does

- **Admins** create employees, allocate "coins" (virtual ₹), define categories, view/export reports.
- **Employees** see their balance, submit expenses with receipts, view their history.
- Every transaction posts a balanced **double-entry ledger row pair** (debit + credit). The ledger is the source of truth — balances are computed from it.
- Receipts are uploaded to **private Supabase Storage** with short-lived signed URLs.
- Excel & PDF exports for ledger, daily, and monthly reports.

---

## Repository layout

```
abc-cashflow/
├── supabase/migrations/        # SQL — run these in Supabase SQL Editor
│   ├── 001_init.sql            # tables, indexes, functions, views, RLS, seed
│   ├── 002_storage.sql         # private "receipts" bucket + storage RLS
│   └── 003_bootstrap_admin.sql # create your first admin row
├── backend/                    # Express API
│   ├── src/server.js
│   ├── src/routes/{admin,employee}.js
│   ├── src/services/export.js  # Excel + PDF generators
│   ├── src/middleware/auth.js  # JWT verification
│   └── src/config/supabase.js  # service-role client + per-user client
├── frontend/                   # Vite + React + Tailwind
│   ├── src/App.jsx             # routes
│   ├── src/pages/admin/*       # admin screens
│   ├── src/pages/employee/*    # employee screens
│   ├── src/lib/{api,supabase,format}.js
│   └── src/stores/auth.js      # Zustand
├── render.yaml                 # Render Blueprint for one-click deploy
└── .github/workflows/ci.yml
```

---

## Setup — step by step

### 1. Create the Supabase project

1. Go to **https://supabase.com/dashboard** → New Project. Choose any region (Mumbai/Singapore for India).
2. Save the database password somewhere safe.
3. Once provisioned, grab three values from **Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_KEY`  ⚠️ never commit this

### 2. Run the migrations

Open **Supabase Dashboard → SQL Editor → New query** and run, in order:

1. Paste contents of `supabase/migrations/001_init.sql` and click **Run**.
2. Paste contents of `supabase/migrations/002_storage.sql` and **Run**.

This creates all tables, RLS policies, double-entry ledger functions, the `receipts` bucket, and seeds default categories.

### 3. Bootstrap your first admin

Supabase requires the auth user to exist before you can link a profile to it.

1. **Authentication → Users → Add User** (Dashboard).
2. Enter your email + a strong password. ✅ Auto-confirm user.
3. Click **Create User**. Copy the new user's **UUID** from the list.
4. Open `supabase/migrations/003_bootstrap_admin.sql`, replace `YOUR_AUTH_USER_UUID` with that UUID, and adjust the email/name. Run it in the SQL Editor.

You should now be able to sign in as that admin once the app is running.

### 4. Run the backend locally

```bash
cd backend
cp .env.example .env
# Edit .env — paste your SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
npm install
npm run dev
```

Backend runs on `http://localhost:4000`. Visit `http://localhost:4000/health` to verify.

### 5. Run the frontend locally

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local — paste VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# Leave VITE_API_URL empty — Vite proxies /api to localhost:4000
npm install
npm run dev
```

Open **http://localhost:5173**, sign in with the admin email + password.

### 6. Add your first employee

In the running app:
1. Sign in as admin → **Employees → + Add Employee**.
2. Fill name, employee code (e.g. `EMP001`), email, initial password.
3. Submit — backend creates both the auth user and the `public.users` row.
4. Share the credentials with the employee. They sign in at `/login` and land on the employee dashboard.

---

## Going live — deploy to GitHub + Render

### A. Push to GitHub

```bash
cd abc-cashflow
git init
git add .
git commit -m "Initial commit — ABC Metals Cash Flow"
git branch -M main
git remote add origin git@github.com:nittin123goel/abc-cashflow.git
git push -u origin main
```

### B. Deploy with Render Blueprint (easy mode)

1. Go to **https://dashboard.render.com → New → Blueprint**.
2. Connect your GitHub repo (`abc-cashflow`).
3. Render reads `render.yaml` and shows two services:
   - `abc-cashflow-api` (web service)
   - `abc-cashflow` (static site)
4. Render will prompt for **environment variables**. Fill them:

   **For `abc-cashflow-api`:**
   - `SUPABASE_URL` = `https://YOUR_REF.supabase.co`
   - `SUPABASE_ANON_KEY` = `eyJ...`
   - `SUPABASE_SERVICE_KEY` = `eyJ...`
   - `CORS_ORIGIN` = `https://abc-cashflow.onrender.com` *(replace with your actual frontend URL after deploy)*

   **For `abc-cashflow` (frontend):**
   - `VITE_SUPABASE_URL` = same Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = same anon key
   - `VITE_API_URL` = `https://abc-cashflow-api.onrender.com` *(your backend URL — get it from Render after backend deploys)*

5. Hit **Apply**. Render builds and deploys both.

> **Heads up — circular URLs:** You can't know the exact URLs until services exist. Easy way: deploy with placeholder values, then once each service has its real URL, update the env vars in Render and trigger redeploy.

### C. Update Supabase Auth redirect URL

In Supabase Dashboard → **Authentication → URL Configuration**:
- Site URL: `https://abc-cashflow.onrender.com` (your frontend)
- Add to redirect allowlist if you later enable magic links

---

## Environment variable matrix

| Var | Where | Value |
|---|---|---|
| `SUPABASE_URL` | backend | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | backend | Supabase API anon key |
| `SUPABASE_SERVICE_KEY` | backend | Supabase service role key (secret) |
| `CORS_ORIGIN` | backend | Frontend URL(s), comma-separated |
| `PORT` | backend (Render) | `10000` |
| `VITE_SUPABASE_URL` | frontend | same as backend `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | frontend | same as backend `SUPABASE_ANON_KEY` |
| `VITE_API_URL` | frontend (prod only) | Backend URL — leave empty in dev |

---

## How the double-entry ledger works

Every transaction creates **two rows** in `ledger_entries`, sharing the same `txn_ref`:

| Action | Debit (Dr.) | Credit (Cr.) |
|---|---|---|
| Allocation (admin → employee) | Employee Wallet | Company Cash |
| Expense (employee submits) | Expense Account (category) | Employee Wallet |
| Adjustment +ve | Employee Wallet | Company Cash |
| Adjustment −ve | Company Cash | Employee Wallet |

**Balance** = `sum(debit) − sum(credit)` for that wallet's ledger rows. This is computed in the `v_employee_balance` view, so you never store a balance — it's always derivable.

The DB functions `post_allocation`, `post_expense`, `post_adjustment` are `SECURITY DEFINER`, so they bypass RLS at write time but enforce role checks themselves. Direct INSERTs to ledger/expenses are not exposed via RLS — clients **must** call these functions through the backend.

---

## API surface (what the backend exposes)

### Public
- `GET /health`

### Authenticated (any signed-in user)
- `GET /api/me` — profile + summary
- `GET /api/me/balance`
- `GET /api/me/expenses?from&to&category_id`
- `POST /api/me/expenses` — body: `{ amount, category_id, subcategory_id?, description?, expense_date, receipt_path? }`
- `GET /api/me/allocations`
- `POST /api/me/receipts` — multipart file
- `GET /api/me/receipts/signed-url?path=...` — 5-min signed URL
- `GET /api/categories`

### Admin only
- `GET /api/admin/employees`
- `POST /api/admin/employees` — body: `{ email, password, full_name, employee_code, phone? }`
- `PATCH /api/admin/employees/:id`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `POST /api/admin/categories/:id/subcategories`
- `GET /api/admin/allocations`
- `POST /api/admin/allocations` — body: `{ employee_id, amount, notes? }`
- `POST /api/admin/adjustments` — body: `{ employee_id, amount, reason }`
- `GET /api/admin/reports/dashboard`
- `GET /api/admin/reports/daily?date=YYYY-MM-DD`
- `GET /api/admin/reports/monthly?month=YYYY-MM`
- `GET /api/admin/reports/ledger?employee_id&type&from&to`
- `GET /api/admin/export/{ledger,daily,monthly}.{xlsx,pdf}`

All authenticated endpoints require `Authorization: Bearer <supabase_jwt>` (handled automatically by the frontend api client).

---

## Troubleshooting

- **`User profile not found in public.users`** — your auth user exists but the `public.users` row wasn't created. Run `003_bootstrap_admin.sql` for an admin, or have an admin add the user via the Employees page.
- **CORS errors in browser** — set `CORS_ORIGIN` to exactly match your frontend URL (no trailing slash).
- **Receipt upload 403** — RLS policy expects the file path to start with `{user_id}/`. The backend handles this automatically.
- **Render free tier sleep** — first request after idle takes 30–50 seconds. Upgrade to Starter ($7/mo) for always-on.
- **Excel/PDF download is blank** — check backend logs; usually a missing env var. Health check at `/health` first.

---

## Roadmap (Phase 2+)

- Recurring/scheduled allocations (cron via Supabase Edge Functions)
- Receipt OCR for auto-fill (Mindee or Google Vision)
- Multi-tenant — same codebase serves Adventuria, ABC Metals, Terra Green
- WhatsApp expense submission via Wati webhook
- Approval workflows (admin approves expenses > threshold)
- Budgets per category per month
- Audit-log viewer in admin panel

---

Built for ABC Metals · Faridabad · 2026
