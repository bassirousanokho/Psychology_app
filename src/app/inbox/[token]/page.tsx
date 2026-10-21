import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import prisma from "@/lib/prisma";
import { linkSession, loadThread, markRead } from "@/lib/inbox";
import { MessageThread } from "@/components/inbox/message-thread";
import { EmergencyNote } from "@/components/inbox/emergency-note";
import { LinkCheck } from "@/components/inbox/link-check";
import { requestLinkUpload, sendLinkMessage } from "@/app/inbox/actions";
import { I18nProvider } from "@/i18n/client";
import { portalI18n } from "@/i18n/server";
import { toLang } from "@/i18n/core";
import { localeOf } from "@/lib/format";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Messages for a patient without a portal account, behind a short identity check. */
export default async function PrivateInboxPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const owner = await prisma.patient.findUnique({
    where: { inboxToken: token },
    select: {
      deletedAt: true,
      dateOfBirth: true,
      inboxLockedUntil: true,
      workspace: { select: { name: true, practitionerName: true, language: true, region: true, patientCanWriteFirst: true } },
    },
  });
  if (!owner || owner.deletedAt || !owner.dateOfBirth) notFound();

  const ws = owner.workspace;
  const lang = toLang(ws.language);
  const { t } = portalI18n(ws);
  const practice = ws.practitionerName || ws.name;
  const patient = await linkSession(token);

  let content: React.ReactNode;
  if (!patient) {
    content = <LinkCheck token={token} locked={!!owner.inboxLockedUntil && owner.inboxLockedUntil > new Date()} />;
  } else {
    await markRead(patient.id, "patient");
    const messages = await loadThread(patient.id, "patient");
    const canWrite = ws.patientCanWriteFirst || messages.some((m) => !m.mine);
    content = (
      <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-xl border">
        <MessageThread
          messages={messages}
          viewer="patient"
          otherName={practice}
          fileBase="/api/inbox/files/"
          fileQuery={`?t=${token}`}
          send={sendLinkMessage.bind(null, token)}
          upload={requestLinkUpload.bind(null, token)}
          disabledReason={canWrite ? null : t("inbox.replyOnly")}
        />
      </div>
    );
  }

  return (
    <I18nProvider lang={lang} locale={localeOf(lang, ws.region)}>
      <div className="min-h-screen bg-muted/40 px-4 py-8" lang={lang}>
        <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{practice}</p>
              <h1 className="text-lg font-bold">
                {patient ? t("inbox.linkTitle", { name: patient.firstName }) : t("inbox.linkTitleAnon")}
              </h1>
            </div>
          </div>
          {patient && <EmergencyNote region={ws.region} />}
          {content}
          <p className="text-xs text-muted-foreground">{t("inbox.linkPrivacy")}</p>
        </div>
      </div>
    </I18nProvider>
  );
}
