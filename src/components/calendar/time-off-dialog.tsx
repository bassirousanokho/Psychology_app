"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Palmtree, Trash2 } from "lucide-react";
import { createTimeOff, deleteTimeOff } from "@/app/(dashboard)/dashboard/calendar/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TimeOffPeriod } from "@/lib/time-off-shared";
import { useI18n } from "@/i18n/client";

type Booked = { id: string; startTime: string; patient: string };

/** Add or remove days off; lists sessions already booked during new time off. */
export function TimeOffButton({ upcoming }: { upcoming: TimeOffPeriod[] }) {
  const { t, fmt, tError } = useI18n();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const [booked, setBooked] = useState<Booked[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const day = (iso: string) => fmt(`${iso}T12:00:00`, "EEE d MMM yyyy");

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await createTimeOff({ start, end: end || start, label });
      if (!r.success) return void toast.error(tError(r.error));
      toast.success(t("timeOff.added"));
      setStart("");
      setEnd("");
      setLabel("");
      setBooked(r.booked);
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setBooked(null); setOpen(true); }}>
        <Palmtree className="mr-2 h-4 w-4" />
        {t("timeOff.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("timeOff.title")}</DialogTitle>
            <DialogDescription>{t("timeOff.hint")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={add} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="to-start">{t("timeOff.from")}</Label>
                <Input
                  id="to-start"
                  type="date"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (!end || end < e.target.value) setEnd(e.target.value);
                  }}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to-end">{t("timeOff.to")}</Label>
                <Input id="to-end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-label">{t("timeOff.label")}</Label>
              <Input id="to-label" value={label} maxLength={80} placeholder={t("timeOff.labelPlaceholder")} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || !start}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("timeOff.add")}
              </Button>
            </div>
          </form>

          {booked && booked.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-medium text-amber-900 dark:text-amber-200">{t("timeOff.bookedWarning", { count: booked.length })}</p>
              <ul className="mt-2 space-y-1">
                {booked.map((b) => (
                  <li key={b.id}>
                    <Link href={`/dashboard/calendar?view=day&date=${fmt(b.startTime, "yyyy-MM-dd")}`} className="underline underline-offset-2" onClick={() => setOpen(false)}>
                      {fmt(b.startTime, "EEE d MMM, HH:mm")}
                    </Link>{" "}
                    — {b.patient}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("timeOff.upcoming")}</p>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("timeOff.none")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {upcoming.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <Palmtree className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                    <span className="flex-1">
                      {p.start === p.end ? day(p.start) : `${day(p.start)} → ${day(p.end)}`}
                      {p.label && <span className="block text-xs text-muted-foreground">{p.label}</span>}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      title={t("timeOff.remove")}
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await deleteTimeOff(p.id);
                          if (r.success) toast.success(t("timeOff.removed"));
                          else toast.error(tError(r.error));
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
