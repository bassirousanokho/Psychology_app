import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

/**
 * Creates (or refreshes) the User + Workspace + WorkspaceMember rows for a
 * practitioner. Each practitioner owns exactly one workspace (workspaceId = userId).
 * Safe to call repeatedly: never overwrites settings the user may have changed.
 */
export async function bootstrapWorkspace(user: { id: string; email: string; name: string }) {
  const { id, email, name } = user;
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
        slug: id,      // user ID is unique
        workingDays: [1, 2, 3, 4, 5],
      },
      update: {},
    }),
    prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: id, userId: id } },
      create: { workspaceId: id, userId: id, role: "PRACTITIONER" },
      update: {},
    }),
  ]);
}

/**
 * Makes sure the signed-in practitioner has a workspace, creating it from their
 * Clerk profile if the user.created webhook hasn't arrived (late, failed, or not
 * configured). Returns false for patient accounts, which never get a workspace.
 * Cached per request so the dashboard layout and page share one lookup.
 */
export const ensureWorkspace = cache(async (userId: string): Promise<boolean> => {
  const existing = await prisma.workspace.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (existing) return true;

  const patientUser = await prisma.patientUser.findUnique({
    where: { clerkUserId: userId },
    select: { id: true },
  });
  if (patientUser) return false;

  const user = await currentUser();
  if (!user || user.unsafeMetadata?.role === "patient") return false;

  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || email;
  await bootstrapWorkspace({ id: userId, email, name });
  return true;
});
