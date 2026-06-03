import { format } from "date-fns";
import { Download, FileText, Image as ImageIcon } from "lucide-react";
import { requirePatientAuth } from "@/lib/patient-auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";

function fileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  return <FileText className="h-4 w-4 text-red-500" />;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PortalDocumentsPage() {
  const session = await requirePatientAuth();

  const documents = await prisma.document.findMany({
    where: {
      workspaceId: session.workspaceId,
      patientId: session.patientId,
      sharedWithPatient: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Files shared with you by your practitioner.
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        {documents.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No documents have been shared with you yet.
          </p>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                <div className="shrink-0">{fileIcon(doc.fileType)}</div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {humanSize(doc.fileSize)} · {format(doc.createdAt, "d MMM yyyy")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  render={<a href={doc.url} target="_blank" rel="noopener noreferrer" download />}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
