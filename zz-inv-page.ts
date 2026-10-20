import "dotenv/config";
import prisma from "./src/lib/prisma";
const mode = process.argv[2];
async function main() {
  if (mode === "setup") {
    await prisma.workspace.create({ data: {
      id: "zzws_inv", name: "Cabinet Test", slug: "zzws_inv", workingDays: [1],
      practitionerName: "Dr Claire Martin", address: "12 rue de la Paix\n75002 Paris",
      siret: "12345678900012", adeli: "759312345",
    } });
    await prisma.patient.create({ data: { id: "zzp_inv", workspaceId: "zzws_inv", firstName: "Jean", lastName: "Dupont", address: "8 avenue Victor Hugo\n69002 Lyon" } });
    await prisma.user.upsert({ where: { id: "zzws_inv" }, create: { id: "zzws_inv", email: "zz-inv@example.test", name: "t" }, update: {} });
    await prisma.appointment.create({ data: { id: "zza_inv", workspaceId: "zzws_inv", patientId: "zzp_inv", practitionerId: "zzws_inv",
      startTime: new Date("2026-10-20T14:00:00"), endTime: new Date("2026-10-20T15:00:00"), status: "COMPLETED", tariffAmount: 70, taxRate: 0 } });
    await prisma.invoice.create({ data: { workspaceId: "zzws_inv", patientId: "zzp_inv", appointmentId: "zza_inv", invoiceNumber: "INV-2026-0001",
      amount: 70, taxAmount: 0, taxRate: 0, totalAmount: 70, dueDate: new Date("2026-10-20T14:00:00"), status: "PAID", paidAt: new Date("2026-10-20T15:05:00"), publicToken: "zz-inv-token" } });
  } else {
    await prisma.workspace.deleteMany({ where: { id: "zzws_inv" } });
    await prisma.user.deleteMany({ where: { id: "zzws_inv" } });
    console.log("cleanup: leftover =", await prisma.invoice.count({ where: { publicToken: "zz-inv-token" } }));
  }
  await prisma.$disconnect();
}
main();
