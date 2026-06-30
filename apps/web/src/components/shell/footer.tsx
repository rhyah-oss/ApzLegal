"use client";

import { useLayoutStore } from "@/stores/layout-store";
import { getMatter } from "@/data/mock";
import { cn } from "@/lib/utils";

export function Footer() {
  const { activeMatterId } = useLayoutStore();
  const matter = activeMatterId ? getMatter(activeMatterId) : null;

  return (
    <footer className="flex h-[var(--footer-h)] shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--bg-frame)] px-3 text-[10px] text-[var(--text-muted)]">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--text-muted)] opacity-20" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
        </span>
        <span className="font-medium text-[var(--text-secondary)]">Connected</span>
        <span className="hidden text-[var(--text-muted)] sm:inline">· Mock mode</span>
      </div>

      {matter ? (
        <div className="mx-2 hidden min-w-0 max-w-[45%] md:block">
          <span className="inline-flex max-w-full items-center truncate rounded-full border border-[var(--border)] bg-[var(--bg-sidebar)] px-2.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{matter.reference}</span>
            <span className="mx-1 text-[var(--text-muted)]">·</span>
            <span className="truncate">{matter.title}</span>
          </span>
        </div>
      ) : (
        <div className="hidden flex-1 md:block" />
      )}

      <div className="flex items-center gap-3 tabular-nums">
        <span className="hidden sm:inline">Ln 1, Col 1</span>
        <span className="hidden sm:inline">UTF-8</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
          AI idle
        </span>
      </div>
    </footer>
  );
}
