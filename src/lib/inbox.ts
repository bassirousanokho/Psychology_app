// Inbox (server side): messages between the practitioner and a patient, the
// private link for patients without a portal account, and the activity feed.

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { sendMessageNotice, sendPractitionerAlert, type SendStatus } from "@/lib/email";
import { langOf } from "@/lib/format";

// ── Private link ─────────────────────────────────────────────────────────────

export const LINK_MAX_ATTEMPTS = 5;
const LINK_LOCK_MINUTES = 30;
const LINK_SESSION_MINUTES = 30;
const COOKIE = "inbox_session";

/** Lowercase letters only, without accents: "Côté-Ébert" → "coteebert". */
function letters(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** The first three letters of the last name (all of it when shorter). */
export function namePrefix(lastName: string): string {
  return letters(lastName).slice(0, 3);
}

function sign(payload: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is not set");
  return createHmac("sha256", Buffer.from(key, "hex")).update(payload).digest("hex");
}

/** The private link for a patient, created on first use. */
export async function ensureInboxToken(patientId: string): Promise<string> {
  const p = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { inboxToken: true } });
  if (p.inboxToken) return p.inboxToken;
  const token = randomUUID();
  await prisma.patient.update({ where: { id: patientId }, data: { inboxToken: token } });
  return token;
}

/**
 * Checks the answers on the private link. Wrong answers count towards a lock;
 * a right answer opens the inbox on this device for a short while (a signed
 * cookie tied to the link, so resetting the link signs everyone out).
 */
export async function verifyInboxLink(
  token: string,
  answer: { name: string; dateOfBirth: string },
): Promise<{ success: true } | { success: false; error: string }> {
  const patient = await prisma.patient.findUnique({
    where: { inboxToken: token },
    select: { id: true, lastName: true, dateOfBirth: true, deletedAt: true, inboxFailedAttempts: true, inboxLockedUntil: true },
  });
  if (!patient || patient.deletedAt || !patient.dateOfBirth) return { success: false, error: "This link is no longer valid" };
  if (patient.inboxLockedUntil && patient.inboxLockedUntil > new Date()) {
    return { success: false, error: "Too many attempts: try again in 30 minutes" };
  }

  const expected = namePrefix(patient.lastName);
  const givenName = letters(answer.name).slice(0, 3);
  const rightName = givenName.length === expected.length && givenName === expected;
  const rightDate = answer.dateOfBirth === patient.dateOfBirth.toISOString().slice(0, 10);
  if (!rightName || !rightDate) {
    const attempts = patient.inboxFailedAttempts + 1;
    const lock = attempts >= LINK_MAX_ATTEMPTS;
    await prisma.patient.update({
      where: { id: patient.id },
      data: lock
        ? { inboxFailedAttempts: 0, inboxLockedUntil: new Date(Date.now() + LINK_LOCK_MINUTES * 60_000) }
        : { inboxFailedAttempts: attempts },
    });
    return {
      success: false,
      error: lock ? "Too many attempts: try again in 30 minutes" : "These details don't match",
    };
  }

  await prisma.patient.update({ where: { id: patient.id }, data: { inboxFailedAttempts: 0, inboxLockedUntil: null } });
  const exp = Date.now() + LINK_SESSION_MINUTES * 60_000;
  (await cookies()).set(COOKIE, `${patient.id}.${exp}.${sign(`${patient.id}.${token}.${exp}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: LINK_SESSION_MINUTES * 60,
  });
  return { success: true };
}

/** The patient of a private link, when this device has passed the check. */
export async function linkSession(token: string) {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [patientId, exp, mac] = raw.split(".");
  if (!patientId || !exp || !mac || Number(exp) < Date.now()) return null;
  const expected = sign(`${patientId}.${token}.${exp}`);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, inboxToken: token, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      workspaceId: true,
      workspace: { select: { name: true, practitionerName: true, language: true, region: true, patientCanWriteFirst: true, practitionerEmailNotices: true } },
    },
  });
  return patient;
}

// ── Attachments ──────────────────────────────────────────────────────────────

export type AttachmentInput = { key: string; name: string; fileType: string; fileSize: number };

const MAX_PDF_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

export function checkUpload(fileType: string, fileSize: number): string | null {
  const isPdf = fileType === "application/pdf";
  const isImage = fileType.startsWith("image/");
  if (!isPdf && !isImage) return "Unsupported file type";
  if (isPdf && fileSize > MAX_PDF_BYTES) return "PDF exceeds 16 MB limit";
  if (isImage && fileSize > MAX_IMAGE_BYTES) return "Image exceeds 8 MB limit";
  return null;
}

export function uploadKey(workspaceId: string, patientId: string, fileName: string): string {
  return `documents/${workspaceId}/${patientId}/${randomUUID()}-${fileName.replace(/[/\\]/g, "_").slice(0, 120)}`;
}

/** Attachments must be files we issued upload links for, for this patient. */
function validAttachments(workspaceId: string, patientId: string, files: AttachmentInput[]): string | null {
  if (files.length > MAX_ATTACHMENTS) return `At most ${MAX_ATTACHMENTS} files per message`;
  for (const f of files) {
    if (!f.key.startsWith(`documents/${workspaceId}/${patientId}/`)) return "Invalid upload";
    const bad = checkUpload(f.fileType, f.fileSize);
    if (bad) return bad;
  }
  return null;
}

// ── Messages ─────────────────────────────────────────────────────────────────

const MAX_BODY = 10_000;
/** No new email notice while an earlier one, sent this recently, is still unread. */
const NOTICE_QUIET_MINUTES = 60;

export type NoticeResult = "SENT" | "NOT_CONFIGURED" | "FAILED" | "NO_EMAIL" | "NO_ACCESS" | "SKIPPED";

/**
 * Saves a message and its attachments. The files become documents of the
 * patient, visible to both sides.
 */
async function saveMessage(params: {
  workspaceId: string;
  patientId: string;
  direction: "TO_PATIENT" | "FROM_PATIENT";
  senderId: string | null;
  body: string;
  attachments: AttachmentInput[];
}) {
  return prisma.message.create({
    data: {
      workspaceId: params.workspaceId,
      patientId: params.patientId,
      direction: params.direction,
      senderId: params.senderId,
      body: encrypt(params.body),
      attachments: {
        create: params.attachments.map((f) => ({
          workspaceId: params.workspaceId,
          patientId: params.patientId,
          uploadedById: params.senderId,
          uploadedByPatient: params.direction === "FROM_PATIENT",
          name: f.name.slice(0, 200),
          fileKey: f.key,
          fileType: f.fileType,
          fileSize: f.fileSize,
          sharedWithPatient: true,
        })),
      },
    },
  });
}

function checkBody(body: string, attachments: AttachmentInput[]): string | null {
  if (!body.trim() && attachments.length === 0) return "Write a message";
  if (body.length > MAX_BODY) return "Message is too long";
  return null;
}

/** Where the patient reads messages: the portal, or the private link (needs a date of birth). */
export async function patientInboxUrl(patient: { id: string; dateOfBirth: Date | null; portalUser: { id: string } | null }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (patient.portalUser) return `${appUrl}/portal/messages`;
  if (!patient.dateOfBirth) return null;
  return `${appUrl}/inbox/${await ensureInboxToken(patient.id)}`;
}

/**
 * Practitioner → patient. Emails the patient a notice without the content,
 * with the link to read it.
 */
export async function sendToPatient(params: {
  workspaceId: string;
  senderId: string;
  patientId: string;
  body: string;
  attachments: AttachmentInput[];
}): Promise<{ success: true; notice: NoticeResult; link: string | null } | { success: false; error: string }> {
  const body = params.body.trim();
  const invalid = checkBody(body, params.attachments) ?? validAttachments(params.workspaceId, params.patientId, params.attachments);
  if (invalid) return { success: false, error: invalid };

  const patient = await prisma.patient.findFirst({
    where: { id: params.patientId, workspaceId: params.workspaceId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      dateOfBirth: true,
      portalUser: { select: { id: true } },
      workspace: { select: { name: true, practitionerName: true, language: true } },
    },
  });
  if (!patient) return { success: false, error: "Patient not found" };

  // Quiet period: an unread message already announced recently
  const recent = await prisma.message.findFirst({
    where: {
      patientId: patient.id,
      direction: "TO_PATIENT",
      readAt: null,
      status: "SENT",
      createdAt: { gt: new Date(Date.now() - NOTICE_QUIET_MINUTES * 60_000) },
    },
    select: { id: true },
  });

  const message = await saveMessage({ ...params, direction: "TO_PATIENT", body });
  const link = await patientInboxUrl(patient);

  let notice: NoticeResult;
  let status: SendStatus | "FAILED" | null = null;
  let error: string | null = null;
  if (!link) notice = "NO_ACCESS";
  else if (!patient.email) notice = "NO_EMAIL";
  else if (recent) notice = "SKIPPED";
  else {
    const practitioner = await prisma.user.findUnique({ where: { id: params.senderId }, select: { email: true } });
    try {
      status = await sendMessageNotice({
        lang: langOf(patient.workspace.language),
        to: patient.email,
        patientName: `${patient.firstName} ${patient.lastName}`,
        practiceName: patient.workspace.practitionerName || patient.workspace.name,
        url: link,
        portal: !!patient.portalUser,
        replyTo: practitioner?.email,
      });
    } catch (err) {
      status = "FAILED";
      error = err instanceof Error ? err.message : "Unknown error";
      console.error("[sendToPatient notice]", err);
    }
    notice = status;
  }
  if (status) {
    await prisma.message.update({ where: { id: message.id }, data: { status, error, toEmail: patient.email } });
  }
  return { success: true, notice, link };
}

/**
 * Patient → practitioner (portal or private link). Refused when the practice
 * only lets patients reply and there's nothing to reply to.
 */
export async function sendFromPatient(params: {
  workspaceId: string;
  patientId: string;
  body: string;
  attachments: AttachmentInput[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const body = params.body.trim();
  const invalid = checkBody(body, params.attachments) ?? validAttachments(params.workspaceId, params.patientId, params.attachments);
  if (invalid) return { success: false, error: invalid };

  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: params.workspaceId },
    select: { patientCanWriteFirst: true, practitionerEmailNotices: true, language: true },
  });
  if (!ws.patientCanWriteFirst) {
    const started = await prisma.message.count({ where: { patientId: params.patientId, direction: "TO_PATIENT" } });
    if (started === 0) return { success: false, error: "Your practitioner hasn't opened a conversation yet" };
  }

  await saveMessage({ ...params, direction: "FROM_PATIENT", senderId: null, body });

  if (ws.practitionerEmailNotices) {
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: params.patientId }, select: { firstName: true, lastName: true } });
    const lang = langOf(ws.language);
    const name = `${patient.firstName} ${patient.lastName}`;
    await alertPractitioner(params.workspaceId, {
      subject: lang === "fr" ? `Nouveau message de ${name}` : `New message from ${name}`,
      line: lang === "fr" ? `${name} vous a écrit. Lisez et répondez dans l'application.` : `${name} wrote to you. Read and reply in the app.`,
      path: `/dashboard/inbox/${params.patientId}`,
      lang,
    });
  }
  return { success: true };
}

/** Thread as shown to either side, oldest first, decrypted. */
export async function loadThread(patientId: string, viewer: "practitioner" | "patient") {
  const rows = await prisma.message.findMany({
    where: { patientId },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { attachments: { select: { id: true, name: true, fileType: true, fileSize: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    mine: viewer === "practitioner" ? m.direction === "TO_PATIENT" : m.direction === "FROM_PATIENT",
    subject: m.subject,
    body: decrypt(m.body) ?? "",
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
    attachments: m.attachments,
  }));
}

/** Marks the other side's messages as read. */
export async function markRead(patientId: string, viewer: "practitioner" | "patient") {
  await prisma.message.updateMany({
    where: { patientId, direction: viewer === "practitioner" ? "FROM_PATIENT" : "TO_PATIENT", readAt: null },
    data: { readAt: new Date() },
  });
}

// ── Activity feed ────────────────────────────────────────────────────────────

export type ActivityType = "BOOKED" | "MOVED" | "CANCELLED" | "FORM_COMPLETED";

/** Records a practice event, and emails the practitioner when the practice wants it. */
export async function recordActivity(params: {
  workspaceId: string;
  type: ActivityType;
  patientId?: string | null;
  appointmentId?: string | null;
  formRequestId?: string | null;
  data?: Prisma.InputJsonValue;
  email?: { subject: string; line: string; path: string };
}) {
  await prisma.activity.create({
    data: {
      workspaceId: params.workspaceId,
      type: params.type,
      patientId: params.patientId ?? null,
      appointmentId: params.appointmentId ?? null,
      formRequestId: params.formRequestId ?? null,
      data: params.data,
    },
  });
  if (!params.email) return;
  const ws = await prisma.workspace.findUnique({
    where: { id: params.workspaceId },
    select: { practitionerEmailNotices: true, language: true },
  });
  if (ws?.practitionerEmailNotices) await alertPractitioner(params.workspaceId, { ...params.email, lang: langOf(ws.language) });
}

/** Content-free email to the practice owner. Never throws. */
async function alertPractitioner(
  workspaceId: string,
  alert: { subject: string; line: string; path: string; lang: "fr" | "en" },
) {
  try {
    const owner = await prisma.workspaceMember.findFirst({
      where: { workspaceId, role: "PRACTITIONER" },
      select: { user: { select: { email: true } } },
    });
    if (!owner?.user.email) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await sendPractitionerAlert({ lang: alert.lang, to: owner.user.email, subject: alert.subject, line: alert.line, url: `${appUrl}${alert.path}` });
  } catch (err) {
    console.error("[alertPractitioner]", err);
  }
}

/** Unread items for the sidebar badge: patient messages and practice events. */
export async function inboxUnread(workspaceId: string) {
  const [messages, activity] = await Promise.all([
    prisma.message.count({ where: { workspaceId, direction: "FROM_PATIENT", readAt: null } }),
    prisma.activity.count({ where: { workspaceId, readAt: null } }),
  ]);
  return { messages, activity, total: messages + activity };
}
