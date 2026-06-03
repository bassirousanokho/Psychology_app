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
10. [Deploying to Vercel](#deploying-to-vercel)
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
| File uploads | UploadThing v7 |
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
│   │   ├── uploadthing/         # UploadThing file router
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
│   ├── prisma.ts                # Prisma singleton
│   ├── tenant.ts                # requireAuth(), audit() helpers
│   ├── uploadthing.ts           # Typed client uploader
│   └── utils.ts
├── generated/prisma/            # Auto-generated Prisma client (do not edit)
└── proxy.ts                     # Clerk middleware (Next.js 16: middleware.ts → proxy.ts)
```

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 14+ — [Supabase free tier](#supabase-setup) is the recommended option for development
- **Clerk account** — [dashboard.clerk.com](https://dashboard.clerk.com)
- **UploadThing account** — [uploadthing.com](https://uploadthing.com) (for file uploads)
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

Follow the [Supabase setup](#supabase-setup) section below to get a free PostgreSQL database, then paste the connection string into `DATABASE_URL` in `.env` and run:

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

### 6. Configure UploadThing (optional locally)

1. Create an app at [uploadthing.com/dashboard](https://uploadthing.com/dashboard).
2. Copy the **App Token** into `UPLOADTHING_TOKEN` in `.env`.

File uploads will fail silently if this is not configured, but the rest of the app works fine.

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
| `UPLOADTHING_TOKEN` | Yes (prod) | UploadThing app token |
| `RESEND_API_KEY` | No | Resend API key — invoice reminders fall back to `console.log` if absent |
| `RESEND_FROM_EMAIL` | No | Verified sender address in Resend |
| `NEXT_PUBLIC_APP_URL` | Yes (prod) | Full public URL — used in invoice email links |
| `CRON_SECRET` | Yes (prod) | Random secret to protect the dunning cron endpoint |

---

## Database

### Supabase setup

[Supabase](https://supabase.com) provides a free PostgreSQL database — no credit card required.

**1. Create a project**

- Sign in at [supabase.com](https://supabase.com) with GitHub
- Click **New project**, choose a name and a strong database password
- Wait ~1 minute for provisioning

**2. Get the connection string**

Go to **Settings → Database → Connection string → URI** and copy the string. It looks like:

```
postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

> **Important:** Use port **5432** (direct connection), not port 6543 (PgBouncer pooled). Prisma migrations require a direct connection.

**3. Add it to your `.env`**

```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres"
```

**4. Run migrations**

```bash
npx prisma migrate dev --name init
```

All tables are created. You can browse them in **Supabase → Table Editor** or with:

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
- Upload PDFs and images (up to 16 MB) to a patient profile or appointment
- Toggle **Share with patient** — flagged documents are included in automated emails
- Delete removes the file from UploadThing CDN and the database record

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
`/api/cron/dunning` checks `Authorization: Bearer <CRON_SECRET>`. Unauthenticated requests return 401. Vercel sets this header automatically when calling crons defined in `vercel.json`.

---

## Deploying to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "initial commit"
git push origin main
```

### 2. Create a Vercel project

Import the repository at [vercel.com/new](https://vercel.com/new). Vercel detects Next.js automatically.

### 3. Set environment variables

In the Vercel dashboard under **Settings → Environment Variables**, add every variable from `.env.example`. For production:

- `NEXT_PUBLIC_APP_URL` → your Vercel deployment URL (e.g. `https://psy-app.vercel.app`)
- `DATABASE_URL` → your Supabase (or other) PostgreSQL connection string
- `ENCRYPTION_KEY` → the same 64-char hex key you use locally (rotating keys requires a data migration)
- `CRON_SECRET` → a random secret (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

### 4. Run migrations against production DB

```bash
DATABASE_URL="<prod-connection-string>" npx prisma migrate deploy
```

### 5. Update the Clerk webhook URL

In Clerk, edit the webhook endpoint URL to point to your production domain: `https://your-app.vercel.app/api/webhooks/clerk`.

### 6. Cron job

The dunning cron (`/api/cron/dunning`) runs daily at 08:00 UTC via `vercel.json`. Vercel calls it with the `Authorization: Bearer <CRON_SECRET>` header automatically. No additional setup is needed — it activates on the first deployment.

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
