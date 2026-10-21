import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { format } from "date-fns";
import prisma from "@/lib/prisma";
import { audit } from "@/lib/tenant";
import { patientsZipStream, zipResponse } from "@/lib/patient-export";

/** Every patient file of the practice, as a ZIP (Settings → Export). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const ws = await prisma.workspace.findUnique({ where: { id: userId }, select: { id: true } });
  if (!ws) return new NextResponse("Not found", { status: 404 });

  audit({
    workspaceId: userId,
    userId,
    action: "EXPORT_PATIENT_DATA",
    resourceType: "Patient",
    resourceId: userId,
    metadata: { scope: "all" },
  });
  return zipResponse(patientsZipStream(userId), `dossiers-patients-${format(new Date(), "yyyy-MM-dd")}.zip`);
}
