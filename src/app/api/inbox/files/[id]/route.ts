import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSignedReadUrl } from "@/lib/gcs";
import { linkSession } from "@/lib/inbox";

// Opens a message attachment from the private inbox link (no account): allowed
// while this device's link session is valid and the file belongs to the patient.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const patient = token ? await linkSession(token) : null;
  if (!patient) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const doc = await prisma.document.findFirst({
    where: { id, patientId: patient.id, sharedWithPatient: true, isSessionNote: false },
    select: { fileKey: true },
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(await getSignedReadUrl(doc.fileKey));
}
