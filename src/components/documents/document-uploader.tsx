"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadFiles } from "@/lib/uploadthing";
import { saveDocument } from "@/app/(dashboard)/dashboard/patients/[id]/actions";

interface DocumentUploaderProps {
  patientId: string;
  appointmentId?: string;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const MAX_MB = 16;

export function DocumentUploader({ patientId, appointmentId }: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const busy = isPending || uploading;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const oversized = fileArray.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (oversized) {
      toast.error(`${oversized.name} exceeds the ${MAX_MB} MB limit`);
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadFiles("documentUploader", { files: fileArray });
      setUploading(false);

      startTransition(async () => {
        for (const file of uploaded) {
          const result = await saveDocument({
            patientId,
            appointmentId,
            name: file.name,
            url: file.ufsUrl ?? file.url,
            fileKey: file.key,
            fileType: file.type,
            fileSize: file.size,
          });
          if (!result.success) {
            toast.error(`Failed to save ${file.name}`);
          }
        }
        toast.success(
          uploaded.length === 1
            ? "Document uploaded"
            : `${uploaded.length} documents uploaded`,
        );
      });
    } catch (err) {
      setUploading(false);
      console.error("[DocumentUploader]", err);
      toast.error("Upload failed. Please try again.");
    }

    // Reset input so the same file can be re-uploaded if needed
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {uploading ? "Uploading…" : "Upload document"}
      </Button>
    </>
  );
}
