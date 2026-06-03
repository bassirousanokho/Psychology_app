"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";

async function getOrgId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function markInvoicePaid(invoiceId: string) {
  const workspaceId = await getOrgId();

  const result = await prisma.invoice.updateMany({
    where: { id: invoiceId, workspaceId },
    data: { status: "PAID", paidAt: new Date() },
  });

  if (result.count === 0) return { success: false, error: "Invoice not found" };

  revalidatePath("/dashboard/billing");
  return { success: true };
}

export async function markInvoiceSent(invoiceId: string) {
  const workspaceId = await getOrgId();

  const result = await prisma.invoice.updateMany({
    where: { id: invoiceId, workspaceId },
    data: { status: "SENT" },
  });

  if (result.count === 0) return { success: false, error: "Invoice not found" };

  revalidatePath("/dashboard/billing");
  return { success: true };
}
