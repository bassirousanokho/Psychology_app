import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { format } from "date-fns";
import prisma from "@/lib/prisma";
import { audit } from "@/lib/tenant";
import { patientsZipStream, zipResponse } from "@/lib/patient-export";

/** One patient's complete file, as a ZIP (e.g. when the patient asks for a copy). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;

  const patient = await prisma.patient.findFirst({
    where: { id, workspaceId: userId },
    select: { firstName: true, lastName: true },
  });
  if (!patient) return new NextResponse("Not found", { status: 404 });

  audit({
    workspaceId: userId,
    userId,
    action: "EXPORT_PATIENT_DATA",
    resourceType: "Patient",
    resourceId: id,
    metadata: { scope: "patient" },
  });
  const name = `${patient.lastName}-${patient.firstName}`.normalize("NFD").replace(/[^\w-]+/g, "");
  return zipResponse(patientsZipStream(userId, [id]), `dossier-${name || id}-${format(new Date(), "yyyy-MM-dd")}.zip`);
}
