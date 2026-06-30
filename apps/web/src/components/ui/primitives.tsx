"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center justify-center gap-1 whitespace-nowrap font-medium transition-all duration-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--border-strong)] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[var(--accent)] text-[var(--text-inverse)] hover:opacity-90 active:scale-[0.98]",
        outline:
          "border border-[var(--border-strong)] bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
        ghost:
          "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        active:
          "border border-[var(--border)] bg-[var(--bg-active)] text-[var(--text-primary)]",
      },
      size: {
        xs: "h-[22px] rounded-full px-2.5 text-[10px]",
        sm: "h-[26px] rounded-full px-3 text-[11px]",
        md: "h-[28px] rounded-full px-4 text-[11px]",
      },
    },
    defaultVariants: { variant: "outline", size: "sm" },
  }
);

type PillButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof pillVariants>;

export function PillButton({ className, variant, size, ...props }: PillButtonProps) {
  return <button className={cn(pillVariants({ variant, size }), className)} {...props} />;
}

export function PillChip({
  children,
  active,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[20px] max-w-full items-center truncate rounded-full border px-2 text-[10px] font-medium",
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--text-inverse)]"
          : "border-[var(--border-strong)] bg-[var(--bg-panel)] text-[var(--text-secondary)]",
        className
      )}
    >
      {children}
    </span>
  );
}

const statusStyles: Record<string, string> = {
  verified: "border-transparent bg-[var(--accent)] text-[var(--text-inverse)]",
  approved: "border-transparent bg-[var(--accent)] text-[var(--text-inverse)]",
  open: "border-transparent bg-[var(--accent)] text-[var(--text-inverse)]",
  unverified: "border-[var(--border-strong)] bg-transparent text-[var(--text-primary)]",
  in_review: "border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]",
  draft: "border-[var(--border)] bg-[var(--bg-sidebar)] text-[var(--text-secondary)]",
  pending: "border-dashed border-[var(--border-strong)] bg-transparent text-[var(--text-muted)]",
  not_found: "border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-muted)]",
  submitted: "border-[var(--border-strong)] bg-[var(--bg-panel)] text-[var(--text-primary)]",
  closed: "border-[var(--border)] bg-[var(--bg-sidebar)] text-[var(--text-muted)]",
  archived: "border-[var(--border)] bg-[var(--bg-sidebar)] text-[var(--text-muted)]",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center rounded-full border px-2 text-[10px] font-medium capitalize",
        statusStyles[status] ?? "border-[var(--border)] text-[var(--text-secondary)]"
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Panel({
  children,
  className,
  flush,
}: {
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-[var(--bg-panel)]",
        !flush && "border border-[var(--border)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[30px] shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] px-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {title}
        </span>
        {subtitle ? (
          <span className="truncate text-[10px] text-[var(--text-muted)]">· {subtitle}</span>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
      {children}
    </span>
  );
}

export { DataTable } from "@/components/ui/data-table";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-[12px] font-medium text-[var(--text-primary)]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
