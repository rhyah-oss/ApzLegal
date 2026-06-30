"use client";

import { PillButton, StatusPill, MicroLabel } from "@/components/ui/primitives";
import { CitationInline } from "@/components/shell/citation-panel";
import { Workbench, WorkbenchBody, PageHeader } from "@/components/shell/page-header";
import { aiMessages, matters } from "@/data/mock";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";

export default function LegalAiPage() {
  const { activeMatterId } = useLayoutStore();
  const matter = matters.find((m) => m.id === activeMatterId);

  return (
    <Workbench>
      <PageHeader
        title="Legal AI"
        subtitle={matter ? `${matter.reference} · South Africa` : "No matter selected"}
        actions={
          <PillButton size="xs" variant="outline">
            New session
          </PillButton>
        }
      />
      <WorkbenchBody className="flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-3xl space-y-4">
            {aiMessages.map((msg) => (
              <div key={msg.id} className={cn(msg.role === "user" ? "flex justify-end" : "")}>
                <div
                  className={cn(
                    "max-w-[92%] rounded-[var(--radius-sm)] border px-3.5 py-3",
                    msg.role === "user"
                      ? "border-[var(--border)] bg-[var(--bg-sidebar)]"
                      : "border-[var(--border-strong)] bg-[var(--bg-panel)]"
                  )}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <MicroLabel>{msg.role === "user" ? "You" : "Lexora"}</MicroLabel>
                    {msg.confidence ? (
                      <StatusPill
                        status={msg.confidence === "high" ? "verified" : "unverified"}
                      />
                    ) : null}
                  </div>
                  <div className="space-y-2 text-[12px] leading-relaxed text-[var(--text-primary)]">
                    {msg.content.split("\n").map((line, i) =>
                      line ? (
                        <p key={i}>{line}</p>
                      ) : (
                        <div key={i} className="h-1" />
                      )
                    )}
                  </div>
                  {msg.corpusWarning ? (
                    <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                      Answer may be based on incomplete material in the corpus.
                    </p>
                  ) : null}
                  {msg.role === "assistant" && msg.citations ? (
                    <CitationInline citations={msg.citations} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-sidebar)] px-4 py-3">
          <div className="mx-auto flex max-w-3xl gap-2">
            <input
              type="text"
              placeholder="Ask about this matter — cite sources only from available corpus…"
              className="lexora-focus h-[32px] flex-1 rounded-full border border-[var(--border)] bg-[var(--bg-panel)] px-4 text-[12px] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)]"
            />
            <PillButton variant="default" size="md">
              Send
            </PillButton>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-[10px] text-[var(--text-muted)]">
            Human review required before external use. Citations appear in the context panel →
          </p>
        </div>
      </WorkbenchBody>
    </Workbench>
  );
}
