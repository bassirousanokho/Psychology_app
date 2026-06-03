import { requirePatientAuth } from "@/lib/patient-auth";
import { PortalNav } from "@/components/portal/portal-nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePatientAuth();

  return (
    <div className="flex h-screen overflow-hidden">
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
  );
}
