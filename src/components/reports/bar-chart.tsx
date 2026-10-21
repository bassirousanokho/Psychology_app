// Small dependency-free bar charts (server-rendered).

import { cn } from "@/lib/utils";

export type Series = { label: string; className: string; values: number[] };

export function BarChart({
  labels,
  series,
  stacked = false,
  format,
  height = 160,
}: {
  labels: string[];
  series: Series[];
  stacked?: boolean;
  format: (n: number) => string;
  height?: number;
}) {
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0));
  const max = Math.max(1, ...(stacked ? totals : series.flatMap((s) => s.values.map((v) => Math.max(0, v)))));

  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-2" style={{ height }}>
        {labels.map((label, i) => (
          <div key={label + i} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            {stacked ? (
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                style={{ height: `${(totals[i] / max) * 100}%` }}
                title={`${label} — ${series.map((s) => `${s.label} : ${format(s.values[i] ?? 0)}`).join(" · ")}`}
              >
                {series.map((s) => (
                  <div
                    key={s.label}
                    className={s.className}
                    style={{ height: totals[i] ? `${(Math.max(0, s.values[i] ?? 0) / totals[i]) * 100}%` : 0 }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-end gap-0.5">
                {series.map((s) => (
                  <div
                    key={s.label}
                    className={cn("min-w-0 flex-1 rounded-t", s.className)}
                    style={{ height: `${(Math.max(0, s.values[i] ?? 0) / max) * 100}%` }}
                    title={`${label} — ${s.label} : ${format(s.values[i] ?? 0)}`}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-2">
        {labels.map((label, i) => (
          <p key={label + i} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground">
            {label}
          </p>
        ))}
      </div>
      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", s.className)} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
