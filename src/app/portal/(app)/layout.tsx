import { requirePatientAuth } from "@/lib/patient-auth";
import prisma from "@/lib/prisma";
import { PortalMobileNav, PortalNav } from "@/components/portal/portal-nav";
import { I18nProvider } from "@/i18n/client";
import { toLang } from "@/i18n/core";
import { localeOf } from "@/lib/format";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePatientAuth();
  const unreadMessages = await prisma.message.count({
    where: { patientId: session.patientId, direction: "TO_PATIENT", readAt: null },
  });

  return (
    <I18nProvider
      lang={toLang(session.workspace.language)}
      locale={localeOf(toLang(session.workspace.language), session.workspace.region)}
    >
    <div className="flex h-screen flex-col overflow-hidden md:flex-row" lang={toLang(session.workspace.language)}>
      <PortalMobileNav practiceName={session.workspace.name} unreadMessages={unreadMessages} />
      <aside className="hidden md:flex w-56 shrink-0 flex-col">
        <PortalNav
          practiceName={session.workspace.name}
          patientName={`${session.patient.firstName} ${session.patient.lastName}`}
          unreadMessages={unreadMessages}
        />
      </aside>
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
    </I18nProvider>
  );
}
