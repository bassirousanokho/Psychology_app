import { Header } from "@/components/layout/header";

export default function NotesPage() {
  return (
    <>
      <Header title="Clinical Notes" />
      <main className="flex-1 p-6">
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          Clinical notes — coming in Milestone 4.
        </div>
      </main>
    </>
  );
}
