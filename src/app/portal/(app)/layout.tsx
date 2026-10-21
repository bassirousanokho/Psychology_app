import { requirePatientAuth } from "@/lib/patient-auth";
import { PortalNav } from "@/components/portal/portal-nav";
import { I18nProvider } from "@/i18n/client";
import { toLang } from "@/i18n/core";
import { localeOf } from "@/lib/format";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePatientAuth();

  return (
    <I18nProvider
      lang={toLang(session.workspace.language)}
      locale={localeOf(toLang(session.workspace.language), session.workspace.region)}
    >
    <div className="flex h-screen overflow-hidden" lang={toLang(session.workspace.language)}>
      <aside className="hidden md:flex w-56 shrink-0 flex-col">
        <PortalNav
          practiceName={session.workspace.name}
          patientName={`${session.patient.firstName} ${session.patient.lastName}`}
        />
      </aside>
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
    </I18nProvider>
  );
}
