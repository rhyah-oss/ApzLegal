import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
        className
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {label}
      </span>
      <span className="mt-0.5 text-[20px] font-semibold tabular-nums leading-none tracking-tight text-[var(--text-primary)]">
        {value}
      </span>
      {hint ? (
        <span className="mt-1 text-[10px] text-[var(--text-muted)]">{hint}</span>
      ) : null}
    </div>
  );
}
