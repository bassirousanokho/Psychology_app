import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSignedReadUrl } from "@/lib/gcs";
import { audit } from "@/lib/tenant";

// Opens a document through a fresh short-lived signed URL, so links in the UI never
// expire. Allowed for the owning practitioner, or for the patient when shared.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { workspaceId: true, patientId: true, fileKey: true, sharedWithPatient: true },
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const isPractitioner = doc.workspaceId === userId;
  if (!isPractitioner) {
    const patientUser = await prisma.patientUser.findUnique({
      where: { clerkUserId: userId },
      select: { patientId: true, patient: { select: { deletedAt: true } } },
    });
    const isSharedWithThisPatient =
      doc.sharedWithPatient &&
      patientUser?.patientId === doc.patientId &&
      !patientUser.patient.deletedAt;
    // 404 rather than 403: don't reveal that the document exists
    if (!isSharedWithThisPatient) return new NextResponse("Not found", { status: 404 });
  }

  if (isPractitioner) {
    audit({
      workspaceId: doc.workspaceId,
      userId,
      action: "VIEW_DOCUMENT",
      resourceType: "Document",
      resourceId: id,
      metadata: { patientId: doc.patientId },
    });
  }

  return NextResponse.redirect(await getSignedReadUrl(doc.fileKey));
}
