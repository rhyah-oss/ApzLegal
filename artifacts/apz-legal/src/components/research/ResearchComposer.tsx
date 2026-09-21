import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  useListMatters, 
  getListMattersQueryKey,
  useListResearchSources, 
  usePerformResearch,
  getListResearchQueryKey,
  getGetMatterTimelineQueryKey,
  getListAuditLogsQueryKey,
  type ResearchInputSourcesItem 
} from "@workspace/api-client-react"
import { Search, Loader2, BookOpen, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

export function ResearchComposer({ 
  preselectedMatterId,
  onCompleted 
}: { 
  preselectedMatterId?: number
  onCompleted?: (id: number) => void 
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [matterId, setMatterId] = useState<string>(preselectedMatterId ? String(preselectedMatterId) : "")
  const [query, setQuery] = useState("")
  const [selectedSources, setSelectedSources] = useState<Record<string, boolean>>({})

  const { data: matters } = useListMatters({}, { query: { enabled: !preselectedMatterId, queryKey: getListMattersQueryKey() } })
  const { data: sources } = useListResearchSources()
  const performMutation = usePerformResearch()

  const toggleSource = (sourceId: string) => {
    setSelectedSources(prev => ({
      ...prev,
      [sourceId]: !prev[sourceId]
    }))
  }

  const handleRun = () => {
    if (!matterId) {
      toast({ title: "Matter required", description: "You must bind this research to a matter.", variant: "destructive" })
      return
    }
    if (!query.trim()) {
      toast({ title: "Query required", description: "Please enter a research query.", variant: "destructive" })
      return
    }

    const activeSources = Object.entries(selectedSources)
      .filter(([_, active]) => active)
      .map(([id]) => id as ResearchInputSourcesItem)

    performMutation.mutate(
      { 
        data: { 
          matterId: Number(matterId), 
          query,
          sources: activeSources.length > 0 ? activeSources : undefined
        } 
      },
      {
        onSuccess: (res) => {
          toast({ title: "Research completed" })
          queryClient.invalidateQueries({ queryKey: getListResearchQueryKey() })
          queryClient.invalidateQueries({ queryKey: getGetMatterTimelineQueryKey(Number(matterId)) })
          queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey({ matterId: Number(matterId) }) })
          setQuery("")
          if (onCompleted) onCompleted(res.id)
        },
        onError: (err: any) => {
          toast({ title: "Research failed", description: err?.data?.error || err?.message, variant: "destructive" })
        }
      }
    )
  }

  return (
    <div className="bg-[#0A1628] border border-[#162440] rounded-lg overflow-hidden flex flex-col">
      <div className="p-4 border-b border-[#162440] bg-[#050B1A]">
        <h3 className="text-sm font-medium text-[#E8EFFF] mb-1">New Research Run</h3>
        <p className="text-xs text-[#6B8FBB]">Execute a traceable research query across firm corpus and external databases.</p>
      </div>

      <div className="p-6 space-y-6">
        {!preselectedMatterId && (
          <div className="space-y-2 max-w-sm">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#6B8FBB]">Select Matter</label>
            <Select value={matterId} onValueChange={setMatterId}>
              <SelectTrigger className="bg-[#050B1A] border-[#162440] text-[#E8EFFF] focus:ring-[#4169E1]">
                <SelectValue placeholder="Select a matter..." />
              </SelectTrigger>
              <SelectContent className="bg-[#050B1A] border-[#162440] text-[#E8EFFF]">
                {matters?.map(m => (
                  <SelectItem key={m.id} value={String(m.id)} className="focus:bg-[#0F1E35] focus:text-[#00CFFF]">
                    {m.reference} - {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#6B8FBB]">Research Question</label>
          <Textarea 
            placeholder="E.g. What are the notification requirements for terminating a commercial lease under the new Property Act?"
            className="min-h-[120px] bg-[#050B1A] border-[#162440] text-[#E8EFFF] focus-visible:ring-[#4169E1] placeholder:text-[#4A6B9A]"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#6B8FBB]">Data Sources</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sources?.map(src => {
              const isActive = selectedSources[src.source] !== false // Default true if undefined
              return (
                <button
                  key={src.source}
                  onClick={() => toggleSource(src.source)}
                  className={`flex flex-col text-left p-3 rounded border transition-all ${
                    isActive 
                      ? "border-[#4169E1] bg-[#4169E1]/10" 
                      : "border-[#162440] bg-[#050B1A] opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className={`text-sm font-medium ${isActive ? "text-[#E8EFFF]" : "text-[#6B8FBB]"}`}>
                      {src.label}
                    </span>
                    {src.live ? (
                      <span className="text-[9px] uppercase tracking-wider bg-[#00CFFF]/10 text-[#00CFFF] px-1.5 py-0.5 rounded border border-[#00CFFF]/20">
                        Available
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> Phase 1D
                      </span>
                    )}
                  </div>
                  {!src.live && (
                    <p className="text-[10px] text-[#4A6B9A] mt-1 leading-tight">
                      {src.availability}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[#162440] bg-[#050B1A] flex justify-end">
        <Button 
          onClick={handleRun} 
          disabled={performMutation.isPending}
          className="bg-gradient-to-r from-[#4169E1] to-[#3558C8] hover:from-[#3558C8] hover:to-[#2B4BAA] text-white"
        >
          {performMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing corpus...</>
          ) : (
            <><Search className="mr-2 h-4 w-4" /> Run Research</>
          )}
        </Button>
      </div>
    </div>
  )
}
