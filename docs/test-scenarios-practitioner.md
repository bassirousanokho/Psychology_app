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
- [x] **Retest (fixed):** deselecting every working day shows "Select at least one working day" and Save is refused.
- [x] **Retest (fixed):** day end before day start (18:00 → 09:00) shows "Day must end after it starts" under "Day ends at" and Save is refused.

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
- [x] Multi-line background notes keep their line breaks on the profile page. comment : This page couldn’t load
Reload to try again, or go back. when i try modify patient background details. I do not see the profile page either. 
- [X] **Retest (fixed: the row menu crashed on open):** row menu (⋯) opens; **View profile** and **Edit** both work.

### 3.3 Form validation

- [x] Empty first name → "First name is required"; empty last name → "Last name is required". Nothing is saved.
- [x] Invalid email (`jean@`) → "Invalid email address".
- [x] Cancel button closes the sheet without saving.
- [x] Double-clicking **Save patient** quickly creates only one patient.
- [x] Names with accents, apostrophes and hyphens (`Éloïse O'Brien-Lefèvre`) save and display correctly.
- [x] Very long name (80+ chars) doesn't break the table layout.
- [x] Note: there is no date-of-birth field, although the database has one. comment: let's add it (not mandatory) + Male / female /other / pronouns
- [x] **Retest (added):** optional Date of birth, Gender (—, Female, Male, Other) and Pronouns fields. A future date of birth is refused. The profile shows "12 May 1990 (36 y/o)" and "Female · elle"; editing pre-fills them; the GDPR export includes them.
- [x] **Retest (added):** phone is normalised on save: `0612345678`, `06 12 34 56 78` and `+33612345678` all become `+33 6 12 34 56 78`; `+41 79 123 45 67` stays Swiss; `12345` → "Invalid phone number".

### 3.4 Create a set of test patients

Create at least 6 patients in total (useful for search, sorting and the booking combobox).

COMMENT : phone number in patients page is not normalized (sometimes spaces others not)
### 3.5 Search and sort

- [x] Search by last name, by first name, by part of an email, by phone digits: matching rows only. Comment : failes email + phones
- [x] Search is case-insensitive and ignores leading/trailing spaces. Comment fails leading space
- [x] No match → "No patients match your search."; footer counter updates.
- [x] Clicking **Name**, **Email**, **Phone**, **Patient since** headers sorts ascending then descending. Comment : sorting is weird (does not alwway work, check)
- [x] ⚠️ The search box in the top header bar ("Search patients…") does nothing. Only the search above the table works. The bell icon also does nothing. Comment remove it or make it visible in all pages.
- [x] **Retest (fixed):** search finds email fragments and phone digits in any format (`0612`, `06 12 34`, `+33 6 12`), ignores accents, case and surrounding spaces, and matches "jean martin" or "martin jean".
- [x] **Retest (fixed):** list starts sorted by name; headers show ↑/↓ and toggle between ascending and descending; accents sort naturally (Éloïse between Dupont and Martin); empty emails/phones always last.
- [x] **Retest (changed):** the header search works on every dashboard page: type and press Enter → patients list filtered by that query. The bell is gone.

### 3.6 Edit a patient

1. Row menu (⋯) → **Edit**. Change phone and background notes. Save.

- [x] Form is pre-filled with the current values.
- [x] Toast "Patient updated"; table reflects the change.
- [x] Clearing the email field and saving removes the email (shows "—").

### 3.7 View profile

1. Row menu → **View profile**.

- [x] Shows name, email, phone, "Patient since <Month Year>", background notes, Documents section, Session history ("No sessions yet").
- [x] **Back to patients** returns to the list.
- [x] DB check: an `AuditLog` row `VIEW_PATIENT_NOTES` / `Patient` is written.
- [x] A made-up URL `/dashboard/patients/doesnotexist` shows a 404 page, not a crash.

### 3.8 Delete a patient

Do this on a throwaway patient first, then repeat later (§11.3) on a patient who has appointments, documents and invoices.

1. Row menu → **Delete** → confirm dialog shows the patient's name → **Delete**.

- [x] Cancel in the dialog keeps the patient.
- [x] Confirm: toast "Patient deleted", row disappears.
COMMENT: MAKE SURE IT IS NOT EXACTLY DELETED FROM THE DB but migrated until cleared.
- [ ] **Retest (changed: soft delete):** Delete moves the patient to **Recently deleted (n)** (link next to "New patient"). They disappear from the list, the booking combobox and the patient count; their upcoming sessions become Cancelled; past sessions and invoices stay. DB: `Patient.deletedAt` set, row still present.
- [ ] Opening a deleted patient's profile shows the "This patient was deleted on …" banner, history read-only, no upload/invite buttons.
- [ ] **Restore** brings the patient back to the list (cancelled sessions stay cancelled).
- [ ] **Delete permanently** asks for confirmation, then erases the patient, sessions, notes and documents (GCS files removed too). Disabled with a tooltip when the patient has invoices (kept 10 years).
- [ ] A deleted patient with portal access lands on "no access" in the portal; their pending invite link shows "Invalid invitation".

---

## 4. Documents

Open **Jean Martin**'s profile.

### 4.1 Upload a PDF

1. Click **Upload document**, pick the small PDF.

- [x] Button shows "Uploading…" with spinner, then toast "Document uploaded".
- [ ] ⚠️ The new document may **not appear in the list until you reload the page** (the list keeps its initial state). Note whether it appears on its own. COmment it does not appear.
- [ ] **Retest (fixed):** the new document appears in the list right after upload, without reloading; the success toast only shows once it's saved.
- [x] After reload: name, size (KB/MB), today's date, PDF icon.
- [x] DB check: `Document` row with `fileKey = documents/<workspaceId>/<patientId>/<uuid>-<name>`; `AuditLog` row `UPLOAD_DOCUMENT`.
- [ ] GCS check: object exists in the bucket at that key.

If the upload fails with "Failed to upload …", open the browser console: a CORS error means the bucket CORS rule is missing or doesn't list this origin.

### 4.2 Other file types and sizes

- [x] JPG/PNG < 1 MB: uploads, image icon.
- [x] `.webp`: uploads.
- [x] 15 MB PDF: uploads.
- [x] 17 MB PDF: rejected client-side ("exceeds the 16 MB limit"), nothing uploaded.
- [x] 9 MB image: rejected ("Image exceeds 8 MB limit").
- [x] `.docx`: cannot be selected in the file picker. If forced (drag/drop or "All files"), rejected with "Unsupported file type".
- [x] `.heic` (iPhone photo): note behaviour. Likely rejected by the picker filter, which is a usability gap for phone uploads.
- [x] File with accents/spaces in its name: uploads, displays the original name, opens correctly.
- [x] Select 3 files at once: all three upload; toast says "3 documents uploaded".
- [x] Upload the same file twice: two separate entries (no overwrite).

### 4.3 Open a document

- [x] Hover a row → **Open** icon opens the file in a new tab (signed GCS URL).
- [X] Leave the profile page open for more than 15 minutes, then click **Open**: ⚠️ link has expired (signed URLs last 15 min). Reloading the page fixes it. Comment : Tell the user to reaload maybe? 
- [ ] **Retest (fixed: links never expire):** leave the profile open > 15 min, click **Open**: the document still opens (each click gets a fresh link). DB: an `AuditLog` `VIEW_DOCUMENT` row is written per open.
- [X] Copy the document URL, sign out, paste it in a private window: works only until it expires (expected: signed URL).
- [X] Note: no `VIEW_DOCUMENT` audit entry is written when opening a document.

### 4.4 Share / unshare with patient

- [x] Hover → **Share with patient**: "Shared" label appears immediately.
- [x] Reload: still shared. DB: `sharedWithPatient = true`.
- [x] Click again (**Unshare**): label disappears; persists after reload.
- [ ] After portal setup (§5), verify the patient sees shared documents only.

### 4.5 Delete a document

- [ ] Hover → **Delete**: spinner, toast "Document deleted", row disappears. ⚠️ No confirmation dialog: one misclick deletes permanently. Comment : add a confirmation.
- [ ] **Retest (fixed):** Delete asks "Delete document?" (mentions the patient portal if shared); Cancel keeps it.
- [X] DB: row gone, `AuditLog` `DELETE_DOCUMENT`. GCS: object gone.

### 4.6 Hover-only actions on touch devices

- [ ] On a phone/tablet, Open / Share / Delete are always visible (fixed: they were hover-only); with a mouse they appear on hover or keyboard focus.

---

## 5. Patient portal invitation (practitioner side)

### 5.1 Invite a patient without email

1. Open **Marie Dupont** (no email) → **Invite to portal**.

- [ ] Error toast "Patient has no email address on file".

### 5.2 Invite Jean Martin

1. Open **Jean Martin** → **Invite to portal**.

- [x] Toast "Invitation sent to patient's email"; button becomes "Invitation sent".
- [X] Email received at the patient address, sender = `RESEND_FROM_EMAIL`, subject "<your name> invited you to your patient portal", button link = `<NEXT_PUBLIC_APP_URL>/portal/join/<token>`.
- [X] Without Resend configured: the invite URL is printed in the server logs instead.
- [X] Reload the profile: button is back to "Invite to portal" (no "pending invite" state is shown). Re-inviting invalidates the previous link.

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

- [x] Shows Monday→Sunday of the current week, today highlighted, month/year label.
- [X] Time grid runs 08:00 → 20:00.
- [X] **◀ / ▶** move one week; URL gets `?week=YYYY-MM-DD`; **Today** returns to the current week.
- [X] Navigating across a month/year boundary (e.g. late December) shows correct dates.

### 6.2 Book via the button

1. **Book appointment** → pick a patient → pick a date → pick a duration → click a free start time → **Book**.

- [X] Date defaults to today; duration defaults to 60 min (options 30, 45, 50, 60, 75, 90, 120).
- [x] Combobox search filters by name; "No patients found." for no match.
- [x] Only free start times are offered, in 15-minute steps, inside your working hours (Settings). A 60-min session can't start later than 1 h before the day ends.
- [x] Times that overlap an existing session are not offered (book 10:00–11:00, reopen: 09:15–10:45 are missing, 09:00 and 11:00 are offered).
- [x] For today, past times are not offered.
- [X] Changing the duration updates the list; a selected time that no longer fits is deselected and **Book** is disabled.
- [X] Changing the date shows "Checking availability…", then that day's free times.
- [X] Summary line shows "Wed 15 Oct · 10:00–11:00" before booking.
- [X] Clicking **Book** without a patient → "Please select a patient".
- [X] Success: toast "Appointment booked", dialog closes, block appears on the right day and time with patient name and times, status "Scheduled" (blue).
- [X] **Time zone:** book 14:00 and check it shows 14:00 on the calendar, the session page, the patient profile and (if invited) the patient portal.
- [X] Header counter "N appointments this week" updates.

### 6.3 Book by clicking a slot

1. Click an empty hour cell (e.g. Wednesday 10:00).

- [x] Dialog opens with that date and 10:00 selected.
- [x] Close it and click another slot: the new date/time is pre-selected (not the previous one).
- [x] Clicking a slot outside working hours (e.g. 19:00) opens with "Show all times" switched on and 19:00 selected.
- [ ] Clicking a slot that's already taken opens with no time selected. Comment: cannot click on a slot that's taken. Add something the possibiliity to modify an appointment from the calendar.
- [ ] **Retest (added):** clicking a session on the calendar opens its panel: patient, date, time, duration, status.
- [ ] **Open session notes** goes to the session page.
- [ ] **Reschedule** (scheduled only): same picker as booking, current date/duration/time pre-selected, its own slot counts as free; **Move session** updates the calendar; **Back** returns to the panel. Moving onto another session is refused.
- [ ] **Cancel session** asks for confirmation; the block turns grey and struck through; the slot is offered again for booking.
- [ ] **Mark as no-show** only appears once the session has started; block turns red and struck through.
- [ ] **Restore as scheduled** on a cancelled/no-show session works if the slot is still free, otherwise says who took it.
- [ ] **Delete (booked by mistake)** works for an empty session; refused with "Cancel it instead" if it has notes, an invoice or documents.
- [ ] Completed sessions only offer **Open session notes** (changes go through Reopen on the session page).

### 6.4 Edge cases

- [x] Double booking is refused: open the dialog in two tabs, book the same time in both. The second shows "Overlaps with <patient>'s session" and refreshes the free times.
- [ ] A cancelled or no-show session frees its slot (once cancelling exists, see 6.5).
- [ ] "Show all times" offers 07:00–21:00 for out-of-hours sessions. ⚠️ Sessions before 08:00 or after 20:00 are drawn clamped to the top/bottom edge of the grid.
- [ ] Book a 30-min, a 45-min and a 90-min session: block heights look proportional.
- [ ] Non-working day (Sunday): note "Sunday is not one of your working days", but booking is still allowed.
- [ ] Book in the past (pick yesterday's date): allowed, then it appears in "Missing notes" on the Overview.
- [ ] Day fully booked: "No free 60-minute slot within your working hours. Try “Show all times”."

### 6.5 Open / manage an appointment from the calendar

- [ ] Covered by the retest lines in §6.3 (session panel: open, reschedule, cancel, no-show, restore, delete).

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
- [ ] **Prep** button (scheduled only) opens "Pre-session prep" with background notes and the **previous session's notes** as readable text (fixed: they were shown encrypted, `enc:…`).
- [ ] **Missing Notes** lists past sessions without completed notes, most recent first, with "ended X ago".
- [ ] On a phone/tablet the "Write notes" button is always visible (fixed: it was hover-only); with a mouse it appears on hover.
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
- [ ] Reopening an **invoiced** session keeps it Completed and the invoice panel stays visible (fixed). It counts as missing notes until completed again.
- [ ] Reopening a session **without** an invoice puts it back to Scheduled (so a session completed by mistake can be cancelled from the calendar).
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
- [ ] The panel shows the new invoice immediately, without reloading (fixed).
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
- [ ] Numbering is per practitioner: Practitioner B's first invoice is also `INV-<year>-0001` and generates without error (fixed, see §11.2).
- [ ] Numbers never repeat or skip, including after deleting a patient (deleted patients keep their invoices).

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
- [ ] B creates a patient + completed session + invoice: B's first invoice is `INV-<year>-0001` and generates fine.
- [ ] A still sees only A's data afterwards.

### 11.3 Delete a patient with history

Delete a patient who has appointments, notes, documents and invoices.

- [ ] Confirmation dialog warns "all associated records".
- [ ] Patient, appointments and documents disappear from every page (calendar, overview, billing).
- [ ] ⚠️ **Invoices are deleted too.** Revenue and billing history change retroactively, which is a problem for accounting. Record it.
- [ ] ⚠️ GCS: the patient's files are **not** deleted from the bucket (orphaned objects containing health data).
- [ ] Generate a new invoice for another patient afterwards: next number in sequence, no error.

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

## 13. Practice features (batch of 2026-10-20)

### 13.1 Patient file: emergency contact, family doctor

- [ ] New/edit patient form has **Emergency contact** (full name, relationship, phone) and **Family doctor** (full name, phone), all optional. Phones are normalised like the patient's (`0612345678` → `+33 6 12 34 56 78`); an invalid phone is refused.
- [ ] Profile shows both cards; phone numbers are clickable (`tel:`). Cards are hidden when nothing is filled in.
- [ ] GDPR export includes `emergencyContact` and `familyDoctor`.

### 13.2 Rates per patient and rate changes

- [ ] Patient form: **Individual session rate**, empty = practice rate (placeholder shows it). Booking a therapy session uses the individual rate.
- [ ] Settings → **Change rate…**: patients on the practice rate are pre-selected, each with their current rate; All/None links work; date defaults to the 1st of next month.
- [ ] Confirm: the practice rate changes for **new** patients; selected patients get the new rate from the date; **unselected patients keep their current rate** (even if they were on the practice rate).
- [ ] Book a session for a selected patient before the date → old price; on/after the date → new price. A session booked **before** the change keeps its old price.
- [ ] Profile → **Session rate** card: today's rate, the change (old → new, date), "Patient not informed yet"; **Schedule rate change** (amount + date) works per patient; an upcoming change can be cancelled (✕).
- [ ] Overview → **Reminders** → "Rate changes to announce" lists each uninformed change (red "since …" once the date has passed); **Mark informed** removes it there and shows "Patient informed" on the profile.

### 13.3 Session types and hourly work

- [ ] Settings: **Administrative work** and **Report writing** hourly rates save.
- [ ] Booking dialog: type selector (Psychotherapy / Administrative work / Report writing). For hourly types: "Time spent" in 30-min steps (30 min … 8 h), the summary shows the price (rate × time), all start times are offered (including over other sessions and in the past).
- [ ] Hourly work can overlap a therapy session and other hourly work; a therapy session still can't overlap another therapy session (but can overlap hourly work).
- [ ] Calendar: violet = admin, amber = writing, blue = psychotherapy (legend in the toolbar); overlapping items sit side by side.
- [ ] Session page of hourly work: type and hourly rate shown; **Time spent** selector changes the end time and price until invoiced; **Mark as completed** works without typed notes.
- [ ] Hourly work doesn't appear in "Missing notes" or the sidebar badge.
- [ ] Invoice line: "Administrative work — 20 October 2026 (1 h 30)".
- [ ] Patient portal: hourly items show their type; patient self-booking is never blocked by hourly work.

### 13.4 Drag and drop in the calendar

- [ ] Drag a scheduled session to another time/day: a dashed preview with the start time follows (15-min snap); on drop it moves ("Moved to …") and stays after reload.
- [ ] Dropping a therapy session onto another therapy session is refused ("Overlaps with …") and the block jumps back.
- [ ] Hourly work can be dropped anywhere, including over sessions; completed (uninvoiced) hourly work can also be moved.
- [ ] Completed therapy sessions, cancelled sessions and invoiced items can't be dragged (normal cursor); clicking still opens the panel.
- [ ] Dropping outside the grid cancels the drag (no leftover preview).

### 13.5 Cancellations: fee, tracking, alerts

- [ ] Session panel → **Cancel session**: shows how long before the session it is and your notice period ("inside the notice period" when relevant); **Charge a cancellation fee** is ticked by default with the session price, editable; unticking cancels without fee.
- [ ] Cancelled with fee: session page shows "Cancelled on … · cancellation fee 70.00 EUR" and the invoice panel; the invoice line reads "Cancellation fee — session of …".
- [ ] Cancelled without fee: "· no fee", no invoice panel.
- [ ] Hourly work cancels without a fee option.
- [ ] Settings → **Cancellations**: notice period (hours) and alert threshold (per 30 days) save.
- [ ] Profile → **Cancellations**: last 30 days, this month, last 12 months (with fee count), no-shows, and a by-month list. Session history shows "cancellation fee …" / "cancelled without fee".
- [ ] Cancel N sessions for one patient (N = threshold): the profile card turns amber with "N in the last 30 days", and Overview → Reminders → "Frequent cancellations" lists the patient.
- [ ] **Restore as scheduled** clears the cancellation (no longer counted).

### 13.6 Payment at the session, receipts

- [ ] New invoices are due on the **session date**.
- [ ] Session page → **Invoice & payment**: **Mark as paid** works with or without an existing invoice (creates it, status Paid, nothing sent); **Generate invoice** still creates a draft.
- [ ] Billing: **Paid** is available on drafts too.
- [ ] Paid invoice: **Send receipt** emails the patient (or logs the link without Resend); "Receipt sent …" appears; the button becomes "Send receipt again". Disabled with a hint when the patient has no email.
- [ ] Billing: paid rows have a **Receipt** button (tooltip shows the last sent date).
- [ ] Public page of a paid invoice is titled **Receipt** and shows "Paid on …". The tax rate shows exactly (5,5 %, not 6%).

### 13.7 Session notes as files

- [ ] Session page → **Note files** → **Upload note** (PDF/image): the file appears labelled "Session note"; it has no share button and never appears in the patient portal.
- [ ] A therapy session with an uploaded note and no typed text can be **Mark as completed**.
- [ ] Note files also appear in the patient's Documents list, labelled "Session note".

### 13.8 Notes after deleting a patient

- [ ] Delete a patient who has session notes: their profile (from Recently deleted or a direct link) lists all sessions; each opens with a "deleted on …" banner and the notes readable.

### 13.9 Retention reminders

- [ ] Settings → **Data retention**: years (default 5) saves.
- [ ] Overview → Reminders lists active patients with no session for that long ("consider deleting") and patients in Recently deleted for that long ("delete permanently", link to Recently deleted). Test by setting the value to 1 and using old data, or adjusting dates in the DB.

---

## Suspected issues

Found by reading the code while writing this plan, then verified on 2026-10-15. **Confirmed** = proven by a runtime test or by unambiguous code. **Likely** = depends on the device or browser, confirm during the run. Sorted by severity.

| # | Severity | Area | Issue | Verified | Scenario |
|---|---|---|---|---|---|
| 1 | 🔴 Blocker | Public invoice | The page crashes with **HTTP 500** ("Event handlers cannot be passed to Client Component props") because the print button's `onClick` is on a server component. Every invoice link is broken: billing, invoice panel, patient portal and reminder emails. | ✅ Fixed — retest | 8.2, 10.1 |
| 2 | 🔴 Blocker | Portal / sign-up | Clerk `user.created` creates a practitioner workspace for **every** new account. An invited patient either sees "Wrong account" or gets linked, then is redirected from `/portal/*` to their own empty practitioner `/dashboard`. The portal is unusable. | ✅ Fixed — retest (invite sign-up now tags the account as a patient) | 5.3 |
| 3 | 🔴 Blocker | Time zones | The server parses booking times in its own time zone. On Cloud Run (UTC), a practitioner booking for 14:00 is stored as 16:00 Paris time, and a patient booking for 09:00 lands at 11:00. Server-rendered pages (session page, profile, portal) and client-rendered ones (calendar) will also show **different** times for the same session. "Today" and the greeting use UTC. | ✅ Fixed — retest (server defaults to Europe/Paris; booking form sends exact timestamps) | 6.2, 6.6, 12.4 |
| 4 | 🟠 Major | Invoices | `invoiceNumber` has a global unique index, but numbers are counted per practitioner. The second practitioner's first invoice fails. Deleting a patient cascades their invoices, so the count drops and the next number collides. | ✅ Fixed — numbering per practitioner, never reuses a number | 8.3, 11.2, 11.3 |
| 5 | 🟠 Major | Calendar | Appointment blocks have no click handler. `updateAppointmentStatus` exists but no UI calls it, so there's no way to cancel, mark no-show, reschedule or delete. | ✅ Fixed — session panel on click | 6.3 |
| 6 | 🟠 Major | Pre-session prep | Previous session notes are passed to the dialog without `decrypt()`, so the practitioner sees `enc:…`. | ✅ Fixed — retest | 7.1 |
| 7 | 🟠 Major | Patient deletion | Cascades to invoices (accounting history lost) and never deletes the patient's GCS files (orphaned health data). | ✅ Fixed — soft delete; permanent delete removes files and is refused while invoices exist | 3.8, 11.3 |
| 8 | 🟠 Major | Settings | Saving zero working days makes `/portal/book` loop forever (page hangs, server CPU pinned). End hour before start hour is accepted. | ✅ Fixed — retest (both rejected at save; portal loop bounded) | 2.3 |
| 9 | 🟠 Major | Touch devices | Tailwind v4 only applies `group-hover` on devices that support hover, so on phones/tablets the document actions and "Write notes" stay **invisible but tappable**. You can delete a document by tapping an empty-looking area. | ✅ Fixed — always visible on touch screens | 4.6, 7.1 |
| 10 | 🟡 Minor | Invoice panel | Keeps its initial state after "Generate invoice", so the button stays until reload and a second click gives "Invoice already exists". | ✅ Fixed — retest | 8.1 |
| 11 | 🟡 Minor | Documents | List keeps its initial state, so new uploads only appear after a reload. Success toast fires before the database record is saved. | ✅ Fixed — retest | 4.1 |
| 12 | 🟡 Minor | Access control | Dashboard only checks "signed in", not "is a practitioner". Hidden today by #2 (everyone gets a workspace), but it becomes real once #2 is fixed. | ✅ Fixed — retest (patients are redirected to the portal) | 11.5 |
| 13 | 🟡 Minor | Calendar | No overlap check for practitioner bookings; sessions outside 08:00–20:00 are drawn clamped to the edges. | ✅ Overlaps fixed (new booking flow) — clamping remains | 6.4 |
| 14 | 🟡 Minor | Portal booking | Availability only blocks the start hour of existing appointments, so a free-looking slot can fail with "no longer available". | Confirmed (code) | 6.6 |
| 15 | 🟡 Minor | Session reopen | Sets status back to Scheduled, which hides the invoice panel of an invoiced session. | ✅ Fixed — invoiced sessions stay Completed | 7.4 |
| 16 | 🟡 Minor | Currency | `€` hard-coded on Overview stats and patient session history. | ✅ Fixed — retest | 2.4 |
| 17 | 🟡 Minor | Documents | Delete has no confirmation; signed links expire after 15 min on an open page. | ✅ Fixed — confirmation added; links sign a fresh URL per click (+ `VIEW_DOCUMENT` audit) | 4.3, 4.5 |
| 18 | 🟡 Minor | Billing | "Mark sent" sends no email; "Paid" can't be undone; list capped at 50 rows. | Confirmed (code) | 9.1, 9.2 |
| 19 | 🟡 Minor | Invoice content | No practitioner address / professional ID / legal mentions; tax rate printed rounded (5.5 % → "6%"). | Tax rounding ✅ fixed; legal mentions still open | 8.2, 2.3 |
| 20 | ⚪ Cosmetic | Header | Header search box and notification bell do nothing. | ✅ Fixed — search works from every page, bell removed | 3.5 |
| 21 | ⚪ Cosmetic | Notes page | Clinical Notes is a placeholder, but the sidebar badge and "View all" point to it. | Confirmed (code) | 1.4, 7.1 |
| 22 | ⚪ Cosmetic | Practice name | Can't be changed after sign-up. | Confirmed (code) | 1.3 |
