"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Share2,
  EyeOff,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  toggleShareDocument,
  deleteDocument,
} from "@/app/(dashboard)/dashboard/patients/[id]/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type DocumentItem = {
  id: string;
  name: string;
  url: string;
  fileType: string;
  fileSize: number;
  sharedWithPatient: boolean;
  isSessionNote?: boolean;
  createdAt: string;
};

function fileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  return <FileText className="h-4 w-4 text-red-500" />;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentListProps {
  documents: DocumentItem[];
  emptyText?: string;
}

export function DocumentList({
  documents,
  emptyText = "No documents yet. Upload handouts, consent forms, or exercises.",
}: DocumentListProps) {
  const [optimistic, setOptimistic] = useState<DocumentItem[]>(documents);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [, startTransition] = useTransition();

  async function handleToggleShare(doc: DocumentItem) {
    const next = !doc.sharedWithPatient;
    // Optimistic update
    setOptimistic((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, sharedWithPatient: next } : d)),
    );
    const result = await toggleShareDocument(doc.id, next);
    if (!result.success) {
      // Revert
      setOptimistic((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, sharedWithPatient: doc.sharedWithPatient } : d)),
      );
      toast.error(result.error ?? "Failed to update");
    }
  }

  function handleDelete(docId: string) {
    setLoadingId(docId);
    startTransition(async () => {
      const result = await deleteDocument(docId);
      setLoadingId(null);
      if (result.success) {
        setOptimistic((prev) => prev.filter((d) => d.id !== docId));
        toast.success("Document deleted");
      } else {
        toast.error(result.error ?? "Failed to delete");
      }
    });
  }

  if (optimistic.length === 0) {
    return (
      <div className="px-5 py-6 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y">
      {optimistic.map((doc) => {
        const busy = loadingId === doc.id;
        return (
          <li key={doc.id} className="flex items-center gap-3 px-5 py-3 group">
            <div className="shrink-0">{fileIcon(doc.fileType)}</div>

            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {humanSize(doc.fileSize)} · {format(new Date(doc.createdAt), "d MMM yyyy")}
              </p>
            </div>

            {doc.isSessionNote && (
              <span className="shrink-0 text-xs text-muted-foreground font-medium">Session note</span>
            )}
            {doc.sharedWithPatient && (
              <span className="shrink-0 text-xs text-green-600 font-medium">Shared</span>
            )}

            {/* Hover-revealed with a mouse; always visible on touch screens */}
            <div className="flex items-center gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              {/* Open */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                render={<a href={doc.url} target="_blank" rel="noopener noreferrer" />}
                title="Open document"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>

              {/* Share toggle (session notes stay private) */}
              {!doc.isSessionNote && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleToggleShare(doc)}
                  title={doc.sharedWithPatient ? "Unshare" : "Share with patient"}
                >
                  {doc.sharedWithPatient ? (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Share2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}

              {/* Delete */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(doc)}
                disabled={busy}
                title="Delete document"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </li>
        );
      })}
      </ul>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently deleted
              {deleteTarget?.sharedWithPatient ? " and removed from the patient's portal" : ""}.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                handleDelete(deleteTarget!.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
