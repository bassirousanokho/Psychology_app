import { requirePatientAuth } from "@/lib/patient-auth";
import { portalI18n } from "@/i18n/server";
import prisma from "@/lib/prisma";
import { loadThread, markRead } from "@/lib/inbox";
import { MessageThread } from "@/components/inbox/message-thread";
import { EmergencyNote } from "@/components/inbox/emergency-note";
import { requestPortalUpload, sendPortalMessage } from "@/app/portal/messages-actions";

export default async function PortalMessagesPage() {
  const session = await requirePatientAuth();
  const { t } = portalI18n(session.workspace);

  await markRead(session.patientId, "patient");
  const [messages, ws] = await Promise.all([
    loadThread(session.patientId, "patient"),
    prisma.workspace.findUniqueOrThrow({ where: { id: session.workspaceId }, select: { patientCanWriteFirst: true, practitionerName: true, name: true } }),
  ]);
  const canWrite = ws.patientCanWriteFirst || messages.some((m) => !m.mine);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("portal.messages")}</h1>
        <p className="text-sm text-muted-foreground">{t("portal.messagesHint", { name: ws.practitionerName || ws.name })}</p>
      </div>
      <EmergencyNote region={session.workspace.region} />
      <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border bg-card">
        <MessageThread
          messages={messages}
          viewer="patient"
          otherName={ws.practitionerName || ws.name}
          fileBase="/api/documents/"
          send={sendPortalMessage}
          upload={requestPortalUpload}
          disabledReason={canWrite ? null : t("inbox.replyOnly")}
        />
      </div>
    </div>
  );
}
