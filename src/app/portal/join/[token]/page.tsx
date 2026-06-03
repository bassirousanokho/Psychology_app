import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignIn, SignUp } from "@clerk/nextjs";
import { format } from "date-fns";
import { CheckCircle2, Clock, ShieldOff } from "lucide-react";
import prisma from "@/lib/prisma";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function JoinPortalPage({ params }: PageProps) {
  const { token } = await params;
  const { userId } = await auth();

  // 1. Validate the invite token
  const invite = await prisma.patientInvite.findUnique({
    where: { token },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true } },
      workspace: { select: { name: true } },
    },
  });

  if (!invite) return <InvalidInvite reason="not-found" />;
  if (invite.usedAt) return <InvalidInvite reason="used" />;
  if (invite.expiresAt < new Date()) return <InvalidInvite reason="expired" />;

  // 2. Practitioner stumbled on this link — they own a Workspace, send them away
  if (userId) {
    const isPractitioner = await prisma.workspace.findUnique({ where: { id: userId }, select: { id: true } });
    if (isPractitioner) {
      return (
        <Wrapper>
          <ShieldOff className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Wrong account</h1>
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            You&apos;re currently signed in as a practitioner. Please sign out first and use a
            different account to accept this invitation.
          </p>
        </Wrapper>
      );
    }
  }

  // 3. User is authenticated — process the invite
  if (userId) {
    const existing = await prisma.patientUser.findUnique({
      where: { clerkUserId: userId },
    });

    if (existing) {
      // Already linked (possibly a different patient) — go to dashboard
      redirect("/portal/dashboard");
    }

    // Create the PatientUser link and mark invite as used
    await prisma.$transaction([
      prisma.patientUser.create({
        data: {
          clerkUserId: userId,
          patientId: invite.patientId,
          workspaceId: invite.workspaceId,
        },
      }),
      prisma.patientInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      }),
    ]);

    redirect("/portal/dashboard");
  }

  // 4. Not authenticated — show sign-up / sign-in
  const returnUrl = `/portal/join/${token}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">{invite.workspace.name}</p>
        <h1 className="text-xl font-semibold">
          Welcome, {invite.patient.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Create your patient account to access your portal.
        </p>
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-2">
          <Clock className="h-3.5 w-3.5" />
          Invitation expires {format(invite.expiresAt, "d MMMM yyyy")}
        </p>
      </div>

      <SignUp
        forceRedirectUrl={returnUrl}
        initialValues={{ emailAddress: invite.patient.email ?? undefined }}
      />

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <span className="block mt-2">
          <SignIn routing="hash" forceRedirectUrl={returnUrl} />
        </span>
      </p>
    </div>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      {children}
    </div>
  );
}

function InvalidInvite({ reason }: { reason: "not-found" | "used" | "expired" }) {
  const messages = {
    "not-found": "This invitation link is invalid or has already been deleted.",
    "used": "This invitation link has already been used. Please sign in to access your portal.",
    "expired": "This invitation link has expired. Please ask your practitioner to send a new one.",
  };

  return (
    <Wrapper>
      <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">
        {reason === "used" ? "Already activated" : "Invalid invitation"}
      </h1>
      <p className="text-sm text-muted-foreground max-w-sm text-center">
        {messages[reason]}
      </p>
    </Wrapper>
  );
}
