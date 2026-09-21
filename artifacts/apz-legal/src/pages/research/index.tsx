import { useState } from "react"
import { History, PanelLeftClose, PanelLeftOpen, Search, Plus } from "lucide-react"
import { ResearchComposer } from "@/components/research/ResearchComposer"
import { ResearchRegister } from "@/components/research/ResearchRegister"
import { ResearchRecordView } from "@/components/research/ResearchRecordView"
import { useGetResearch, getGetResearchQueryKey } from "@workspace/api-client-react"
import { PageLoader } from "@/components/ui/loader"
import { T, cardStyle } from "@/lib/theme"

export default function ResearchPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null)

  const { data: activeRecord, isLoading } = useGetResearch(activeRecordId!, {
    query: { enabled: activeRecordId !== null, queryKey: getGetResearchQueryKey(activeRecordId!) }
  })

  return (
    <div className="governed-research flex h-full" style={{ borderTop: `1px solid ${T.border}`, background: T.bg }}>
      {/* ── Sidebar Register ───────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="w-80 shrink-0 flex flex-col"
          style={{ borderRight: `1px solid ${T.border}`, background: T.surface }}
        >
          {/* Sidebar header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${T.border}` }}
          >
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 shrink-0" style={{ color: T.blue }} />
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
              className="w-full flex items-center justify-center gap-2 py-2 text-[12px] font-medium transition-colors"
              style={{
                background: `color-mix(in srgb, ${T.blue} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${T.blue} 30%, transparent)`,
                borderRadius: 8,
                color: T.blue,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${T.blue} 20%, transparent)` }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${T.blue} 12%, transparent)` }}
            >
              <Plus className="h-3.5 w-3.5" /> New Research Run
            </button>
          </div>

          <ResearchRegister activeId={activeRecordId} onSelect={setActiveRecordId} />
        </div>
      )}

      {/* ── Main Area ──────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {!sidebarOpen && (
          <div className="absolute top-4 left-4 z-10">
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

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto w-full h-full">
            {activeRecordId ? (
              isLoading ? (
                <PageLoader />
              ) : activeRecord ? (
                <ResearchRecordView
                  record={activeRecord}
                  onClose={() => setActiveRecordId(null)}
                />
              ) : (
                <p className="text-center p-8" style={{ color: T.textDim }}>Record not found</p>
              )
            ) : (
              <div className="space-y-6 max-w-4xl mx-auto mt-8">
                {/* Page heading */}
                <div className="text-center space-y-1 mb-8">
                  <div
                    className="inline-flex h-12 w-12 items-center justify-center mb-3"
                    style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 12 }}
                  >
                    <Search className="h-6 w-6" style={{ color: T.blue }} />
                  </div>
                  <h1 className="text-[20px] font-semibold" style={{ color: T.text }}>
                    Governed Legal Research
                  </h1>
                  <p className="text-[13px] max-w-lg mx-auto" style={{ color: T.textDim }}>
                    Execute traceable searches across the firm's knowledge corpus and external databases.
                    All research is bound to a matter.
                  </p>
                </div>

                <ResearchComposer onCompleted={(id) => setActiveRecordId(id)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
