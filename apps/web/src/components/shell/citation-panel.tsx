"use client";

import type { Citation } from "@/types";
import { StatusPill, PillButton, MicroLabel } from "@/components/ui/primitives";

export function CitationPanel({ citations }: { citations: Citation[] }) {
  return (
    <div className="space-y-2">
      <MicroLabel>Citations · {citations.length}</MicroLabel>
      {citations.map((c) => (
        <article
          key={c.id}
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-panel)] p-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
                {c.sourceTitle}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                {c.sourceType} · {c.reference} · {c.confidence}%
              </p>
            </div>
            <StatusPill status={c.status} />
          </div>
          <blockquote className="mt-2 border-l-2 border-[var(--border-strong)] pl-2.5 text-[10px] leading-relaxed text-[var(--text-secondary)]">
            {c.excerpt}
          </blockquote>
          <div className="mt-2.5 flex flex-wrap gap-1">
            <PillButton size="xs" variant="outline">
              Open source
            </PillButton>
            {(c.status === "pending" || c.status === "unverified") && (
              <>
                <PillButton size="xs" variant="default">
                  Approve
                </PillButton>
                <PillButton size="xs" variant="ghost">
                  Reject
                </PillButton>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export function CitationInline({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) {
    return (
      <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--bg-sidebar)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
        Source not found in the available corpus.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5">
      <MicroLabel>Sources</MicroLabel>
      {citations.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] px-2.5 py-1"
        >
          <span className="min-w-0 truncate text-[10px] text-[var(--text-primary)]">
            {c.sourceTitle} · {c.reference}
          </span>
          <StatusPill status={c.status} />
        </div>
      ))}
    </div>
  );
}
