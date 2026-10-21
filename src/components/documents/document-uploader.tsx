"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { createUploadUrl, confirmDocumentUpload } from "@/app/(dashboard)/dashboard/patients/[id]/actions";

interface DocumentUploaderProps {
  patientId: string;
  appointmentId?: string;
  isSessionNote?: boolean;
  label?: string;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const MAX_MB = 16;

export function DocumentUploader({
  patientId,
  appointmentId,
  isSessionNote,
  label,
}: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { t, tp, tError } = useI18n();

  const busy = uploading;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const oversized = fileArray.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (oversized) {
      toast.error(t("docs.tooLarge", { name: oversized.name, max: MAX_MB }));
      return;
    }

    setUploading(true);
    try {
      const uploaded: typeof fileArray = [];
      for (const file of fileArray) {
        const urlResult = await createUploadUrl({
          patientId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });
        if (!urlResult.success || !urlResult.uploadUrl || !urlResult.key) {
          toast.error(urlResult.error ? tError(urlResult.error) : t("docs.prepareFailed", { name: file.name }));
          continue;
        }

        const putRes = await fetch(urlResult.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) {
          toast.error(t("docs.uploadFailed", { name: file.name }));
          continue;
        }

        const saved = await confirmDocumentUpload({
          patientId,
          appointmentId,
          isSessionNote,
          key: urlResult.key,
          name: file.name,
          fileType: file.type,
          fileSize: file.size,
        });
        if (!saved.success) {
          toast.error(t("docs.saveFailed", { name: file.name }));
          continue;
        }
        uploaded.push(file);
      }
      setUploading(false);

      if (uploaded.length > 0) {
        toast.success(tp(uploaded.length, "docs.uploaded"));
      }
    } catch (err) {
      setUploading(false);
      console.error("[DocumentUploader]", err);
      toast.error(t("docs.retry"));
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
        {uploading ? t("docs.uploading") : (label ?? t("docs.upload"))}
      </Button>
    </>
  );
}
