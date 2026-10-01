import { useState } from "react"
import { History, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react"
import { ResearchComposer } from "@/components/research/ResearchComposer"
import { ResearchRegister } from "@/components/research/ResearchRegister"
import { ResearchRecordView } from "@/components/research/ResearchRecordView"
import { useGetResearch, getGetResearchQueryKey } from "@workspace/api-client-react"
import { PageLoader } from "@/components/ui/loader"
import { T, cardStyle } from "@/lib/theme"

/** APZ gold accent (existing design token). */
const GOLD = "var(--ref-gold)"

export default function ResearchPage() {
  // Desktop/tablet keep the register docked beside the composer. On phones the
  // register would consume nearly the whole viewport, so it starts collapsed and
  // is opened on demand over the content (see below).
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => typeof window === "undefined" || window.innerWidth >= 768,
  )
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null)

  const { data: activeRecord, isLoading } = useGetResearch(activeRecordId!, {
    query: { enabled: activeRecordId !== null, queryKey: getGetResearchQueryKey(activeRecordId!) }
  })

  return (
    <div className="governed-research relative flex h-full" style={{ borderTop: `1px solid ${T.border}`, background: T.bg }}>
      {/* Mobile scrim: lets the open register be dismissed by tapping outside it. */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-20 md:hidden"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar Register ───────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="absolute inset-y-0 left-0 z-30 w-80 shrink-0 flex flex-col md:relative md:z-auto"
          style={{ borderRight: `1px solid ${T.border}`, background: T.surface }}
        >
          {/* Sidebar header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${T.border}` }}
          >
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.textFaint }}>
                Research Register
              </h2>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex h-6 w-6 items-center justify-center transition-colors"
              style={{ color: T.textFaint, borderRadius: 6 }}
              title="Close history"
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceEl; e.currentTarget.style.color = T.text }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textFaint }}
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* New research run button */}
          <div className="p-3" style={{ borderBottom: `1px solid ${T.border}` }}>
            <button
              onClick={() => setActiveRecordId(null)}
              className="w-full flex items-center justify-center gap-2 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90"
              style={{
                background: GOLD,
                color: "#1b1a17",
                borderRadius: 8,
              }}
            >
              <Plus className="h-3.5 w-3.5" /> New Research Run
            </button>
          </div>

          <ResearchRegister activeId={activeRecordId} onSelect={setActiveRecordId} />
        </div>
      )}

      {/* ── Main Area ──────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Desktop: floating icon toggle (unchanged behaviour). */}
        {!sidebarOpen && (
          <div className="absolute top-4 left-4 z-10 hidden md:block">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-8 w-8 items-center justify-center transition-colors"
              style={{
                ...cardStyle,
                background: T.surfaceEl,
                color: T.textFaint,
              }}
              title="Show history"
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceB; e.currentTarget.style.color = T.text }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.surfaceEl; e.currentTarget.style.color = T.textFaint }}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">
            {/* Mobile: an in-flow, labelled history control so it never overlaps
                the page header. */}
            {!sidebarOpen && (
              <div className="mb-4 md:hidden">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 px-3 text-[12px] font-medium transition-colors"
                  style={{ ...cardStyle, background: T.surfaceEl, color: T.textDim }}
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Research history
                </button>
              </div>
            )}
            {activeRecordId ? (
              isLoading ? (
                <PageLoader />
              ) : activeRecord ? (
                <ResearchRecordView
                  record={activeRecord}
                  onClose={() => setActiveRecordId(null)}
                />
              ) : (
                <p className="p-8 text-center" style={{ color: T.textDim }}>Record not found</p>
              )
            ) : (
              <div className="mx-auto max-w-3xl space-y-6">
                {/* ── Compact page header ─────────────────────────────────── */}
                <header>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: GOLD }}
                  >
                    Legal research
                  </p>
                  <h1 className="mt-1.5 text-[22px] font-semibold leading-tight" style={{ color: T.text }}>
                    Governed Legal Research
                  </h1>
                  <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: T.textDim }}>
                    Execute traceable searches across the firm's knowledge corpus and external databases.
                    All research is bound to a matter.
                  </p>
                </header>

                <ResearchComposer onCompleted={(id) => setActiveRecordId(id)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
