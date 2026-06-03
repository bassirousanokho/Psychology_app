interface StatCardProps {
  label: string;
  value: string;
  highlight?: "green" | "red";
}

export function StatCard({ label, value, highlight }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          highlight === "green"
            ? "text-green-600 dark:text-green-400"
            : highlight === "red"
            ? "text-red-600 dark:text-red-400"
            : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
