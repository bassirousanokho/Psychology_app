import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

interface SendInvoiceReminderOptions {
  to: string;
  patientName: string;
  invoiceNumber: string;
  totalAmount: string;
  currency: string;
  dueDate: string;
  publicUrl: string;
}

interface SendPortalInviteOptions {
  to: string;
  patientName: string;
  practitionerName: string;
  inviteUrl: string;
  expiresInDays: number;
}

export async function sendPortalInvite(opts: SendPortalInviteOptions) {
  const html = `
    <p>Dear ${opts.patientName},</p>
    <p>${opts.practitionerName} has invited you to access your patient portal.
    You can view your appointments, invoices, and shared documents online.</p>
    <p><a href="${opts.inviteUrl}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;">
      Accept invitation
    </a></p>
    <p style="color:#71717a;font-size:12px;">
      This link expires in ${opts.expiresInDays} days. If you did not expect this invitation, you can ignore this email.
    </p>
  `;

  if (!resend) {
    console.log("[email] portal invite →", opts.to, opts.inviteUrl);
    return;
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@yourdomain.com",
    to: opts.to,
    subject: `${opts.practitionerName} invited you to your patient portal`,
    html,
  });
}

export async function sendInvoiceReminder(opts: SendInvoiceReminderOptions) {
  const html = `
    <p>Dear ${opts.patientName},</p>
    <p>This is a reminder that invoice <strong>${opts.invoiceNumber}</strong>
    for <strong>${opts.totalAmount} ${opts.currency}</strong> was due on ${opts.dueDate}.</p>
    <p><a href="${opts.publicUrl}">View invoice</a></p>
    <p>Please arrange payment at your earliest convenience.</p>
  `;

  if (!resend) {
    console.log("[email] would send reminder to", opts.to, html);
    return;
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "invoices@yourdomain.com",
    to: opts.to,
    subject: `Payment reminder — Invoice ${opts.invoiceNumber}`,
    html,
  });
}

interface SendReceiptOptions {
  to: string;
  patientName: string;
  practiceName: string;
  invoiceNumber: string;
  totalAmount: string;
  currency: string;
  paidOn: string;
  publicUrl: string;
}

/** Receipt (quittance) for a paid invoice. */
export async function sendReceiptEmail(opts: SendReceiptOptions) {
  const html = `
    <p>Dear ${opts.patientName},</p>
    <p>We confirm receipt of your payment of <strong>${opts.totalAmount} ${opts.currency}</strong>
    on ${opts.paidOn} for invoice <strong>${opts.invoiceNumber}</strong>.</p>
    <p><a href="${opts.publicUrl}">View and print your receipt</a></p>
    <p>${opts.practiceName}</p>
  `;

  if (!resend) {
    console.log("[email] receipt →", opts.to, opts.publicUrl);
    return;
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "invoices@yourdomain.com",
    to: opts.to,
    subject: `Receipt — Invoice ${opts.invoiceNumber}`,
    html,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SendPatientMessageOptions {
  to: string;
  practiceName: string;
  replyTo?: string; // practitioner's own address: replies go to their inbox
  subject: string;
  body: string;     // plain text
}

/**
 * A message written by the practitioner. Returns "NOT_CONFIGURED" when no email
 * provider is set up (nothing is sent); throws if the provider refuses it.
 */
export async function sendPatientMessage(
  opts: SendPatientMessageOptions,
): Promise<"SENT" | "NOT_CONFIGURED"> {
  if (!resend) {
    console.log("[email] patient message (not sent, no provider) →", opts.to, opts.subject);
    return "NOT_CONFIGURED";
  }

  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">${escapeHtml(opts.body).replace(/\n/g, "<br>")}</div>`;
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "noreply@yourdomain.com";
  const { error } = await resend.emails.send({
    from: `${opts.practiceName.replace(/[<>"]/g, "")} <${fromAddress}>`,
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: opts.body,
    html,
  });
  if (error) throw new Error(error.message);
  return "SENT";
}
