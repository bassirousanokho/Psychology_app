"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendPortalInviteAction } from "@/app/(dashboard)/dashboard/patients/[id]/actions";

interface InviteButtonProps {
  patientId: string;
  hasPortalAccess: boolean;
}

export function InviteButton({ patientId, hasPortalAccess }: InviteButtonProps) {
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (hasPortalAccess) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
        <CheckCircle2 className="h-4 w-4" />
        Portal active
      </span>
    );
  }

  function handleInvite() {
    startTransition(async () => {
      const result = await sendPortalInviteAction(patientId);
      if (result.success) {
        setSent(true);
        toast.success("Invitation sent to patient's email");
      } else {
        toast.error(result.error ?? "Failed to send invitation");
      }
    });
  }

  if (sent) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        Invitation sent
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleInvite} disabled={isPending}>
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Mail className="mr-2 h-4 w-4" />
      )}
      Invite to portal
    </Button>
  );
}
