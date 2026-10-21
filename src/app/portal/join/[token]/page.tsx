import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignIn, SignUp } from "@clerk/nextjs";
import { CheckCircle2, Clock, ShieldOff } from "lucide-react";
import prisma from "@/lib/prisma";
import { makeI18n, toLang, type I18n } from "@/i18n/core";
import { getBrowserI18n } from "@/i18n/server";

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
      patient: { select: { id: true, firstName: true, lastName: true, email: true, deletedAt: true } },
      workspace: { select: { name: true, language: true } },
    },
  });

  // The invite's practice language; before the invite is found, the browser's
  const { t, fmt } = invite ? makeI18n(toLang(invite.workspace.language)) : await getBrowserI18n();

  if (!invite || invite.patient.deletedAt) return <InvalidInvite reason="not-found" t={t} />;
  if (invite.usedAt) return <InvalidInvite reason="used" t={t} />;
  if (invite.expiresAt < new Date()) return <InvalidInvite reason="expired" t={t} />;

  // 2. Practitioner stumbled on this link — they own a Workspace, send them away
  if (userId) {
    const isPractitioner = await prisma.workspace.findUnique({ where: { id: userId }, select: { id: true } });
    if (isPractitioner) {
      return (
        <Wrapper>
          <ShieldOff className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("join.wrongAccount")}</h1>
          <p className="text-sm text-muted-foreground max-w-sm text-center">{t("join.wrongAccountBody")}</p>
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
          {t("join.welcome", { name: invite.patient.firstName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("join.create")}
        </p>
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-2">
          <Clock className="h-3.5 w-3.5" />
          {t("join.expires", { date: fmt(invite.expiresAt, "d MMMM yyyy") })}
        </p>
      </div>

      {/* role: "patient" tells the Clerk webhook not to create a practitioner workspace */}
      <SignUp
        forceRedirectUrl={returnUrl}
        initialValues={{ emailAddress: invite.patient.email ?? undefined }}
        unsafeMetadata={{ role: "patient" }}
      />

      <p className="text-sm text-muted-foreground">
        {t("join.haveAccount")}{" "}
        <span className="block mt-2">
          <SignIn
            routing="hash"
            forceRedirectUrl={returnUrl}
            signUpUrl={returnUrl}
            unsafeMetadata={{ role: "patient" }}
          />
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

function InvalidInvite({ reason, t }: { reason: "not-found" | "used" | "expired"; t: I18n["t"] }) {
  const messages = {
    "not-found": t("join.notFound"),
    "used": t("join.used"),
    "expired": t("join.expired"),
  };

  return (
    <Wrapper>
      <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">
        {reason === "used" ? t("join.activated") : t("join.invalid")}
      </h1>
      <p className="text-sm text-muted-foreground max-w-sm text-center">
        {messages[reason]}
      </p>
    </Wrapper>
  );
}
