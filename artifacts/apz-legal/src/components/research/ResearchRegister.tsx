import { useListResearch } from "@workspace/api-client-react"
import { BookOpen, AlertTriangle, CheckCircle2, ChevronRight, Loader2, Bot, Database } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { T } from "@/lib/theme"

/** APZ gold accent (existing design token). */
const GOLD = "var(--ref-gold)"

export function ResearchRegister({
  matterId,
  activeId,
  onSelect
}: {
  matterId?: number
  activeId: number | null
  onSelect: (id: number) => void
}) {
  const { data: history, isLoading } = useListResearch({ matterId })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: GOLD }} aria-hidden="true" />
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <BookOpen className="mb-3 h-7 w-7" style={{ color: T.textFaint }} aria-hidden="true" />
        <p className="text-[13px] font-medium" style={{ color: T.textDim }}>No research records</p>
        <p className="mt-1 max-w-[200px] text-[11px]" style={{ color: T.textFaint }}>
          Run a query to begin building the matter's research repository.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {history.map(record => {
        const isActive = activeId === record.id
        return (
          <button
            key={record.id}
            onClick={() => onSelect(record.id)}
            className="group relative w-full border-b p-4 text-left transition-colors"
            style={{
              borderColor: T.borderSub ?? T.border,
              background: isActive ? T.surfaceEl : "transparent",
            }}
          >
            {isActive && (
              <span
                className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{ background: GOLD }}
                aria-hidden="true"
              />
            )}

            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {record.savedToMatter && (
                  <Badge variant="outline" className="h-4 gap-1 py-0 text-[9px]" style={{ color: T.ok, borderColor: `color-mix(in srgb, ${T.ok} 30%, transparent)`, background: `color-mix(in srgb, ${T.ok} 10%, transparent)` }}>
                    <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" /> Saved
                  </Badge>
                )}
                {record.aiStatus === "failed" && (
                  <Badge variant="outline" className="h-4 gap-1 py-0 text-[9px]" style={{ color: T.risk, borderColor: `color-mix(in srgb, ${T.risk} 30%, transparent)`, background: `color-mix(in srgb, ${T.risk} 10%, transparent)` }}>
                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" /> AI failed
                  </Badge>
                )}
                <span className="text-[10px]" style={{ color: T.textFaint }}>
                  {new Date(record.createdAt).toLocaleDateString()}
                </span>
              </div>
              {!matterId && record.matterId && (
                <span className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: T.surfaceEl, color: T.textDim }}>
                  M-{record.matterId}
                </span>
              )}
            </div>

            <p className="mb-2 line-clamp-2 text-[13px] font-medium leading-snug" style={{ color: T.text }}>
              {record.query}
            </p>

            <div className="mt-3 flex items-center justify-between text-[10px]" style={{ color: T.textFaint }}>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Database className="h-3 w-3" aria-hidden="true" /> {record.internalResults?.length || 0} hits
                </span>
                <span className="flex items-center gap-1">
                  <Bot className="h-3 w-3" aria-hidden="true" /> {record.citations?.length || 0} citations
                </span>
              </div>
              <ChevronRight
                className={`h-3.5 w-3.5 transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                style={{ color: GOLD }}
                aria-hidden="true"
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}
