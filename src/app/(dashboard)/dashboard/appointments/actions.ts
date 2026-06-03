"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";

async function getOrgId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

async function nextInvoiceNumber(workspaceId: string): Promise<string> {
  const count = await prisma.invoice.count({ where: { workspaceId } });
  const seq = String(count + 1).padStart(4, "0");
  const year = new Date().getFullYear();
  return `INV-${year}-${seq}`;
}

export async function generateInvoice(appointmentId: string) {
  const workspaceId = await getOrgId();

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, workspaceId },
    include: { workspace: { select: { currency: true } } },
  });

  if (!appointment) return { success: false, error: "Appointment not found" };
  if (appointment.status !== "COMPLETED") {
    return { success: false, error: "Can only invoice completed appointments" };
  }

  const existing = await prisma.invoice.findUnique({
    where: { appointmentId },
  });
  if (existing) return { success: false, error: "Invoice already exists" };

  const amount = appointment.tariffAmount;
  const taxRate = appointment.taxRate;
  const taxAmount = amount.mul(taxRate).div(100);
  const totalAmount = amount.add(taxAmount);

  const invoiceNumber = await nextInvoiceNumber(workspaceId);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  await prisma.invoice.create({
    data: {
      workspaceId,
      patientId: appointment.patientId,
      appointmentId,
      invoiceNumber,
      amount,
      taxAmount,
      taxRate,
      totalAmount,
      status: "DRAFT",
      dueDate,
    },
  });

  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  revalidatePath("/dashboard/billing");
  return { success: true };
}
