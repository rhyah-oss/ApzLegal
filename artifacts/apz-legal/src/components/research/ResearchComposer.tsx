import { useState, type CSSProperties } from "react"
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
import { Search, Loader2, BookOpen, AlertTriangle, FileText, Scale, Gavel, Check, ShieldCheck, Building2, Library } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { T } from "@/lib/theme"

/** APZ gold accent (existing design token). */
const GOLD = "var(--ref-gold)"

/** Short, accurate supporting copy per research source. */
const SOURCE_DESCRIPTIONS: Record<string, string> = {
  firm_precedents: "Documents and precedents previously produced by the firm.",
  knowledge_base: "Firm know-how, guidance notes and reference material.",
  case_law: "External case law databases.",
  legislation: "External legislation databases.",
}

const SOURCE_ICONS: Record<string, typeof FileText> = {
  firm_precedents: FileText,
  knowledge_base: BookOpen,
  case_law: Scale,
  legislation: Gavel,
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: T.textFaint,
}

const fieldStyle: CSSProperties = {
  background: T.surfaceEl,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.text,
}

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
      // A source is selected unless it was explicitly deselected, so invert the
      // EFFECTIVE state (`!== false`) rather than the raw value. Negating the raw
      // value made the first click a no-op (undefined -> true, both render as
      // selected), so deselecting required two clicks.
      [sourceId]: prev[sourceId] === false,
    }))
  }

  // The selected set is "every source the backend offers, minus the ones the
  // user explicitly deselected". Deriving it from the source list (rather than
  // from explicit entries only) keeps the request in step with what the cards
  // display: without this, deselecting a single source left no truthy entries
  // and the request fell back to the backend default of "all sources".
  const activeSources = (sources ?? [])
    .map(s => s.source)
    .filter(id => selectedSources[id] !== false) as ResearchInputSourcesItem[]

  // At least one source must be selected. The backend treats an absent/empty
  // `sources` as "all sources", so submitting with none selected would silently
  // run everything the user just turned off. Guard it in the UI instead.
  const hasNoSources = (sources?.length ?? 0) > 0 && activeSources.length === 0

  const handleRun = () => {
    if (!matterId) {
      toast({ title: "Matter required", description: "You must bind this research to a matter.", variant: "destructive" })
      return
    }
    if (!query.trim()) {
      toast({ title: "Query required", description: "Please enter a research query.", variant: "destructive" })
      return
    }
    if (hasNoSources) {
      toast({
        title: "No research sources selected",
        description: "Select at least one research source to run this query.",
        variant: "destructive",
      })
      return
    }

    performMutation.mutate(
      { 
        data: { 
          matterId: Number(matterId), 
          query,
          sources: activeSources
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
    <div className="space-y-5">
      {/* ── Primary card ───────────────────────────────────────────────────── */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.border}`, background: T.surfaceB }}>
          <h2 className="text-[15px] font-semibold" style={{ color: T.text }}>New Research Run</h2>
          <p className="mt-0.5 text-[12px]" style={{ color: T.textDim }}>
            Ask a legal question and get clear, sourced, AI-assisted answers.
          </p>
        </div>

        <div className="px-5 py-6 space-y-6">
          {!preselectedMatterId && (
            <div className="space-y-2 max-w-sm">
              <label htmlFor="research-matter" style={labelStyle}>Matter</label>
              <Select value={matterId} onValueChange={setMatterId}>
                <SelectTrigger id="research-matter" aria-label="Matter" className="h-9 text-[13px]" style={fieldStyle}>
                  <SelectValue placeholder="Select a matter..." />
                </SelectTrigger>
                <SelectContent>
                  {matters?.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.reference} - {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="research-question" style={labelStyle}>Research question</label>
            <Textarea 
              id="research-question"
              aria-label="Research question"
              placeholder="E.g. What are the notification requirements for terminating a commercial lease under the new Property Act?"
              className="min-h-[132px] resize-y py-3 px-4 text-[13px] leading-relaxed placeholder:opacity-70"
              style={fieldStyle}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <span style={labelStyle}>Data sources</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sources?.map(src => {
                const isActive = selectedSources[src.source] !== false // Default true if undefined
                const Icon = SOURCE_ICONS[src.source] ?? FileText
                const description = SOURCE_DESCRIPTIONS[src.source]
                return (
                  <button
                    key={src.source}
                    type="button"
                    role="checkbox"
                    aria-checked={isActive}
                    onClick={() => toggleSource(src.source)}
                    className="flex w-full items-start gap-3 p-3.5 text-left transition-colors"
                    style={{
                      background: isActive ? `color-mix(in srgb, ${GOLD} 7%, ${T.surface})` : T.surfaceB,
                      border: `1px solid ${isActive ? `color-mix(in srgb, ${GOLD} 55%, ${T.border})` : T.border}`,
                      borderRadius: 8,
                    }}
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center"
                      style={{
                        borderRadius: 6,
                        background: isActive ? `color-mix(in srgb, ${GOLD} 14%, transparent)` : T.surfaceEl,
                        color: isActive ? GOLD : T.textFaint,
                      }}
                      aria-hidden="true"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: isActive ? T.text : T.textDim }}>
                          {src.label}
                        </span>
                        {src.live ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
                            style={{
                              color: T.ok,
                              background: `color-mix(in srgb, ${T.ok} 10%, transparent)`,
                              border: `1px solid color-mix(in srgb, ${T.ok} 28%, transparent)`,
                              borderRadius: 4,
                            }}
                          >
                            <Check className="h-2.5 w-2.5" aria-hidden="true" /> Available
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
                            style={{
                              color: T.warn,
                              background: `color-mix(in srgb, ${T.warn} 12%, transparent)`,
                              border: `1px solid color-mix(in srgb, ${T.warn} 30%, transparent)`,
                              borderRadius: 4,
                            }}
                          >
                            <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" /> Phase 1D
                          </span>
                        )}
                      </span>

                      {description && (
                        <span className="mt-1 block text-[11px] leading-snug" style={{ color: T.textDim }}>
                          {description}
                        </span>
                      )}

                      {!src.live && (
                        <span className="mt-1 block text-[10px] leading-snug" style={{ color: T.textFaint }}>
                          {src.availability}
                        </span>
                      )}
                    </span>

                    {/* Selection indicator: shape + text for the screen reader,
                        never colour alone. */}
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      {isActive ? (
                        <span
                          className="flex h-4 w-4 items-center justify-center"
                          style={{ borderRadius: 4, background: GOLD, color: "#fff" }}
                        >
                          <Check className="h-3 w-3" />
                        </span>
                      ) : (
                        <span className="block h-4 w-4" style={{ border: `1px solid ${T.border}`, borderRadius: 4 }} />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {hasNoSources && (
              <p
                role="alert"
                data-testid="research-sources-error"
                className="flex items-center gap-1.5 text-[11px] font-medium"
                style={{ color: T.warn }}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                Select at least one research source.
              </p>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-3 px-5 py-4"
          style={{ borderTop: `1px solid ${T.border}`, background: T.surfaceB }}
        >
          <Button
            type="button"
            onClick={handleRun}
            disabled={performMutation.isPending || hasNoSources}
            title={hasNoSources ? "Select at least one research source" : undefined}
            className="gap-2"
            style={{ background: GOLD, color: "#1b1a17" }}
          >
            {performMutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Analysing corpus...</>
            ) : (
              <><Search className="h-3.5 w-3.5" aria-hidden="true" /> Run Research</>
            )}
          </Button>
        </div>
      </div>

      {/* ── Trust row (static information; describes existing behaviour) ────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, title: "Traceable", body: "Each record keeps its question, sources and confidence score." },
          { icon: Building2, title: "Matter governed", body: "Research is always bound to a matter." },
          { icon: Library, title: "Internal and external sources", body: "Firm precedents and the knowledge base are active; case law and legislation are Phase 1D." },
        ].map(item => (
          <div key={item.title} className="flex items-start gap-3 px-4 py-3" style={{ background: T.surfaceB, border: `1px solid ${T.border}`, borderRadius: 8 }}>
            <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: T.textFaint }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold" style={{ color: T.text }}>{item.title}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: T.textDim }}>{item.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
