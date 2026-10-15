import { headers } from "next/headers";
import { Webhook } from "svix";
import type { UserJSON, WebhookEvent } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { bootstrapWorkspace } from "@/lib/workspace";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("CLERK_WEBHOOK_SECRET not configured", { status: 500 });
  }

  const headerStore = await headers();
  const svixId        = headerStore.get("svix-id");
  const svixTimestamp = headerStore.get("svix-timestamp");
  const svixSignature = headerStore.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();

  let evt: WebhookEvent;
  try {
    evt = new Webhook(secret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  // ── user.created → bootstrap User + Workspace + WorkspaceMember ─────────────
  // Each user owns exactly one workspace (workspaceId = userId).
  // No Clerk organisations are required.
  // Patients are linked to their Patient record by /portal/join — they get no
  // workspace. Sign-up forms tag the role in unsafeMetadata; untagged accounts
  // (created from another Clerk screen) count as patients if their email has a
  // pending portal invite.
  if (evt.type === "user.created" && !(await isPatientAccount(evt.data))) {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const primaryEmail = email_addresses.find(
      (e) => e.id === evt.data.primary_email_address_id,
    );
    const email = primaryEmail?.email_address ?? email_addresses[0]?.email_address ?? "";
    const name  = [first_name, last_name].filter(Boolean).join(" ") || email;

    await bootstrapWorkspace({ id, email, name });
  }

  // ── user.updated → keep email / name in sync ─────────────────────────────────
  if (evt.type === "user.updated") {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const primaryEmail = email_addresses.find(
      (e) => e.id === evt.data.primary_email_address_id,
    );
    const email = primaryEmail?.email_address ?? email_addresses[0]?.email_address ?? "";
    const name  = [first_name, last_name].filter(Boolean).join(" ") || email;

    await prisma.user.update({
      where: { id },
      data: { email, name },
    }).catch(() => { /* user may not exist yet if webhook arrives out of order */ });
  }

  return new Response("OK", { status: 200 });
}

async function isPatientAccount(user: UserJSON): Promise<boolean> {
  const role = user.unsafe_metadata?.role;
  if (role === "patient") return true;
  if (role === "practitioner") return false;

  const emails = user.email_addresses.map((e) => e.email_address);
  const pendingInvite = await prisma.patientInvite.findFirst({
    where: {
      usedAt: null,
      expiresAt: { gt: new Date() },
      patient: { email: { in: emails, mode: "insensitive" } },
    },
    select: { id: true },
  });
  return pendingInvite !== null;
}
