import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Email language follows the practice's language setting. */
export type Lang = "fr" | "en";
export type SendStatus = "SENT" | "NOT_CONFIGURED";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;

function button(href: string, label: string): string {
  return `<p><a href="${e(href)}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;">${e(label)}</a></p>`;
}

function layout(body: string): string {
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#18181b">${body}</div>`;
}

/**
 * Sends through Resend, or logs and returns "NOT_CONFIGURED" when no provider is
 * set up. Throws when the provider refuses the email.
 */
async function deliver(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  replyTo?: string;
}): Promise<SendStatus> {
  if (!resend) {
    console.log("[email] not sent (no provider) →", opts.to, opts.subject);
    return "NOT_CONFIGURED";
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "noreply@yourdomain.com";
  const { error } = await resend.emails.send({
    from: opts.fromName ? `${opts.fromName.replace(/[<>"]/g, "")} <${fromAddress}>` : fromAddress,
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    html: layout(opts.html),
    text: opts.text,
  });
  if (error) throw new Error(error.message);
  return "SENT";
}

// ── Portal invitation ────────────────────────────────────────────────────────

export async function sendPortalInvite(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practitionerName: string;
  inviteUrl: string;
  expiresInDays: number;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  return deliver({
    to: opts.to,
    fromName: opts.practitionerName,
    subject: fr
      ? `${opts.practitionerName} vous invite à votre portail patient`
      : `${opts.practitionerName} invited you to your patient portal`,
    html: fr
      ? `<p>Bonjour ${e(opts.patientName)},</p>
         <p>${e(opts.practitionerName)} vous invite à accéder à votre portail patient : vos rendez-vous, vos factures et les documents partagés, en ligne.</p>
         ${button(opts.inviteUrl, "Accepter l'invitation")}
         <p style="color:#71717a;font-size:12px;">Ce lien expire dans ${opts.expiresInDays} jours. Si vous n'attendiez pas cette invitation, vous pouvez ignorer ce courriel.</p>`
      : `<p>Dear ${e(opts.patientName)},</p>
         <p>${e(opts.practitionerName)} has invited you to access your patient portal. You can view your appointments, invoices, and shared documents online.</p>
         ${button(opts.inviteUrl, "Accept invitation")}
         <p style="color:#71717a;font-size:12px;">This link expires in ${opts.expiresInDays} days. If you did not expect this invitation, you can ignore this email.</p>`,
  });
}

// ── Invoice ──────────────────────────────────────────────────────────────────

export async function sendInvoiceEmail(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  invoiceNumber: string;
  total: string; // formatted with currency
  dueDate: string;
  publicUrl: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    subject: fr ? `Facture ${opts.invoiceNumber}` : `Invoice ${opts.invoiceNumber}`,
    html: fr
      ? `<p>Bonjour ${e(opts.patientName)},</p>
         <p>Voici votre facture <strong>${e(opts.invoiceNumber)}</strong> d'un montant de <strong>${e(opts.total)}</strong>, payable le ${e(opts.dueDate)}.</p>
         ${button(opts.publicUrl, "Voir la facture")}
         <p>${e(opts.practiceName)}</p>`
      : `<p>Dear ${e(opts.patientName)},</p>
         <p>Please find your invoice <strong>${e(opts.invoiceNumber)}</strong> for <strong>${e(opts.total)}</strong>, due on ${e(opts.dueDate)}.</p>
         ${button(opts.publicUrl, "View invoice")}
         <p>${e(opts.practiceName)}</p>`,
  });
}

// ── Credit note ──────────────────────────────────────────────────────────────

export async function sendCreditNoteEmail(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  title: string;           // "Note de crédit" / "Avoir"
  number: string;
  cancelledNumber: string; // the invoice it cancels
  publicUrl: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    subject: fr ? `${opts.title} ${opts.number}` : `Credit note ${opts.number}`,
    html: fr
      ? `<p>Bonjour ${e(opts.patientName)},</p>
         <p>La facture <strong>${e(opts.cancelledNumber)}</strong> est annulée par le document <strong>${e(opts.title)} ${e(opts.number)}</strong>.</p>
         ${button(opts.publicUrl, "Voir le document")}
         <p>${e(opts.practiceName)}</p>`
      : `<p>Dear ${e(opts.patientName)},</p>
         <p>Invoice <strong>${e(opts.cancelledNumber)}</strong> is cancelled by credit note <strong>${e(opts.number)}</strong>.</p>
         ${button(opts.publicUrl, "View the credit note")}
         <p>${e(opts.practiceName)}</p>`,
  });
}

// ── Overdue reminder (dunning) ───────────────────────────────────────────────

export async function sendInvoiceReminder(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  invoiceNumber: string;
  total: string;
  dueDate: string;
  publicUrl: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    subject: fr
      ? `Rappel de paiement — Facture ${opts.invoiceNumber}`
      : `Payment reminder — Invoice ${opts.invoiceNumber}`,
    html: fr
      ? `<p>Bonjour ${e(opts.patientName)},</p>
         <p>Nous vous rappelons que la facture <strong>${e(opts.invoiceNumber)}</strong> de <strong>${e(opts.total)}</strong> était payable le ${e(opts.dueDate)}.</p>
         ${button(opts.publicUrl, "Voir la facture")}
         <p>Merci de procéder au paiement dès que possible.</p>`
      : `<p>Dear ${e(opts.patientName)},</p>
         <p>This is a reminder that invoice <strong>${e(opts.invoiceNumber)}</strong> for <strong>${e(opts.total)}</strong> was due on ${e(opts.dueDate)}.</p>
         ${button(opts.publicUrl, "View invoice")}
         <p>Please arrange payment at your earliest convenience.</p>`,
  });
}

// ── Receipt (quittance) ──────────────────────────────────────────────────────

export async function sendReceiptEmail(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  invoiceNumber: string;
  total: string;
  paidOn: string;
  publicUrl: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    subject: fr ? `Reçu — Facture ${opts.invoiceNumber}` : `Receipt — Invoice ${opts.invoiceNumber}`,
    html: fr
      ? `<p>Bonjour ${e(opts.patientName)},</p>
         <p>Nous confirmons la réception de votre paiement de <strong>${e(opts.total)}</strong> le ${e(opts.paidOn)} pour la facture <strong>${e(opts.invoiceNumber)}</strong>.</p>
         ${button(opts.publicUrl, "Voir et imprimer votre reçu")}
         <p>${e(opts.practiceName)}</p>`
      : `<p>Dear ${e(opts.patientName)},</p>
         <p>We confirm receipt of your payment of <strong>${e(opts.total)}</strong> on ${e(opts.paidOn)} for invoice <strong>${e(opts.invoiceNumber)}</strong>.</p>
         ${button(opts.publicUrl, "View and print your receipt")}
         <p>${e(opts.practiceName)}</p>`,
  });
}

// ── Statement (for insurance) ────────────────────────────────────────────────

export async function sendStatementEmail(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  period: string; // "1 janvier 2026 – 31 décembre 2026"
  publicUrl: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    subject: fr ? `Relevé de paiements — ${opts.period}` : `Statement of payments — ${opts.period}`,
    html: fr
      ? `<p>Bonjour ${e(opts.patientName)},</p>
         <p>Voici votre relevé des paiements pour la période du ${e(opts.period)}, à joindre à votre demande de remboursement auprès de votre assureur.</p>
         ${button(opts.publicUrl, "Voir et imprimer le relevé")}
         <p>${e(opts.practiceName)}</p>`
      : `<p>Dear ${e(opts.patientName)},</p>
         <p>Here is your statement of payments for ${e(opts.period)}, to attach to your insurance claim.</p>
         ${button(opts.publicUrl, "View and print the statement")}
         <p>${e(opts.practiceName)}</p>`,
  });
}

// ── Session reminder (day before) ────────────────────────────────────────────

export async function sendSessionReminder(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  when: string;    // "mardi 21 octobre à 14 h 00"
  address?: string | null;
  replyTo?: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  const where = opts.address ? `<p>${e(opts.address).replace(/\n/g, "<br>")}</p>` : "";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    replyTo: opts.replyTo,
    subject: fr ? `Rappel : votre rendez-vous ${opts.when}` : `Reminder: your appointment ${opts.when}`,
    html: fr
      ? `<p>Bonjour ${e(opts.patientName)},</p>
         <p>Nous vous rappelons votre rendez-vous <strong>${e(opts.when)}</strong>.</p>
         ${where}
         <p>En cas d'empêchement, merci de prévenir dès que possible en répondant à ce courriel.</p>
         <p>${e(opts.practiceName)}</p>`
      : `<p>Dear ${e(opts.patientName)},</p>
         <p>This is a reminder of your appointment <strong>${e(opts.when)}</strong>.</p>
         ${where}
         <p>If you can't make it, please let us know as soon as possible by replying to this email.</p>
         <p>${e(opts.practiceName)}</p>`,
  });
}

// ── Portal bookings (patient confirmation, practitioner notice) ─────────────

export type PortalChange = "booked" | "moved" | "cancelled";

/** Confirms to the patient a session they booked, moved or cancelled from the portal. */
export async function sendPortalConfirmation(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  change: PortalChange;
  when: string;
  fee?: string | null; // late cancellation fee, formatted
  address?: string | null;
  replyTo?: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  const where = opts.address && opts.change !== "cancelled" ? `<p>${e(opts.address).replace(/\n/g, "<br>")}</p>` : "";
  const subject = {
    booked: fr ? `Rendez-vous confirmé : ${opts.when}` : `Appointment confirmed: ${opts.when}`,
    moved: fr ? `Rendez-vous déplacé : ${opts.when}` : `Appointment moved: ${opts.when}`,
    cancelled: fr ? `Rendez-vous annulé : ${opts.when}` : `Appointment cancelled: ${opts.when}`,
  }[opts.change];
  const line = {
    booked: fr ? `Votre rendez-vous du <strong>${e(opts.when)}</strong> est confirmé.` : `Your appointment on <strong>${e(opts.when)}</strong> is confirmed.`,
    moved: fr ? `Votre rendez-vous est déplacé au <strong>${e(opts.when)}</strong>.` : `Your appointment is moved to <strong>${e(opts.when)}</strong>.`,
    cancelled: fr ? `Votre rendez-vous du <strong>${e(opts.when)}</strong> est annulé.` : `Your appointment on <strong>${e(opts.when)}</strong> is cancelled.`,
  }[opts.change];
  const fee = opts.fee
    ? `<p>${fr ? `Annulation tardive : des frais de ${e(opts.fee)} s'appliquent selon la politique d'annulation.` : `Late cancellation: a fee of ${e(opts.fee)} applies under the cancellation policy.`}</p>`
    : "";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    replyTo: opts.replyTo,
    subject,
    html: `<p>${fr ? "Bonjour" : "Dear"} ${e(opts.patientName)},</p><p>${line}</p>${fee}${where}<p>${e(opts.practiceName)}</p>`,
  });
}

/** Short email to the practitioner (practice events, new patient message), without clinical content. */
export async function sendPractitionerAlert(opts: {
  lang: Lang;
  to: string;
  subject: string;
  line: string; // plain text
  url: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  return deliver({
    to: opts.to,
    subject: opts.subject,
    html: `<p>${e(opts.line)}</p>${button(opts.url, fr ? "Ouvrir dans l'application" : "Open in the app")}
      <p style="color:#71717a;font-size:12px;">${fr ? "Vous pouvez désactiver ces courriels dans les paramètres (Messagerie)." : "You can turn these emails off in Settings (Inbox)."}</p>`,
  });
}

// ── Form to fill in ──────────────────────────────────────────────────────────

export async function sendFormRequestEmail(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  formName: string;
  signature: boolean; // the form asks for an electronic signature
  url: string;
  replyTo?: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    replyTo: opts.replyTo,
    subject: fr ? `Formulaire à remplir : ${opts.formName}` : `Form to fill in: ${opts.formName}`,
    html: fr
      ? `<p>Bonjour ${e(opts.patientName)},</p>
         <p>${e(opts.practiceName)} vous demande de remplir le formulaire <strong>${e(opts.formName)}</strong>${opts.signature ? " et de le signer électroniquement" : ""}.</p>
         ${button(opts.url, "Remplir le formulaire")}
         <p style="color:#71717a;font-size:12px;">Ce lien vous est personnel : ne le transférez pas.</p>`
      : `<p>Dear ${e(opts.patientName)},</p>
         <p>${e(opts.practiceName)} asks you to fill in the form <strong>${e(opts.formName)}</strong>${opts.signature ? " and sign it electronically" : ""}.</p>
         ${button(opts.url, "Fill in the form")}
         <p style="color:#71717a;font-size:12px;">This link is personal: please don't forward it.</p>`,
  });
}

// ── New message in the inbox (no content) ────────────────────────────────────

/**
 * Tells the patient a message is waiting, without its content: it's read in the
 * portal or through the private link.
 */
export async function sendMessageNotice(opts: {
  lang: Lang;
  to: string;
  patientName: string;
  practiceName: string;
  url: string;
  portal: boolean; // read in the portal (sign-in) rather than through the private link
  replyTo?: string;
}): Promise<SendStatus> {
  const fr = opts.lang === "fr";
  const how = opts.portal
    ? fr ? "Connectez-vous à votre portail patient pour le lire et répondre." : "Sign in to your patient portal to read and reply."
    : fr
    ? "Pour le lire, ouvrez le lien ci-dessous : on vous demandera les trois premières lettres de votre nom de famille et votre date de naissance."
    : "To read it, open the link below: you'll be asked for the first three letters of your last name and your date of birth.";
  return deliver({
    to: opts.to,
    fromName: opts.practiceName,
    replyTo: opts.replyTo,
    subject: fr ? `Nouveau message de ${opts.practiceName}` : `New message from ${opts.practiceName}`,
    html: `<p>${fr ? "Bonjour" : "Dear"} ${e(opts.patientName)},</p>
      <p>${fr ? `${e(opts.practiceName)} vous a envoyé un message.` : `${e(opts.practiceName)} sent you a message.`} ${e(how)}</p>
      ${button(opts.url, fr ? "Lire le message" : "Read the message")}
      <p style="color:#71717a;font-size:12px;">${fr ? "Par confidentialité, le contenu n'est pas envoyé par courriel. Ce lien vous est personnel." : "For privacy, the content isn't sent by email. This link is personal."}</p>`,
  });
}
