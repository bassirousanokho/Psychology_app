"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

export type ThreadMessage = {
  id: string;
  mine: boolean;
  subject: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
  attachments: { id: string; name: string; fileType: string; fileSize: number }[];
};

type Attachment = { key: string; name: string; fileType: string; fileSize: number };
type SendResult = { success: true; notice?: string; link?: string | null } | { success: false; error: string };
type UploadResult = { success: true; uploadUrl: string; key: string } | { success: false; error: string };

interface MessageThreadProps {
  messages: ThreadMessage[];
  viewer: "practitioner" | "patient";
  otherName: string;
  /** Opens an attachment: `${fileBase}${id}${fileQuery}` */
  fileBase: string;
  fileQuery?: string;
  send: (body: string, attachments: Attachment[]) => Promise<SendResult>;
  upload: (file: { fileName: string; fileType: string; fileSize: number }) => Promise<UploadResult>;
  /** Why writing is unavailable, if it is */
  disabledReason?: string | null;
}

const REFRESH_MS = 20_000;

export function MessageThread({ messages, viewer, otherName, fileBase, fileQuery = "", send, upload, disabledReason }: MessageThreadProps) {
  const router = useRouter();
  const { t, fmt, tError } = useI18n();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // New messages arrive by refreshing the page data
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function noticeToast(result: { notice?: string; link?: string | null }) {
    if (viewer === "patient") return toast.success(t("inbox.sent"));
    const copy = async () => {
      if (!result.link) return;
      try {
        await navigator.clipboard.writeText(result.link);
      } catch {
        /* clipboard unavailable */
      }
    };
    switch (result.notice) {
      case "SENT":
      case "SKIPPED":
        return toast.success(t("inbox.sentNotified"));
      case "NOT_CONFIGURED":
        void copy();
        return toast.warning(t("inbox.sentNoProvider"));
      case "NO_EMAIL":
        void copy();
        return toast.warning(t("inbox.sentNoEmail"));
      case "NO_ACCESS":
        return toast.warning(t("inbox.sentNoAccess"));
      case "FAILED":
        void copy();
        return toast.warning(t("inbox.sentNoticeFailed"));
      default:
        return toast.success(t("inbox.sent"));
    }
  }

  function submit() {
    if (!body.trim() && files.length === 0) return;
    startTransition(async () => {
      const attachments: Attachment[] = [];
      for (const file of files) {
        const res = await upload({ fileName: file.name, fileType: file.type, fileSize: file.size });
        if (!res.success) {
          toast.error(tError(res.error));
          return;
        }
        const put = await fetch(res.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!put.ok) {
          toast.error(t("inbox.uploadFailed", { name: file.name }));
          return;
        }
        attachments.push({ key: res.key, name: file.name, fileType: file.type, fileSize: file.size });
      }
      const result = await send(body, attachments);
      if (!result.success) {
        toast.error(tError(result.error));
        return;
      }
      setBody("");
      setFiles([]);
      noticeToast(result);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {viewer === "practitioner" ? t("inbox.emptyThread", { name: otherName }) : t("inbox.emptyThreadPatient")}
          </p>
        )}
        {messages.map((m, i) => {
          const showDay = i === 0 || messages[i - 1].createdAt.slice(0, 10) !== m.createdAt.slice(0, 10);
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                  {fmt(m.createdAt, "EEEE d MMMM yyyy")}
                </p>
              )}
              <div className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]",
                    m.mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                  )}
                >
                  {m.subject && <p className="mb-0.5 font-semibold">{m.subject}</p>}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  {m.attachments.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {m.attachments.map((a) => (
                        <li key={a.id}>
                          <a
                            href={`${fileBase}${a.id}${fileQuery}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs underline-offset-2 hover:underline",
                              m.mine ? "bg-primary-foreground/15" : "bg-background",
                            )}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{a.name}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {fmt(m.createdAt, "HH:mm")}
                    {m.mine &&
                      (m.readAt ? (
                        <CheckCheck className="h-3 w-3" aria-label={t("inbox.read")} />
                      ) : (
                        <Check className="h-3 w-3" aria-label={t("inbox.delivered")} />
                      ))}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="border-t p-3">
        {disabledReason ? (
          <p className="text-center text-sm text-muted-foreground">{disabledReason}</p>
        ) : (
          <>
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                    <FileText className="h-3 w-3" />
                    <span className="max-w-40 truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} aria-label={t("inbox.removeFile")}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setFiles((fs) => [...fs, ...picked].slice(0, 5));
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => fileInput.current?.click()} title={t("inbox.attach")}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                placeholder={t("inbox.placeholder")}
                rows={2}
                className="min-h-0 resize-none"
              />
              <Button type="button" onClick={submit} disabled={isPending || (!body.trim() && files.length === 0)} className="shrink-0">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="sr-only sm:not-sr-only sm:ml-1.5">{t("inbox.send")}</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
