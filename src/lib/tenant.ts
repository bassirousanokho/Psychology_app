import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";

/**
 * Returns the current user's workspace ID (= their Clerk user ID).
 * Every user owns exactly one workspace bootstrapped on sign-up.
 * Throws if the user is not authenticated.
 */
export async function requireOrgId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

/**
 * Returns { orgId, userId } where orgId === userId.
 * Keeping the orgId alias so all callers that destructure { orgId } keep working.
 */
export async function requireAuth(): Promise<{ orgId: string; userId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  return { orgId: userId, userId };
}

export type AuditAction =
  | "VIEW_PATIENT_NOTES"
  | "EDIT_SESSION_NOTES"
  | "COMPLETE_SESSION"
  | "REOPEN_SESSION"
  | "VIEW_DOCUMENT"
  | "UPLOAD_DOCUMENT"
  | "DELETE_DOCUMENT"
  | "EXPORT_PATIENT_DATA";

/**
 * Writes an audit log entry asynchronously (fire-and-forget).
 * Never throws — errors are logged to console only so they never block the caller.
 */
export function audit(params: {
  workspaceId: string;
  userId: string;
  action: AuditAction;
  resourceType: "Patient" | "Appointment" | "Document";
  resourceId: string;
  metadata?: Prisma.InputJsonValue;
}): void {
  prisma.auditLog
    .create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        metadata: params.metadata ?? undefined,
      },
    })
    .catch((err) => console.error("[audit]", err));
}
