# Practitioner test scenarios

Manual end-to-end test plan covering everything a practitioner does in the app, from creating an account to chasing an unpaid invoice. Run it on the recette (GCP) environment before every release, and locally after any significant change.

**How to use this file**

- Work through the sections in order: later sections reuse data created earlier.
- Tick each `[ ]` as you verify it. Any unticked box is a failure: note what you saw next to it.
- ⚠️ marks a check that, from reading the code, is **expected to fail or behave oddly**. Run it anyway and confirm. Each one is listed again in [Suspected issues](#suspected-issues) at the end.
- "DB check" means: verify in the database (Neon console or `npx prisma studio`).

---

## 0. Setup

### 0.1 Environment

- [X] App URL is reachable (Cloud Run URL or `http://localhost:3000`).
- [X] `.env` / Cloud Run env vars are all set: `DATABASE_URL`, Clerk keys, `CLERK_WEBHOOK_SECRET`, `ENCRYPTION_KEY`, `GCS_BUCKET_NAME`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`.
- [X] `NEXT_PUBLIC_APP_URL` matches the URL you are testing on (invite and invoice links are built from it).
- [X] Database migrations are applied (`npx prisma migrate deploy`).
- [X] `TZ` is unset or `Europe/Paris` on Cloud Run (the app defaults to Europe/Paris).
- [X] Clerk webhook endpoint points at `<app-url>/api/webhooks/clerk` and is subscribed to `user.created` and `user.updated`.
- [X] GCS bucket has a CORS rule for the app's origin (`gsutil cors get gs://<bucket>`).
- [X] Resend sending domain is verified (or accept that emails are only logged to the server console).

### 0.2 Test accounts and data

Prepare before starting:

| Item | Value to use |
|---|---|
| Practitioner A | A fresh email you control, e.g. `prac.a+test@…` |
| Practitioner B | A second fresh email (used for data-isolation tests) |
| Patient email | A third email you can open (used for portal invite) |
| Test files | 1 small PDF (< 1 MB), 1 PDF of 15 MB, 1 PDF of 17 MB, 1 JPG/PNG (< 1 MB), 1 image of 9 MB, 1 `.docx`, 1 `.heic` photo, 1 file with accents/spaces in its name, e.g. `Compte rendu séance n°1.pdf` |
| Devices | Desktop browser + a phone (or devtools mobile view) |

---

## 1. Account creation and first login

### 1.1 Sign up as a new practitioner

1. Open the app URL while signed out.
2. You are redirected to sign in. Click through to sign up and create Practitioner A with first name + last name.

- [X] `/` redirects to `/dashboard`, which redirects to `/sign-in`.
- [X] Sign-up completes and lands on `/dashboard`. comment : This message pops : No organization selected
Use the switcher in the sidebar to select a clinic workspace (outDated probably we could assume independant and make it editable)
- [X] DB check: `User`, `Workspace` (id = Clerk user id, `workingDays = [1,2,3,4,5]`) and `WorkspaceMember` (role `PRACTITIONER`) rows exist.
- [X] Sidebar header shows your full name as the practice name.
- [X] Overview greets you by first name with the right "Good morning / afternoon / evening" for French local time.
- [X] No "No organization selected" banner (removed: the workspace is now created on first dashboard visit if the webhook hasn't arrived).
- [X] Clerk dashboard → Webhooks → your endpoint: the `user.created` delivery shows **200**.

### 1.2 Sign out / sign back in

- [X] User button (bottom of sidebar) shows your name and offers sign out.
- [X] After signing out, visiting any `/dashboard/...` URL redirects to sign-in.
- [X] Signing back in returns to the dashboard with all data intact.

### 1.3 Profile change sync

1. In the Clerk user menu, change your last name.

- [X] DB check: `User.name` is updated (via `user.updated` webhook).
- [X] Note: the sidebar practice name does **not** change (it's the workspace name, set once at sign-up). There is no setting to rename the practice.

### 1.4 Empty states (brand-new account)

- [X] Overview: "No appointments scheduled for today", "All sessions are documented", all stats at 0 / €0.00.
- [X] Patients: "No patients yet. Add your first one!" and "0 patients in this workspace".
- [X] Calendar: empty week grid, "0 appointments this week".
- [X] Billing: "No invoices yet. Generate one from a completed appointment." and all stat cards at 0.
- [X] Clinical Notes: placeholder page ("coming in Milestone 4"). This is expected for now, but note that the sidebar badge links here.

---

## 2. Practice settings

Go to **Settings**.

### 2.1 Defaults are loaded

- [X] Session tariff 0, tax rate 0, currency EUR, Mon–Fri selected, 09:00 → 18:00.

### 2.2 Save valid billing defaults

1. Set tariff `70`, tax rate `0`, currency `EUR`. Save.

- [X] Toast "Settings saved".
- [X] Reload the page: values persist.
- [X] Tariff accepts decimals (`72.50`) and saves them exactly.

### 2.3 Validation

- [x] Negative tariff is rejected (browser `min=0` or error message).
- [x] Tax rate `101` is rejected.
- [x] Tax rate `5.5` saves. Remember it for the invoice test in §8. ⚠️ The public invoice prints the rate rounded (`Tax (6%)`).
- [X] Day end earlier than day start (e.g. 18:00 → 09:00): ⚠️ currently accepted with no warning. Note the behaviour, then restore 09:00 → 18:00.
- [X] Toggling working days on/off highlights/unhighlights each button; saving persists the selection.
- [ ] ⚠️ **Do not save with zero working days on a shared environment** without a patient-portal session ready to observe: the portal booking page loops forever looking for working days. If you test it, open `/portal/book` as the invited patient (§5) and confirm whether the page hangs, then restore Mon–Fri immediately. comment : seems to save anyway
- [X] Saturday-only or 7-day weeks save correctly.
- [ ] **Retest (fixed):** deselecting every working day shows "Select at least one working day" and Save is refused.
- [ ] **Retest (fixed):** day end before day start (18:00 → 09:00) shows "Day must end after it starts" under "Day ends at" and Save is refused.

### 2.4 Currency

1. Change currency to `CHF`, save.

- [X] Billing page and invoice panel show `CHF`.
- [X] ⚠️ Overview stat cards still show `€` (hard-coded), and the patient profile session list shows `€`. comment : change this!
- [x] Restore `EUR`.

### 2.5 Tariff snapshot

- [X] Book an appointment (see §6), then change the default tariff to `80`. The existing appointment keeps `70`; new bookings use `80`. Restore `70` after.

---

## 3. Patient records

Go to **Patients**.

### 3.1 Create a patient: minimal

1. Click **New patient**. Enter only first name `Marie`, last name `Dupont`. Save.

- [X] Toast "Patient created", sheet closes.
- [X] Row appears immediately: "Dupont, Marie", email and phone shown as "—", "Patient since" = today in French date format.
- [X] Counter shows "1 patient in this workspace".

### 3.2 Create a patient: full

1. Create `Jean Martin` with email (use your **patient email**), phone `+33 6 12 34 56 78`, background notes spanning several lines.

- [x] Saved; email shows as a clickable `mailto:` link. 
- [ ] Multi-line background notes keep their line breaks on the profile page. comment : This page couldn’t load
Reload to try again, or go back. when i try modify patient background details. I do not see the profile page either. 
- [ ] **Retest (fixed: the row menu crashed on open):** row menu (⋯) opens; **View profile** and **Edit** both work.

### 3.3 Form validation

- [x] Empty first name → "First name is required"; empty last name → "Last name is required". Nothing is saved.
- [x] Invalid email (`jean@`) → "Invalid email address".
- [x] Cancel button closes the sheet without saving.
- [x] Double-clicking **Save patient** quickly creates only one patient.
- [x] Names with accents, apostrophes and hyphens (`Éloïse O'Brien-Lefèvre`) save and display correctly.
- [x] Very long name (80+ chars) doesn't break the table layout.
- [ ] Note: there is no date-of-birth field, although the database has one. comment: let's add it (not mandatory) + Male / female /other / pronouns
- [ ] **Retest (added):** optional Date of birth, Gender (—, Female, Male, Other) and Pronouns fields. A future date of birth is refused. The profile shows "12 May 1990 (36 y/o)" and "Female · elle"; editing pre-fills them; the GDPR export includes them.
- [ ] **Retest (added):** phone is normalised on save: `0612345678`, `06 12 34 56 78` and `+33612345678` all become `+33 6 12 34 56 78`; `+41 79 123 45 67` stays Swiss; `12345` → "Invalid phone number".

### 3.4 Create a set of test patients

Create at least 6 patients in total (useful for search, sorting and the booking combobox).

COMMENT : phone number in patients page is not normalized (sometimes spaces others not)
### 3.5 Search and sort

- [ ] Search by last name, by first name, by part of an email, by phone digits: matching rows only. Comment : failes email + phones
- [ ] Search is case-insensitive and ignores leading/trailing spaces. Comment fails leading space
- [x] No match → "No patients match your search."; footer counter updates.
- [ ] Clicking **Name**, **Email**, **Phone**, **Patient since** headers sorts ascending then descending. Comment : sorting is weird (does not alwway work, check)
- [ ] ⚠️ The search box in the top header bar ("Search patients…") does nothing. Only the search above the table works. The bell icon also does nothing. Comment remove it or make it visible in all pages.
- [ ] **Retest (fixed):** search finds email fragments and phone digits in any format (`0612`, `06 12 34`, `+33 6 12`), ignores accents, case and surrounding spaces, and matches "jean martin" or "martin jean".
- [ ] **Retest (fixed):** list starts sorted by name; headers show ↑/↓ and toggle between ascending and descending; accents sort naturally (Éloïse between Dupont and Martin); empty emails/phones always last.
- [ ] **Retest (changed):** the header search works on every dashboard page: type and press Enter → patients list filtered by that query. The bell is gone.

### 3.6 Edit a patient

1. Row menu (⋯) → **Edit**. Change phone and background notes. Save.

- [ ] Form is pre-filled with the current values.
- [ ] Toast "Patient updated"; table reflects the change.
- [ ] Clearing the email field and saving removes the email (shows "—").

### 3.7 View profile

1. Row menu → **View profile**.

- [ ] Shows name, email, phone, "Patient since <Month Year>", background notes, Documents section, Session history ("No sessions yet").
- [ ] **Back to patients** returns to the list.
- [ ] DB check: an `AuditLog` row `VIEW_PATIENT_NOTES` / `Patient` is written.
- [ ] A made-up URL `/dashboard/patients/doesnotexist` shows a 404 page, not a crash.

### 3.8 Delete a patient

Do this on a throwaway patient first, then repeat later (§11.3) on a patient who has appointments, documents and invoices.

1. Row menu → **Delete** → confirm dialog shows the patient's name → **Delete**.

- [ ] Cancel in the dialog keeps the patient.
- [ ] Confirm: toast "Patient deleted", row disappears.

---

## 4. Documents

Open **Jean Martin**'s profile.

### 4.1 Upload a PDF

1. Click **Upload document**, pick the small PDF.

- [ ] Button shows "Uploading…" with spinner, then toast "Document uploaded".
- [ ] ⚠️ The new document may **not appear in the list until you reload the page** (the list keeps its initial state). Note whether it appears on its own.
- [ ] After reload: name, size (KB/MB), today's date, PDF icon.
- [ ] DB check: `Document` row with `fileKey = documents/<workspaceId>/<patientId>/<uuid>-<name>`; `AuditLog` row `UPLOAD_DOCUMENT`.
- [ ] GCS check: object exists in the bucket at that key.

If the upload fails with "Failed to upload …", open the browser console: a CORS error means the bucket CORS rule is missing or doesn't list this origin.

### 4.2 Other file types and sizes

- [ ] JPG/PNG < 1 MB: uploads, image icon.
- [ ] `.webp`: uploads.
- [ ] 15 MB PDF: uploads.
- [ ] 17 MB PDF: rejected client-side ("exceeds the 16 MB limit"), nothing uploaded.
- [ ] 9 MB image: rejected ("Image exceeds 8 MB limit").
- [ ] `.docx`: cannot be selected in the file picker. If forced (drag/drop or "All files"), rejected with "Unsupported file type".
- [ ] `.heic` (iPhone photo): note behaviour. Likely rejected by the picker filter, which is a usability gap for phone uploads.
- [ ] File with accents/spaces in its name: uploads, displays the original name, opens correctly.
- [ ] Select 3 files at once: all three upload; toast says "3 documents uploaded".
- [ ] Upload the same file twice: two separate entries (no overwrite).

### 4.3 Open a document

- [ ] Hover a row → **Open** icon opens the file in a new tab (signed GCS URL).
- [ ] Leave the profile page open for more than 15 minutes, then click **Open**: ⚠️ link has expired (signed URLs last 15 min). Reloading the page fixes it.
- [ ] Copy the document URL, sign out, paste it in a private window: works only until it expires (expected: signed URL).
- [ ] Note: no `VIEW_DOCUMENT` audit entry is written when opening a document.

### 4.4 Share / unshare with patient

- [ ] Hover → **Share with patient**: "Shared" label appears immediately.
- [ ] Reload: still shared. DB: `sharedWithPatient = true`.
- [ ] Click again (**Unshare**): label disappears; persists after reload.
- [ ] After portal setup (§5), verify the patient sees shared documents only.

### 4.5 Delete a document

- [ ] Hover → **Delete**: spinner, toast "Document deleted", row disappears. ⚠️ No confirmation dialog: one misclick deletes permanently.
- [ ] DB: row gone, `AuditLog` `DELETE_DOCUMENT`. GCS: object gone.

### 4.6 Hover-only actions on touch devices

- [ ] On a phone/tablet, check you can reach Open / Share / Delete. ⚠️ They only appear on hover, which may make them unreachable on touch screens.

---

## 5. Patient portal invitation (practitioner side)

### 5.1 Invite a patient without email

1. Open **Marie Dupont** (no email) → **Invite to portal**.

- [ ] Error toast "Patient has no email address on file".

### 5.2 Invite Jean Martin

1. Open **Jean Martin** → **Invite to portal**.

- [ ] Toast "Invitation sent to patient's email"; button becomes "Invitation sent".
- [ ] Email received at the patient address, sender = `RESEND_FROM_EMAIL`, subject "<your name> invited you to your patient portal", button link = `<NEXT_PUBLIC_APP_URL>/portal/join/<token>`.
- [ ] Without Resend configured: the invite URL is printed in the server logs instead.
- [ ] Reload the profile: button is back to "Invite to portal" (no "pending invite" state is shown). Re-inviting invalidates the previous link.

### 5.3 Patient accepts (do this in a private window)

1. Open the invite link signed out. Sign up with the patient email.

- [ ] Join page shows the practice name, "Welcome, Jean" and the expiry date (7 days out).
- [ ] Email field is pre-filled.
- [ ] After sign-up the patient lands on `/portal/dashboard` ("Hello, Jean").
- [ ] DB check: a `PatientUser` row links the new Clerk user to Jean Martin, the invite has `usedAt` set, and **no** `Workspace` row exists for the patient's Clerk id.
- [ ] Practitioner's profile page now shows "Portal active".
- [ ] Opening the same invite link again → "Already activated".
- [ ] An old (superseded) invite link → "Invalid invitation … expired".
- [ ] Opening an invite link while signed in as Practitioner A → "Wrong account".

### 5.3b Other ways a patient can create their account

Repeat with a new patient + invite for each path. Every time the result must be: lands in the portal, `PatientUser` created, **no** `Workspace` for the patient.

- [ ] On the join page, use the "Already have an account?" sign-in box → its "Sign up" link → create the account.
- [ ] On the join page, continue with Google (if enabled in Clerk) instead of email/password.
- [ ] Patient creates an account from `/portal/sign-in` *before* opening the invite, then opens the invite link while signed in.
- [ ] Control: a brand-new practitioner signing up at `/sign-up` still gets a workspace and lands on the dashboard.

### 5.4 What the patient sees (sanity check from practitioner's perspective)

- [ ] Portal Documents page shows only documents marked **Shared**; unsharing removes them after reload.
- [ ] Portal Invoices shows only SENT / PAID / OVERDUE invoices, never DRAFT.
- [ ] Portal Appointments lists the patient's own sessions only.

---

## 6. Calendar and booking

Go to **Calendar**.

### 6.1 Week view

- [ ] Shows Monday→Sunday of the current week, today highlighted, month/year label.
- [ ] Time grid runs 08:00 → 20:00.
- [ ] **◀ / ▶** move one week; URL gets `?week=YYYY-MM-DD`; **Today** returns to the current week.
- [ ] Navigating across a month/year boundary (e.g. late December) shows correct dates.

### 6.2 Book via the button

1. **Book appointment** → pick a patient → pick a date → pick a duration → click a free start time → **Book**.

- [ ] Date defaults to today; duration defaults to 60 min (options 30, 45, 50, 60, 75, 90, 120).
- [ ] Combobox search filters by name; "No patients found." for no match.
- [ ] Only free start times are offered, in 15-minute steps, inside your working hours (Settings). A 60-min session can't start later than 1 h before the day ends.
- [ ] Times that overlap an existing session are not offered (book 10:00–11:00, reopen: 09:15–10:45 are missing, 09:00 and 11:00 are offered).
- [ ] For today, past times are not offered.
- [ ] Changing the duration updates the list; a selected time that no longer fits is deselected and **Book** is disabled.
- [ ] Changing the date shows "Checking availability…", then that day's free times.
- [ ] Summary line shows "Wed 15 Oct · 10:00–11:00" before booking.
- [ ] Clicking **Book** without a patient → "Please select a patient".
- [ ] Success: toast "Appointment booked", dialog closes, block appears on the right day and time with patient name and times, status "Scheduled" (blue).
- [ ] **Time zone:** book 14:00 and check it shows 14:00 on the calendar, the session page, the patient profile and (if invited) the patient portal.
- [ ] Header counter "N appointments this week" updates.

### 6.3 Book by clicking a slot

1. Click an empty hour cell (e.g. Wednesday 10:00).

- [ ] Dialog opens with that date and 10:00 selected.
- [ ] Close it and click another slot: the new date/time is pre-selected (not the previous one).
- [ ] Clicking a slot outside working hours (e.g. 19:00) opens with "Show all times" switched on and 19:00 selected.
- [ ] Clicking a slot that's already taken opens with no time selected.

### 6.4 Edge cases

- [ ] Double booking is refused: open the dialog in two tabs, book the same time in both. The second shows "Overlaps with <patient>'s session" and refreshes the free times.
- [ ] A cancelled or no-show session frees its slot (once cancelling exists, see 6.5).
- [ ] "Show all times" offers 07:00–21:00 for out-of-hours sessions. ⚠️ Sessions before 08:00 or after 20:00 are drawn clamped to the top/bottom edge of the grid.
- [ ] Book a 30-min, a 45-min and a 90-min session: block heights look proportional.
- [ ] Non-working day (Sunday): note "Sunday is not one of your working days", but booking is still allowed.
- [ ] Book in the past (pick yesterday's date): allowed, then it appears in "Missing notes" on the Overview.
- [ ] Day fully booked: "No free 60-minute slot within your working hours. Try “Show all times”."

### 6.5 Open / manage an appointment from the calendar

- [ ] ⚠️ Clicking an appointment block **does nothing**: there is no way to open the session from the calendar. Workaround: Overview (today/missing notes) or patient profile → Session history.
- [ ] ⚠️ There is no UI to **cancel**, mark **no-show**, **reschedule** or **delete** an appointment. Confirm and record as a gap.

### 6.6 Patient self-booking appears in the calendar

Requires §5.3 to work.

1. As the patient, go to **Book session**, pick a date and hour, confirm.

- [ ] Only working days (next 14) and hours within working hours are offered; same-day booking is not offered.
- [ ] Slots already taken by a practitioner booking are crossed out. ⚠️ Only the *start hour* of existing appointments is blocked, so a 10:30 or a 90-min booking may leave an adjacent slot looking free. Booking it should fail with "This slot is no longer available".
- [ ] Practitioner calendar shows the new appointment at the right time, using the default tariff.

---

## 7. A day of sessions: Overview and session notes

Create for today: one appointment **earlier today (already ended)**, one **later today**, and one for a patient who already has a previous completed session with notes.

### 7.1 Overview page

- [ ] **Today's Schedule** lists today's appointments in time order with status badge; cancelled ones are hidden.
- [ ] Clicking the ➜ arrow opens the session page.
- [ ] **Prep** button (scheduled only) opens "Pre-session prep" with background notes and the **previous session's notes**. ⚠️ Previous notes are stored encrypted and this dialog shows them without decrypting: check whether you see readable text or a string starting with `enc:`.
- [ ] **Missing Notes** lists past sessions without completed notes, most recent first, with "ended X ago".
- [ ] ⚠️ The "Write notes" button only appears on hover, so it can't be reached on touch devices.
- [ ] With more than 5 pending, a "View all" link appears and goes to the placeholder Clinical Notes page.
- [ ] Banner text "N sessions still need notes." matches the count; sidebar **Clinical Notes** badge shows the same number.
- [ ] Stats: Total patients, Sessions this month (completed only), Hours worked (completed only), Unpaid invoices (draft+sent+overdue), Revenue (paid this month), Missing notes.

### 7.2 Write session notes (draft)

1. Open an appointment → type notes.

- [ ] Header shows patient, full date, time range and duration in minutes, status badge.
- [ ] Patient background notes appear above the editor.
- [ ] Word counter updates while typing.
- [ ] Stop typing for ~3 seconds → indicator "Saving…" then "Saved".
- [ ] **Save draft** saves immediately.
- [ ] Reload: notes are still there.
- [ ] DB check: `sessionNotes` starts with `enc:` (encrypted at rest), `noteCompletedAt` is null.
- [ ] Paste a very long note (several pages, emojis, accents): saves and reloads intact.
- [ ] Turn the network off (devtools → Offline), type → indicator shows "Save failed". Turn it back on → next autosave succeeds.
- [ ] Type, then navigate away within 2 s: ⚠️ the last keystrokes may be lost (no "unsaved changes" warning).
- [ ] Open the same session in two tabs, edit both: last write wins. Note it.

### 7.3 Complete a session

- [ ] **Mark as completed** is disabled while the editor is empty ("Write at least a few words before completing").
- [ ] Click it: toast "Session marked as completed", green banner "Notes finalised on …", editor becomes read-only, action buttons disappear, status badge = Completed.
- [ ] Session leaves the Missing Notes list; sidebar badge decrements.
- [ ] Calendar block turns green.
- [ ] Overview "Sessions this month" and "Hours worked" increase.
- [ ] DB: `status = COMPLETED`, `noteCompletedAt` set; `AuditLog` `COMPLETE_SESSION`.
- [ ] **Invoice** panel appears below the notes.

### 7.4 Reopen a session

- [ ] **Reopen** → toast "Session reopened", editor editable again, status back to Scheduled.
- [ ] ⚠️ If the session already has an invoice, reopening hides the invoice panel (only shown when Completed), and the session counts again as missing notes.
- [ ] Edit and complete again: new finalised timestamp.
- [ ] DB: `AuditLog` `REOPEN_SESSION`.

### 7.5 Access control

- [ ] `/dashboard/appointments/doesnotexist` → 404.
- [ ] DB: each visit to a session page writes `VIEW_PATIENT_NOTES` / `Appointment`.

---

## 8. Invoicing a session

On a **completed** session.

### 8.1 Generate an invoice

1. Invoice panel → **Generate invoice**.

- [ ] Toast "Invoice created".
- [ ] ⚠️ The panel may keep showing "Generate invoice" until you reload. Clicking it again then gives "Invoice already exists". Note it.
- [ ] After reload: invoice number `INV-<year>-0001`, total, status **Draft**, **View** button.
- [ ] Amounts: tariff 70, tax 0 → total 70.00. Repeat with tax 5.5 % on a new session booked *after* changing the setting: amount 70.00, tax 3.85, total 73.85.

### 8.2 Public invoice page

1. Click **View**.

- [ ] Opens `/invoice/<token>` in a new tab, readable while signed out.
- [ ] Shows practice name, invoice number, bill-to name and email, issue date, due date (+30 days), session date, line "Therapy session — <date>", tax line only if tax > 0, total, status "Payment pending".
- [ ] ⚠️ **Confirmed blocker:** the page currently returns a 500 error (print button `onClick` on a server component). Retest once fixed: the page loads and "Print / Save as PDF" opens the print dialog.
- [ ] Print preview hides the button and the card shadow.
- [ ] ⚠️ The invoice has no practitioner address, professional ID (SIRET/ADELI/RPPS) or legal mentions, which French invoices require. Record as a compliance gap.
- [ ] Random token `/invoice/abc` → 404.

### 8.3 Invoice numbering

- [ ] Second invoice → `INV-<year>-0002`, etc.
- [ ] ⚠️ Practitioner B's first invoice will also try to use `INV-<year>-0001`, which is already taken globally. Expect an error when B generates their first invoice (see §11.2).
- [ ] ⚠️ After deleting a patient who had invoices (§11.3), the next generated number may collide with an existing one and fail.

### 8.4 Not allowed

- [ ] Scheduled (not completed) session: no invoice panel.
- [ ] No way to edit an invoice amount, add notes, or create an invoice not linked to a session. Record whether that's acceptable.

---

## 9. Billing

Go to **Billing**. Have at least 4 invoices.

### 9.1 List and stats

- [ ] Table lists invoices newest first: number, patient "Last, First", amount + currency, due date, status badge.
- [ ] Stat cards: Total invoices, Revenue collected (PAID), Outstanding (DRAFT + SENT), Overdue (red when > 0).
- [ ] ⚠️ Only the 50 most recent invoices are shown, with no pagination.

### 9.2 Status workflow

- [ ] DRAFT row → **Sent** → badge becomes SENT; stats unchanged (still outstanding). ⚠️ No email is sent to the patient: "Sent" only changes the status. The patient must receive the link another way (or see it in the portal).
- [ ] SENT row → **Paid** → badge PAID, Revenue increases, Outstanding decreases.
- [ ] PAID row: no action buttons. ⚠️ No way to undo "Paid" if clicked by mistake.
- [ ] Public invoice page of a paid invoice shows "Paid on <date>" in green.
- [ ] Overview "Revenue (received this month)" includes it.
- [ ] Patient portal: invoice appears once SENT, shows "paid <date>" once PAID.
- [ ] External-link icon opens the public invoice.

---

## 10. Overdue invoices and reminders (dunning job)

Needs one invoice in SENT status with a past due date. Set it in the DB: `UPDATE "Invoice" SET "dueDate" = now() - interval '1 day' WHERE ...`.

### 10.1 Trigger the job

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" <app-url>/api/cron/dunning
```

- [ ] Without the header (or with a wrong secret) → `401 Unauthorized`.
- [ ] With the header → `200` JSON `{ marked, remindersSent }`.
- [ ] Invoice is now OVERDUE: red badge in Billing, red "Overdue" stat card, "Payment overdue" on public page.
- [ ] Reminder email received by the patient: invoice number, amount, currency, due date (DD/MM/YYYY), working "View invoice" link.
- [ ] Patient without email: invoice still marked OVERDUE, no email, not counted in `remindersSent`.
- [ ] Run the job again immediately: no second email (7-day cooldown). DB: `reminderSentAt` unchanged.
- [ ] Set `reminderSentAt` 8 days in the past, run again → a new reminder is sent.
- [ ] Overdue → **Paid** in Billing works; no further reminders.
- [ ] Note: `marked` in the response is the number of invoices *selected for reminders*, not the number newly marked overdue.

### 10.2 Scheduler (GCP)

- [ ] Cloud Scheduler job `psy-app-dunning` exists, runs daily at 08:00 **Europe/Paris** (check the job's time zone, which defaults to UTC if `--time-zone` was omitted), and sends the `Authorization` header.
- [ ] "Force run" from the console gives a 200 in the job's logs.

---

## 11. Data protection, isolation and deletion

### 11.1 GDPR export

1. Settings → **Export patient data (JSON)**.

- [ ] Downloads `patients-export-YYYY-MM-DD.json`.
- [ ] Contains every patient with contact info, background notes, appointments (no session notes) and invoices.
- [ ] File contains no `enc:` strings and no session note content.
- [ ] DB: `AuditLog` `EXPORT_PATIENT_DATA` with `metadata.count`.
- [ ] Note: the export doesn't include documents, so this may not satisfy a single patient's access request. There is also no per-patient export.

### 11.2 Two practitioners never see each other's data

Sign up **Practitioner B** in another browser/profile.

- [ ] B's dashboard, patients, calendar, billing are empty.
- [ ] Copy a patient profile URL, session URL and document link from A; open them as B → 404 for profile/session pages.
- [ ] B creates a patient + completed session + invoice. ⚠️ Generating B's first invoice likely fails ("Failed"/server error) because invoice numbers are unique across all practitioners.
- [ ] A still sees only A's data afterwards.

### 11.3 Delete a patient with history

Delete a patient who has appointments, notes, documents and invoices.

- [ ] Confirmation dialog warns "all associated records".
- [ ] Patient, appointments and documents disappear from every page (calendar, overview, billing).
- [ ] ⚠️ **Invoices are deleted too.** Revenue and billing history change retroactively, which is a problem for accounting. Record it.
- [ ] ⚠️ GCS: the patient's files are **not** deleted from the bucket (orphaned objects containing health data).
- [ ] Generate a new invoice for another patient afterwards: ⚠️ check for an invoice-number collision.

### 11.4 Audit trail

- [ ] DB: `AuditLog` contains entries for patient views, session views, completes, reopens, uploads, deletes and export, with the right user id and timestamps.
- [ ] Note: there's no screen to view the audit log.

### 11.5 A patient account must not reach the practitioner dashboard

As the portal patient (§5.3), visit `/dashboard`.

- [ ] Redirected to `/portal/dashboard` (also for `/dashboard/patients`, `/dashboard/billing`, etc.).

---

## 12. Cross-cutting checks

### 12.1 Mobile / small screens

On a phone (or 375 px wide):

- [ ] Sidebar collapses into a menu (trigger in the header) and opens/closes correctly.
- [ ] Patients table scrolls horizontally rather than overflowing.
- [ ] Calendar week grid is usable (or at least readable).
- [ ] Booking dialog, patient sheet, and settings form fit the screen.
- [ ] Session note editor is comfortable to type in.
- [ ] Hover-only buttons (documents, missing notes) are reachable. ⚠️ Expected to fail, see §4.6 and §7.1.

### 12.2 Dark mode

- [ ] With the OS in dark mode, all pages are readable (badges, banners, calendar blocks, stat cards).
- [ ] ⚠️ The public invoice page is always light (intended for printing). Fine, just confirm.

### 12.3 Language and formats

- [ ] UI text is English, while "Patient since" uses French date format: confirm this mix is acceptable.
- [ ] Dates on invoices and emails are unambiguous for French patients.

### 12.4 Time zones

Run once on the deployed (UTC) environment from a browser in Europe/Paris:

- [ ] A booking made for 14:00 shows 14:00 everywhere (calendar, session page, patient portal, invoice session date).
- [ ] "Today's schedule" contains exactly today's appointments around midnight (test at ~00:30 and ~23:30 local if possible).
- [ ] Patient self-booking at 09:00 lands at 09:00 in the practitioner's calendar.
- [ ] Week view on a DST change week (last Sunday of March / October) shows sessions at the right hours.

### 12.5 Robustness

- [ ] Browser back/forward between pages doesn't show stale data after an action (e.g. completed session still listed as missing).
- [ ] Two quick clicks on any action button (complete, generate invoice, mark paid) don't create duplicates or errors.
- [ ] Slow network (devtools "Slow 3G"): buttons show spinners and stay disabled while pending.
- [ ] Cold start on Cloud Run (first request after idle): first page loads within a reasonable time and doesn't error.
- [ ] Server logs (Cloud Run → Logs) show no unexpected errors after the full run.

---

## Suspected issues

Found by reading the code while writing this plan, then verified on 2026-10-15. **Confirmed** = proven by a runtime test or by unambiguous code. **Likely** = depends on the device or browser, confirm during the run. Sorted by severity.

| # | Severity | Area | Issue | Verified | Scenario |
|---|---|---|---|---|---|
| 1 | 🔴 Blocker | Public invoice | The page crashes with **HTTP 500** ("Event handlers cannot be passed to Client Component props") because the print button's `onClick` is on a server component. Every invoice link is broken: billing, invoice panel, patient portal and reminder emails. | ✅ Fixed — retest | 8.2, 10.1 |
| 2 | 🔴 Blocker | Portal / sign-up | Clerk `user.created` creates a practitioner workspace for **every** new account. An invited patient either sees "Wrong account" or gets linked, then is redirected from `/portal/*` to their own empty practitioner `/dashboard`. The portal is unusable. | ✅ Fixed — retest (invite sign-up now tags the account as a patient) | 5.3 |
| 3 | 🔴 Blocker | Time zones | The server parses booking times in its own time zone. On Cloud Run (UTC), a practitioner booking for 14:00 is stored as 16:00 Paris time, and a patient booking for 09:00 lands at 11:00. Server-rendered pages (session page, profile, portal) and client-rendered ones (calendar) will also show **different** times for the same session. "Today" and the greeting use UTC. | ✅ Fixed — retest (server defaults to Europe/Paris; booking form sends exact timestamps) | 6.2, 6.6, 12.4 |
| 4 | 🟠 Major | Invoices | `invoiceNumber` has a global unique index, but numbers are counted per practitioner. The second practitioner's first invoice fails. Deleting a patient cascades their invoices, so the count drops and the next number collides. | Confirmed (unique index in init migration) | 8.3, 11.2, 11.3 |
| 5 | 🟠 Major | Calendar | Appointment blocks have no click handler. `updateAppointmentStatus` exists but no UI calls it, so there's no way to cancel, mark no-show, reschedule or delete. | Confirmed (code) | 6.5 |
| 6 | 🟠 Major | Pre-session prep | Previous session notes are passed to the dialog without `decrypt()`, so the practitioner sees `enc:…`. | Confirmed (code) | 7.1 |
| 7 | 🟠 Major | Patient deletion | Cascades to invoices (accounting history lost) and never deletes the patient's GCS files (orphaned health data). | Confirmed (`ON DELETE CASCADE`; `deletePatient` doesn't call GCS) | 11.3 |
| 8 | 🟠 Major | Settings | Saving zero working days makes `/portal/book` loop forever (page hangs, server CPU pinned). End hour before start hour is accepted. | ✅ Fixed — retest (both rejected at save; portal loop bounded) | 2.3 |
| 9 | 🟠 Major | Touch devices | Tailwind v4 only applies `group-hover` on devices that support hover, so on phones/tablets the document actions and "Write notes" stay **invisible but tappable**. You can delete a document by tapping an empty-looking area. | Likely (confirm on a real phone) | 4.6, 7.1 |
| 10 | 🟡 Minor | Invoice panel | Keeps its initial state after "Generate invoice", so the button stays until reload and a second click gives "Invoice already exists". | Confirmed (code) | 8.1 |
| 11 | 🟡 Minor | Documents | List keeps its initial state, so new uploads only appear after a reload. Success toast fires before the database record is saved. | Confirmed (code) | 4.1 |
| 12 | 🟡 Minor | Access control | Dashboard only checks "signed in", not "is a practitioner". Hidden today by #2 (everyone gets a workspace), but it becomes real once #2 is fixed. | ✅ Fixed — retest (patients are redirected to the portal) | 11.5 |
| 13 | 🟡 Minor | Calendar | No overlap check for practitioner bookings; sessions outside 08:00–20:00 are drawn clamped to the edges. | ✅ Overlaps fixed (new booking flow) — clamping remains | 6.4 |
| 14 | 🟡 Minor | Portal booking | Availability only blocks the start hour of existing appointments, so a free-looking slot can fail with "no longer available". | Confirmed (code) | 6.6 |
| 15 | 🟡 Minor | Session reopen | Sets status back to Scheduled, which hides the invoice panel of an invoiced session. | Confirmed (code) | 7.4 |
| 16 | 🟡 Minor | Currency | `€` hard-coded on Overview stats and patient session history. | ✅ Fixed — retest | 2.4 |
| 17 | 🟡 Minor | Documents | Delete has no confirmation; signed links expire after 15 min on an open page. | Confirmed (code) | 4.3, 4.5 |
| 18 | 🟡 Minor | Billing | "Mark sent" sends no email; "Paid" can't be undone; list capped at 50 rows. | Confirmed (code) | 9.1, 9.2 |
| 19 | 🟡 Minor | Invoice content | No practitioner address / professional ID / legal mentions; tax rate printed rounded (5.5 % → "6%"). | Confirmed (code) | 8.2, 2.3 |
| 20 | ⚪ Cosmetic | Header | Header search box and notification bell do nothing. | ✅ Fixed — search works from every page, bell removed | 3.5 |
| 21 | ⚪ Cosmetic | Notes page | Clinical Notes is a placeholder, but the sidebar badge and "View all" point to it. | Confirmed (code) | 1.4, 7.1 |
| 22 | ⚪ Cosmetic | Practice name | Can't be changed after sign-up. | Confirmed (code) | 1.3 |
