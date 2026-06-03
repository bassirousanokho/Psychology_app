import { headers } from "next/headers";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

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
  if (evt.type === "user.created") {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const primaryEmail = email_addresses.find(
      (e) => e.id === evt.data.primary_email_address_id,
    );
    const email = primaryEmail?.email_address ?? email_addresses[0]?.email_address ?? "";
    const name  = [first_name, last_name].filter(Boolean).join(" ") || email;

    await prisma.$transaction([
      prisma.user.upsert({
        where: { id },
        create: { id, email, name },
        update: { email, name },
      }),
      prisma.workspace.upsert({
        where: { id },
        create: {
          id,
          name,          // user's full name is the initial practice name
          slug: id,      // user ID is unique — can be changed later in settings
          workingDays: [1, 2, 3, 4, 5],
        },
        update: {},      // don't overwrite settings the user may have changed
      }),
      prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: id, userId: id } },
        create: { workspaceId: id, userId: id, role: "PRACTITIONER" },
        update: {},
      }),
    ]);
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
