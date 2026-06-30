"use client";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  tabs,
  activeTab,
  onTabChange,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
}) {
  return (
    <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-main)]">
      <div className="flex h-[34px] min-w-0 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
          {subtitle ? (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="truncate text-[11px] text-[var(--text-muted)]">{subtitle}</span>
            </>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      {tabs && tabs.length > 0 ? (
        <div className="flex h-[30px] items-center gap-1 border-t border-[var(--border-subtle)] px-2">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={cn(
                  "h-[22px] rounded-full px-3 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Workbench({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-main)]">{children}</div>
  );
}

export function WorkbenchBody({
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
        "min-h-0 flex-1 overflow-auto bg-[var(--bg-main)]",
        !flush && "p-0",
        className
      )}
    >
      {children}
    </div>
  );
}
