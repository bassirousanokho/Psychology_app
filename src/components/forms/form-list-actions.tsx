"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { addLibraryForm, archiveFormTemplate } from "@/app/(dashboard)/dashboard/forms/actions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

export function FormLibraryButtons({ items }: { items: { key: string; name: string }[] }) {
  const router = useRouter();
  const { t, tError } = useI18n();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <Button
          key={item.key}
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await addLibraryForm(item.key);
              if (!result.success) return void toast.error(tError(result.error));
              toast.success(t("forms.added", { name: item.name }));
              router.push(`/dashboard/forms/${result.id}`);
            })
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {item.name}
        </Button>
      ))}
    </div>
  );
}

export function ArchiveFormButton({ id, archived }: { id: string; archived: boolean }) {
  const { t, tError } = useI18n();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await archiveFormTemplate(id, !archived);
          if (result.success) toast.success(archived ? t("forms.restored") : t("forms.archivedToast"));
          else toast.error(tError(result.error));
        })
      }
    >
      {archived ? <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> : <Archive className="mr-1.5 h-3.5 w-3.5" />}
      {archived ? t("forms.restore") : t("forms.archive")}
    </Button>
  );
}
