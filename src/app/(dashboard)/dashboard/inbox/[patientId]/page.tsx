import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { ConversationList } from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import { InboxAccess } from "@/components/inbox/inbox-access";
import { requestUpload, sendMessage } from "../actions";
import prisma from "@/lib/prisma";
import { loadThread, markRead } from "@/lib/inbox";
import { getI18n } from "@/i18n/server";

export default async function ConversationPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { patientId } = await params;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, workspaceId: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      dateOfBirth: true,
      deletedAt: true,
      inboxToken: true,
      portalUser: { select: { id: true } },
    },
  });
  if (!patient) notFound();

  await markRead(patient.id, "practitioner");
  const messages = await loadThread(patient.id, "practitioner");
  const i18n = await getI18n(userId);
  const { t } = i18n;
  const name = `${patient.firstName} ${patient.lastName}`;

  return (
    <>
      <Header title={t("nav.inbox")} />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto grid h-[calc(100vh-7.5rem)] max-w-6xl gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="hidden min-h-0 flex-col overflow-hidden rounded-xl border bg-card lg:flex">
            <ConversationList workspaceId={userId} activeId={patient.id} i18n={i18n} />
          </aside>
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" render={<Link href="/dashboard/inbox" />}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Link href={`/dashboard/patients/${patient.id}`} className="font-semibold hover:underline">
                {patient.lastName}, {patient.firstName}
              </Link>
              <div className="ml-auto">
                <InboxAccess
                  patientId={patient.id}
                  mode={patient.portalUser ? "portal" : patient.dateOfBirth ? "link" : "none"}
                  hasEmail={!!patient.email}
                  hasLink={!!patient.inboxToken}
                />
              </div>
            </div>
            <MessageThread
              messages={messages}
              viewer="practitioner"
              otherName={name}
              fileBase="/api/documents/"
              send={sendMessage.bind(null, patient.id)}
              upload={requestUpload.bind(null, patient.id)}
              disabledReason={patient.deletedAt ? t("inbox.deletedPatient") : null}
            />
          </section>
        </div>
      </main>
    </>
  );
}
