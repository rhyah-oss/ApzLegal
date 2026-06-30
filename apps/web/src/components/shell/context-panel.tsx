"use client";

import { Bot } from "lucide-react";
import { usePathname } from "next/navigation";
import { CitationPanel } from "@/components/shell/citation-panel";
import { Panel, PanelHeader, MicroLabel } from "@/components/ui/primitives";
import { aiMessages } from "@/data/mock";

export function ContextPanel() {
  const pathname = usePathname();
  const showCitations =
    pathname.startsWith("/ai") ||
    pathname.startsWith("/matters/") ||
    pathname.startsWith("/research");

  const lastAssistant = [...aiMessages].reverse().find((m) => m.role === "assistant");

  return (
    <Panel flush className="h-full bg-[var(--bg-context)]">
      <PanelHeader
        title="Assistant"
        subtitle="Context"
        action={<Bot className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
      />
      <div className="flex-1 overflow-y-auto p-3">
        {showCitations && lastAssistant?.citations ? (
          <CitationPanel citations={lastAssistant.citations} />
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
              Open Legal AI or a matter to view citations, extracted facts, and verification
              status beside your work.
            </p>
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-panel)] p-3">
              <MicroLabel>Shortcuts</MicroLabel>
              <ul className="mt-2 space-y-1.5 text-[11px] text-[var(--text-secondary)]">
                <li className="flex justify-between gap-4">
                  <span>Command palette</span>
                  <kbd className="rounded border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-muted)]">
                    ⌘K
                  </kbd>
                </li>
                <li className="flex justify-between gap-4">
                  <span>Toggle sidebar</span>
                  <kbd className="rounded border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-muted)]">
                    ⌘B
                  </kbd>
                </li>
                <li className="flex justify-between gap-4">
                  <span>Toggle panel</span>
                  <kbd className="rounded border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-muted)]">
                    ⌘\
                  </kbd>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
