import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center p-6">
      <ShieldOff className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">No portal access</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your account is not linked to a patient record. Please ask your practitioner
        to send you an invitation link.
      </p>
      <Button variant="outline" render={<Link href="/portal/sign-in" />}>
        Sign in with a different account
      </Button>
    </div>
  );
}
