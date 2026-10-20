# PsyApp — Practice Management SaaS for Psychologists

A multi-tenant practice management platform built for psychologists and therapy clinics. Handles patient records, weekly scheduling, clinical notes (encrypted at rest), invoicing, and document sharing — one workspace per practitioner, auto-provisioned on sign-up.

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Project structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Local setup](#local-setup)
5. [Environment variables](#environment-variables)
6. [Database](#database)
7. [Running the app](#running-the-app)
8. [Feature overview](#feature-overview)
9. [Security model](#security-model)
10. [Deploying to GCP (Cloud Run + Neon)](#deploying-to-gcp-cloud-run--neon)
11. [Useful scripts](#useful-scripts)

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router, React Server Components, Server Actions) |
| Language | TypeScript 5 (strict) |
| Database | PostgreSQL |
| ORM | Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg` driver adapter) |
| Auth | Clerk (each user is their own workspace — no organisations required) |
| UI | Shadcn UI v4 (base-ui, not Radix) + Tailwind CSS v4 |
| File uploads | Google Cloud Storage (private bucket, signed URLs) |
| Email | Resend |
| Tables | TanStack Table v8 |
| Forms | react-hook-form + Zod |
| Toasts | Sonner |
| Dates | date-fns |

---

## Project structure

```
src/
├── app/
│   ├── (dashboard)/dashboard/   # All authenticated practitioner routes
│   │   ├── page.tsx             # Overview / home dashboard
│   │   ├── calendar/            # Weekly calendar
│   │   ├── patients/            # Patient list + [id] profile page
│   │   ├── appointments/[id]/   # Session notes workspace
│   │   ├── billing/             # Invoice dashboard
│   │   └── settings/            # Workspace settings + data export
│   ├── portal/                  # Patient portal (separate auth)
│   ├── invoice/[token]/         # Public invoice view (no auth required)
│   ├── api/
│   │   ├── cron/dunning/        # Daily overdue-invoice cron
│   │   └── webhooks/clerk/      # Clerk webhook handler
│   └── sign-in / sign-up/
├── components/
│   ├── appointments/            # SessionEditor, InvoicePanel
│   ├── billing/                 # BillingTable, StatCard
│   ├── calendar/                # WeekCalendar
│   ├── dashboard/               # TodaysSchedule, PendingTasks
│   ├── documents/               # DocumentUploader, DocumentList
│   ├── layout/                  # AppSidebar, Header
│   ├── patients/                # PatientTable, PatientSheet, columns
│   ├── settings/                # SettingsForm
│   └── ui/                      # Shadcn primitives
├── lib/
│   ├── crypto.ts                # AES-256-GCM encrypt/decrypt
│   ├── email.ts                 # Resend helper
│   ├── gcs.ts                   # Signed upload/read URLs + delete (Google Cloud Storage)
│   ├── prisma.ts                # Prisma singleton
│   ├── tenant.ts                # requireAuth(), audit() helpers
│   └── utils.ts
├── generated/prisma/            # Auto-generated Prisma client (do not edit)
└── proxy.ts                     # Clerk middleware (Next.js 16: middleware.ts → proxy.ts)
```

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 14+ — [Neon free tier](#neon-setup) is the recommended option for development
- **Clerk account** — [dashboard.clerk.com](https://dashboard.clerk.com)
- **GCP project with a Cloud Storage bucket** — for patient document uploads (see [Configure Google Cloud Storage](#6-configure-google-cloud-storage-optional-locally))
- **Resend account** — [resend.com](https://resend.com) (for invoice reminder emails, optional locally)

---

## Local setup

### 1. Clone and install

```bash
git clone <repo-url>
cd psy_app
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in every value. See the [Environment variables](#environment-variables) section for details on each one.

### 3. Generate the encryption key

Session notes are encrypted at rest with AES-256-GCM. Generate a 32-byte key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output into `ENCRYPTION_KEY` in your `.env`. **Never commit this value.**

### 4. Set up the database

Follow the [Neon setup](#neon-setup) section below to get a free PostgreSQL database, then paste the connection string into `DATABASE_URL` in `.env` and run:

```bash
npx prisma migrate dev --name init
```

This creates all tables, enums, and indexes. The Prisma client is regenerated automatically.

If you later pull schema changes from the repo:

```bash
npx prisma migrate dev
```

### 5. Configure Clerk

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. Copy your publishable key and secret key into `.env`.
3. Register a webhook endpoint:
   - Use [ngrok](https://ngrok.com) to expose `localhost:3000` publicly: `ngrok http 3000`
   - In Clerk: **Webhooks → Add endpoint** → your ngrok URL + `/api/webhooks/clerk`
   - Subscribe to events: **`user.created`** and **`user.updated`** (no organisation events needed)
   - Copy the **Signing Secret** into `CLERK_WEBHOOK_SECRET` in `.env`

When a new user signs up, the webhook automatically creates their `Workspace` and `WorkspaceMember` records.

### 6. Configure Google Cloud Storage (optional locally)

Patient documents are stored in a **private** GCS bucket — the app never exposes a public file URL, only short-lived signed URLs generated per request (`src/lib/gcs.ts`).

1. Create a bucket: `gsutil mb -l <region> gs://<your-bucket-name>` (or via the console). Set `GCS_BUCKET_NAME` in `.env` to its name.
2. Create a service account for local dev and grant it access to the bucket:
   ```bash
   gcloud iam service-accounts create psy-app-dev
   gsutil iam ch serviceAccount:psy-app-dev@<PROJECT_ID>.iam.gserviceaccount.com:roles/storage.objectAdmin gs://<your-bucket-name>
   ```
3. Download a JSON key for it and point `GOOGLE_APPLICATION_CREDENTIALS` in `.env` at the file path. **Never commit this file** — it's covered by `.gitignore` (`*-service-account.json`).
   ```bash
   gcloud iam service-accounts keys create gcs-service-account.json \
     --iam-account=psy-app-dev@<PROJECT_ID>.iam.gserviceaccount.com
   ```
4. Allow browser uploads: the uploader `PUT`s files straight to the signed URL, so the bucket needs a CORS rule for your app's origin. Edit the origins in `cors.json` (localhost + your Cloud Run URL), then:
   ```bash
   gsutil cors set cors.json gs://<your-bucket-name>
   ```

File uploads will fail if this is not configured, but the rest of the app works fine.

### 7. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up — your workspace is created automatically by the Clerk webhook.

---

## Environment variables

All variables are documented in `.env.example`. Here is what each one does:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (public) |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (server-only) |
| `CLERK_WEBHOOK_SECRET` | Yes | Svix signing secret for Clerk webhooks |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Yes | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Yes | `/dashboard` |
| `ENCRYPTION_KEY` | Yes | 64-char hex string (32 bytes) for AES-256-GCM session note encryption |
| `GCS_BUCKET_NAME` | Yes (prod) | Google Cloud Storage bucket for patient documents |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local dev only | Path to a service-account JSON key with Storage Object Admin on the bucket. Not needed on Cloud Run (uses the attached service account) |
| `RESEND_API_KEY` | No | Resend API key — invoice reminders fall back to `console.log` if absent |
| `RESEND_FROM_EMAIL` | No | Verified sender address in Resend |
| `NEXT_PUBLIC_APP_URL` | Yes (prod) | Full public URL — used in invoice email links |
| `CRON_SECRET` | Yes (prod) | Random secret to protect the dunning cron endpoint |
| `TZ` | No | Practice time zone for server-side dates ("today", portal booking hours). Defaults to `America/Toronto` (Montréal, `src/instrumentation.ts`); use `Europe/Paris` for France. Cloud Run itself runs in UTC |

---

## Database

### Neon setup

[Neon](https://neon.tech) provides a free, serverless PostgreSQL database that scales to zero when idle — no credit card required. This is the recommended option for local dev, test, and the GCP deployment below (Supabase, Railway, or any Postgres 14+ works too — it's just a connection string).

**1. Create a project**

- Sign in at [console.neon.tech](https://console.neon.tech)
- Click **New project**, choose a region (pick one close to wherever you deploy the app — e.g. same region as your Cloud Run service), and a database name

**2. Get the connection string**

On the project dashboard, copy the **Direct connection** string (NOT the "Pooled connection" one — its host has a `-pooler` suffix). It looks like:

```
postgresql://USER:PASSWORD@ep-xxx-xxx.region.aws.neon.tech/psy_app_db?sslmode=require
```

> **Important:** Use the direct connection, not the pooled/PgBouncer one. The app holds a single long-lived `@prisma/adapter-pg` connection (`src/lib/prisma.ts`), and Prisma CLI migrations both expect normal session-level Postgres behavior that Neon's pooled endpoint doesn't fully support. At this app's scale (low concurrency per workspace) there's no need for connection pooling.

**3. Add it to your `.env`**

```env
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxx-xxx.region.aws.neon.tech/psy_app_db?sslmode=require"
```

**4. Run migrations**

```bash
npx prisma migrate dev --name init
```

All tables are created. You can browse them with:

```bash
npx prisma studio
```

---

### Schema overview

```
Workspace  (one per practitioner, id = Clerk userId)
├── WorkspaceMember  (role: PRACTITIONER | SECRETARY)
├── Patient
│   ├── Appointment  (sessionNotes encrypted at rest)
│   │   ├── Invoice
│   │   └── Document
│   └── Document
├── Invoice
├── Document
├── PatientUser      (links a Clerk user to a patient record)
├── PatientInvite    (time-limited portal invite tokens)
└── AuditLog
```

### Key design decisions

- **No cross-tenant queries** — every Prisma query includes `workspaceId` scoped to the current `userId` from `auth()`. Write mutations use `updateMany` / `deleteMany` with both `id` and `workspaceId` so a leaked record ID cannot touch another user's data.
- **Workspace ID = Clerk user ID** — auto-created by the `user.created` webhook. No separate ID mapping needed.
- **Appointment tariff snapshot** — `tariffAmount` and `taxRate` are copied from the workspace defaults at booking time; changing the workspace rate never retroactively alters past invoices.
- **Invoice lifecycle** — `DRAFT → SENT → PAID` (or `OVERDUE` if the due date passes while in `SENT` state).
- **Session notes encrypted** — stored as `enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>`. The `enc:` prefix makes plaintext values safe to read (migration passthrough).

### Regenerate the Prisma client after schema changes

```bash
npx prisma generate
```

### Open Prisma Studio (visual DB browser)

```bash
npx prisma studio
```

---

## Running the app

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm run start

# Type checking
npx tsc --noEmit

# Lint
npm run lint
```

---

## Feature overview

### Dashboard (`/dashboard`)
- Today's schedule with one-click **Prep dialog** (shows patient background + previous session notes)
- **Missing notes** widget listing past appointments without completed notes
- Monthly stats: active patients, sessions completed, outstanding invoices, revenue collected

### Calendar (`/dashboard/calendar`)
- CSS Grid weekly view (Mon–Sun, 08:00–20:00)
- Click any time slot to pre-fill the booking dialog
- Week navigation via `?week=yyyy-MM-dd` URL param
- Appointment status colours (Scheduled / Completed / Cancelled / No-show)

### Patients (`/dashboard/patients`)
- Searchable and sortable data table
- Create / Edit / Delete via slide-over sheet
- **Patient profile** (`/dashboard/patients/[id]`): full session history, document upload/management, background notes

### Session workspace (`/dashboard/appointments/[id]`)
- Large textarea for session notes with **auto-save** (2.5 s debounce)
- **Mark as completed** finalises the note (sets `noteCompletedAt`, status → COMPLETED)
- **Reopen** removes the completion stamp
- Notes are AES-256-GCM encrypted before hitting the database

### Billing (`/dashboard/billing`)
- Generate an invoice from any completed appointment (tariff + tax snapshot)
- Invoice lifecycle: Draft → Mark as Sent → Mark as Paid
- Revenue and outstanding amount stat cards
- **Public invoice link** (`/invoice/[token]`) — shareable with the patient, no login required, print-friendly

### Settings (`/dashboard/settings`)
- Default session tariff, tax rate, currency
- Working days and hours (used by the calendar)
- **Export patient data** — downloads a JSON file of all patient records (GDPR Art. 20 data portability); session notes excluded

### Patient portal (`/portal/*`)

Separate section for patients — completely distinct from the practitioner dashboard.

**Invite flow:**
1. Practitioner opens a patient's profile → clicks **Invite to portal**
2. A time-limited link (7 days) is emailed to the patient
3. Patient clicks the link → `/portal/join/[token]` → creates a Clerk account → automatically linked to their record → redirected to the portal

**What patients can do:**
- **Book a session** — see available 60-min slots based on working hours; can't double-book; books from tomorrow onwards
- **Appointments** — full history with status badges; link to invoice if generated
- **Invoices** — only SENT/PAID/OVERDUE invoices visible (DRAFT is practitioner-only)
- **Documents** — files the practitioner marked "Share with patient"

**Auth separation:** `requirePatientAuth()` in `src/lib/patient-auth.ts` checks the logged-in Clerk user has a `PatientUser` record. Practitioner accounts (which own a `Workspace`) are redirected to `/dashboard` if they accidentally visit `/portal`.

### Documents
- Upload PDFs (≤16 MB) and images (≤8 MB) directly to a private GCS bucket via signed URLs — files never pass through the app server
- Toggle **Share with patient** — flagged documents are included in automated emails
- Viewing/downloading a document generates a short-lived (15 min) signed read URL on request; nothing is ever public
- Delete removes the object from GCS and the database record

---

## Security model

### Multi-tenancy
Every database model has a `workspaceId` column. All queries are scoped with `where: { workspaceId: userId }` derived from `auth().userId` (Clerk). Write mutations use `updateMany` / `deleteMany` so a valid record ID belonging to a different workspace silently matches 0 rows.

### Encryption
Session notes (`Appointment.sessionNotes`) are encrypted with **AES-256-GCM** before writing to the database:

```
stored value: enc:<12-byte IV (hex)>:<16-byte auth tag (hex)>:<ciphertext (hex)>
```

- Key lives only in `ENCRYPTION_KEY` env var — never in code or git.
- Decryption happens in the Server Component; the client receives plaintext over the existing TLS connection.
- Values without the `enc:` prefix are treated as plaintext (safe migration path).

### Audit log
Sensitive operations (view notes, complete session, upload/delete document, data export) write a row to `AuditLog` asynchronously (fire-and-forget — never blocks the request):

```
AuditLog { workspaceId, userId, action, resourceType, resourceId, metadata, createdAt }
```

### Roles
| Role | Permissions |
|---|---|
| `PRACTITIONER` | Full access including session notes |
| `SECRETARY` | Calendar + billing; no session notes |

### Webhook verification
Clerk webhooks at `/api/webhooks/clerk` are verified with the **svix** library using `CLERK_WEBHOOK_SECRET`. Requests without a valid signature return 400.

### Cron job protection
`/api/cron/dunning` checks `Authorization: Bearer <CRON_SECRET>`. Unauthenticated requests return 401. The GCP deployment below sets this header via a Cloud Scheduler job.

---

## Deploying to GCP (Cloud Run + Neon)

Recommended deployment path for a test/staging environment: **Cloud Run** scales to zero (no cost when idle, free tier covers low traffic) and **Neon** (see [Database](#database) above) is a free serverless Postgres.

### 1. Prerequisites

- A GCP project with billing enabled (Cloud Run's free tier still requires a billing account attached, but a low-traffic test app should stay within it)
- [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) installed, then:

```bash
gcloud auth login
gcloud config set project <YOUR_PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

### 2. Set up the database

Follow the [Neon setup](#neon-setup) section above — grab the **direct (non-pooled)** connection string. Pick a Neon region close to the Cloud Run region you'll deploy to below.

### 3. Set up Google Cloud Storage

```bash
gsutil mb -l northamerica-northeast1 gs://<your-bucket-name>
# Montréal keeps patient documents in Canada (Québec's Law 25 expects personal
# health information to stay in Québec/Canada or be assessed before transfer)
```

Documents are served via signed URLs (`src/lib/gcs.ts`), never a public bucket. On Cloud Run there's no downloaded service-account key, so signing goes through the IAM SignBlob API instead — which means the runtime service account needs **two** roles, not just storage access:

```bash
# Defaults to PROJECT_NUMBER-compute@developer.gserviceaccount.com unless you
# deploy with --service-account to use a dedicated one
SA_EMAIL="<PROJECT_NUMBER>-compute@developer.gserviceaccount.com"

gsutil iam ch serviceAccount:$SA_EMAIL:roles/storage.objectAdmin gs://<your-bucket-name>

gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator"
```

Apply the CORS rule too (add your Cloud Run URL to `cors.json` first) — without it the browser blocks every upload:

```bash
gsutil cors set cors.json gs://<your-bucket-name>
```

> Skipping the `serviceAccountTokenCreator` self-binding is an easy mistake — without it, every `getSignedUrl()` call fails in production even though local dev (using a downloaded key file) works fine.

### 4. Prepare environment variables

Cloud Run needs every variable from `.env.example`. Create a local `.env.yaml` (already covered by the repo's `.env*` gitignore pattern — do **not** commit it):

```yaml
DATABASE_URL: "postgresql://USER:PASSWORD@ep-xxx-xxx.region.aws.neon.tech/psy_app_db?sslmode=require"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_..."
CLERK_SECRET_KEY: "sk_test_..."
CLERK_WEBHOOK_SECRET: "whsec_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/dashboard"
ENCRYPTION_KEY: "<64-char hex>"
GCS_BUCKET_NAME: "<your-bucket-name>"
RESEND_API_KEY: "re_..."
RESEND_FROM_EMAIL: "invoices@yourdomain.com"
NEXT_PUBLIC_APP_URL: "https://<placeholder — filled in after step 4, then redeploy>"
CRON_SECRET: "<random secret, e.g. openssl rand -hex 32>"
TZ: "America/Toronto"
```

> For anything beyond a throwaway test env, prefer `--set-secrets` with [Secret Manager](https://cloud.google.com/secret-manager) instead of a plaintext env file for `CLERK_SECRET_KEY`, `ENCRYPTION_KEY`, and `CRON_SECRET`.

### 5. Deploy — no Dockerfile needed

Cloud Run's buildpacks auto-detect Next.js from `package.json` and run `npm run build` / `npm start`, which already respects the `PORT` env var Cloud Run injects. Deploy straight from source:

```bash
gcloud run deploy psy-app \
  --source . \
  --region northamerica-northeast1 \
  --allow-unauthenticated \
  --env-vars-file .env.yaml
```

Note the `*.run.app` URL printed at the end of the deploy.

### 6. Point the app at its own URL

Update `NEXT_PUBLIC_APP_URL` in `.env.yaml` to the URL from step 5 (used in invoice email links), then redeploy:

```bash
gcloud run deploy psy-app --source . --region northamerica-northeast1 --env-vars-file .env.yaml
```

### 7. Run migrations against Neon

```bash
DATABASE_URL="<neon-direct-connection-string>" npx prisma migrate deploy
```

### 8. Update the Clerk webhook URL

In Clerk: **Webhooks → your endpoint** → set the URL to `https://<your-service>.run.app/api/webhooks/clerk`.

### 9. Cron job — Cloud Scheduler

Recreate the daily dunning job with Cloud Scheduler, calling the same protected endpoint with the same `Authorization` header the route already checks for:

```bash
gcloud scheduler jobs create http psy-app-dunning \
  --location northamerica-northeast1 \
  --schedule "0 8 * * *" \
  --time-zone "America/Toronto" \
  --uri "https://<your-service>.run.app/api/cron/dunning" \
  --http-method GET \
  --headers "Authorization=Bearer <CRON_SECRET>"
```

### Cost notes

- Cloud Run: scales to zero between requests; a low-traffic test app should sit entirely within the free tier (2M requests/month included).
- Neon: free tier autosuspends after idle and wakes automatically on the next query — no cost while untouched.
- GCS: ~5GB Always Free storage, then roughly $0.02/GB/month — a handful of patient documents should stay free or cost pennies.
- Expect occasional cold-start latency (Cloud Run spin-up + Neon wake) on the first request after idle — acceptable for a test env, not something to rely on for production SLAs.

---

## Useful scripts

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Apply pending migrations to production DB
DATABASE_URL="..." npx prisma migrate deploy

# Regenerate Prisma client after schema changes
npx prisma generate

# Open Prisma Studio (visual DB editor)
npx prisma studio

# Run type check
npx tsc --noEmit

# Trigger the dunning cron manually (replace values)
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/dunning
```
