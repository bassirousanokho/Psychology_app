import Link from "next/link";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { cn } from "@/lib/utils";
import type { I18n } from "@/i18n/core";
import { NewConversation } from "./new-conversation";

/** Patients with messages, most recent first, with unread counts (server component). */
export async function ConversationList({
  workspaceId,
  activeId,
  i18n,
}: {
  workspaceId: string;
  activeId?: string;
  i18n: I18n;
}) {
  const { t, fmt } = i18n;
  const [latest, unread, patients] = await Promise.all([
    prisma.message.groupBy({
      by: ["patientId"],
      where: { workspaceId },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 100,
    }),
    prisma.message.groupBy({
      by: ["patientId"],
      where: { workspaceId, direction: "FROM_PATIENT", readAt: null },
      _count: true,
    }),
    prisma.patient.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  const ids = latest.map((l) => l.patientId);
  const [names, lastMessages] = await Promise.all([
    prisma.patient.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, deletedAt: true } }),
    Promise.all(
      ids.map((id) =>
        prisma.message.findFirst({
          where: { patientId: id },
          orderBy: { createdAt: "desc" },
          select: { body: true, direction: true, createdAt: true, _count: { select: { attachments: true } } },
        }),
      ),
    ),
  ]);
  const unreadBy = new Map(unread.map((u) => [u.patientId, u._count]));

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b p-3">
        <NewConversation patients={patients} />
      </div>
      {ids.length === 0 ? (
        <p className="p-5 text-center text-sm text-muted-foreground">{t("inbox.noConversations")}</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {ids.map((id, i) => {
            const p = names.find((n) => n.id === id);
            const last = lastMessages[i];
            const count = unreadBy.get(id) ?? 0;
            const preview = last ? (decrypt(last.body) ?? "").replace(/\s+/g, " ").slice(0, 80) || (last._count.attachments ? t("inbox.attachment") : "") : "";
            return (
              <li key={id}>
                <Link
                  href={`/dashboard/inbox/${id}`}
                  className={cn("block px-4 py-3 hover:bg-muted/50", id === activeId && "bg-muted")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("truncate text-sm", count > 0 ? "font-semibold" : "font-medium")}>
                      {p ? `${p.lastName}, ${p.firstName}` : "—"}
                    </p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{last && fmt(last.createdAt, "d MMM")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("truncate text-xs", count > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {last?.direction === "TO_PATIENT" && `${t("inbox.you")} : `}
                      {preview}
                    </p>
                    {count > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {count}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
