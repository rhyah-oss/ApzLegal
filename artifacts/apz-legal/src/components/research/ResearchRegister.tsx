import { useListResearch } from "@workspace/api-client-react"
import { BookOpen, AlertTriangle, CheckCircle2, ChevronRight, Loader2, Bot, Database } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { T } from "@/lib/theme"

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
        <Loader2 className="h-5 w-5 animate-spin text-[#4169E1]" />
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <BookOpen className="h-8 w-8 text-[#162440] mb-3" />
        <p className="text-sm font-medium text-[#6B8FBB]">No research records</p>
        <p className="text-xs text-[#4A6B9A] mt-1 max-w-[200px]">Run a query to begin building the matter's research repository.</p>
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
            className="w-full text-left p-4 transition-colors border-b border-[#162440] relative group hover:bg-[#0A1628]"
            style={{ background: isActive ? T.surface : "transparent" }}
          >
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#4169E1]" />}
            
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {record.savedToMatter && (
                  <Badge variant="outline" className="text-[9px] py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 gap-1 h-4">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Saved
                  </Badge>
                )}
                {record.aiStatus === "failed" && (
                  <Badge variant="outline" className="text-[9px] py-0 border-red-500/30 text-red-400 bg-red-500/10 gap-1 h-4">
                    <AlertTriangle className="h-2.5 w-2.5" /> AI Failed
                  </Badge>
                )}
                <span className="text-[10px] text-[#6B8FBB]">
                  {new Date(record.createdAt).toLocaleDateString()}
                </span>
              </div>
              {!matterId && record.matterId && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#162440] text-[#E8EFFF] font-mono">
                  M-{record.matterId}
                </span>
              )}
            </div>

            <p className="text-[13px] font-medium text-[#E8EFFF] line-clamp-2 leading-snug mb-2 group-hover:text-[#4169E1] transition-colors">
              {record.query}
            </p>

            <div className="flex items-center justify-between mt-3 text-[10px] text-[#4A6B9A]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Database className="h-3 w-3" /> {record.internalResults?.length || 0} hits
                </span>
                <span className="flex items-center gap-1">
                  <Bot className="h-3 w-3" /> {record.citations?.length || 0} citations
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#4169E1]" />
            </div>
          </button>
        )
      })}
    </div>
  )
}
