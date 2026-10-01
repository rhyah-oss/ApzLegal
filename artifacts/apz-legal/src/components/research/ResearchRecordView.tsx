import { useState, type CSSProperties } from "react"
import { BookOpen, AlertTriangle, ShieldCheck, CheckCircle2, FileText, ChevronRight, Scale, Search, ShieldAlert, BadgeInfo, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Link } from "wouter"
import { 
  type ResearchRecord,
  useSaveResearchToMatter,
  getListResearchQueryKey,
  getGetResearchQueryKey,
  getGetMatterTimelineQueryKey,
  getListAuditLogsQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { T } from "@/lib/theme"

/** APZ gold accent (existing design token). */
const GOLD = "var(--ref-gold)"

const sectionLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: T.textFaint,
}

const card: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 10,
}

export function ResearchRecordView({ record, onClose }: { record: ResearchRecord; onClose?: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const saveMutation = useSaveResearchToMatter()
  const [tab, setTab] = useState("answer")

  const handleSave = () => {
    saveMutation.mutate({ id: record.id }, {
      onSuccess: () => {
        toast({ title: "Saved to matter", description: "This research is now part of the formal matter record." })
        queryClient.invalidateQueries({ queryKey: getListResearchQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetResearchQueryKey(record.id) })
        if (record.matterId) {
          queryClient.invalidateQueries({ queryKey: getGetMatterTimelineQueryKey(record.matterId) })
          queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey({ matterId: record.matterId }) })
        }
      },
      onError: (err: any) => {
        if (err?.status === 409) {
          toast({ title: "Already saved", description: "This research record is already saved to the matter.", variant: "destructive" })
        } else {
          toast({ title: "Failed to save", description: err?.data?.error || err?.message, variant: "destructive" })
        }
      }
    })
  }

  const internalHits = record.internalResults || []
  const precedents = internalHits.filter(h => h.source === "firm_precedents")
  const otherInternal = internalHits.filter(h => h.source !== "firm_precedents")
  const citations = record.citations || []

  return (
    <div className="flex flex-col h-full" style={{ background: T.bg }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        {/* Breadcrumb */}
        <div className="mb-2 flex items-center gap-1.5 text-[11px]" style={{ color: T.textFaint }}>
          <button
            type="button"
            onClick={onClose}
            className="transition-colors hover:underline"
            style={{ color: T.textDim }}
          >
            Research
          </button>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="truncate" style={{ color: T.textDim }}>{record.query}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span style={{ ...sectionLabel, color: GOLD }}>Research Record</span>
              {record.savedToMatter && (
                <Badge variant="outline" className="gap-1 text-[10px]" style={{ color: T.ok, borderColor: `color-mix(in srgb, ${T.ok} 30%, transparent)`, background: `color-mix(in srgb, ${T.ok} 10%, transparent)` }}>
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Saved to matter
                </Badge>
              )}
            </div>
            <h2 className="text-[17px] font-semibold leading-snug" style={{ color: T.text }}>{record.query}</h2>
            <p className="mt-1 text-[11px]" style={{ color: T.textDim }}>
              Performed by {record.performedBy || "Unknown"} on {new Date(record.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!record.savedToMatter ? (
              <Button
                type="button"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="gap-1.5"
                style={{ background: GOLD, color: "#1b1a17" }}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Save to matter
              </Button>
            ) : (
              <Badge variant="outline" className="gap-1 text-[10px]" style={{ color: T.ok, borderColor: `color-mix(in srgb, ${T.ok} 30%, transparent)` }}>
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Saved
              </Badge>
            )}
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs + body ────────────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5" style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}>
          <TabsList className="h-9 gap-1 bg-transparent p-0">
            <TabsTrigger
              value="answer"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[var(--apz-text-dim)] data-[state=active]:border-[var(--ref-gold)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--apz-text)] data-[state=active]:shadow-none"
            >
              Answer
            </TabsTrigger>
            <TabsTrigger
              value="sources"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[var(--apz-text-dim)] data-[state=active]:border-[var(--ref-gold)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--apz-text)] data-[state=active]:shadow-none"
            >
              Sources ({citations.length + internalHits.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-6 p-5 lg:flex-row">
            {/* ── Main column ────────────────────────────────────────────── */}
            <div className="min-w-0 flex-1 space-y-6">
              <TabsContent value="answer" className="mt-0 space-y-6">
                {/* AI Analysis */}
                <section style={card} className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${T.border}`, background: T.surfaceB }}>
                    <h3 className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: T.text }}>
                      <Search className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden="true" /> AI Analysis
                    </h3>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        color: T.warn,
                        background: `color-mix(in srgb, ${T.warn} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${T.warn} 30%, transparent)`,
                        borderRadius: 4,
                      }}
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      AI-assisted — no live case law/legislation access
                    </span>
                  </div>

                  <div className="p-5">
                    {record.aiStatus === "ok" && record.aiSummary ? (
                      <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed" style={{ color: T.text }}>
                        {record.aiSummary}
                      </div>
                    ) : (record.aiStatus === "failed" || record.aiStatus === "unavailable") ? (
                      <div
                        className="flex items-start gap-3 p-4"
                        style={{ background: `color-mix(in srgb, ${T.risk} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${T.risk} 30%, transparent)`, borderRadius: 8 }}
                      >
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: T.risk }} aria-hidden="true" />
                        <div>
                          <h4 className="text-[13px] font-semibold" style={{ color: T.risk }}>AI Analysis Unavailable</h4>
                          <p className="mt-1 text-[12.5px]" style={{ color: T.textDim }}>{record.aiError || "An unexpected error occurred during generation."}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[13px] italic" style={{ color: T.textDim }}>AI summary unavailable for this record.</p>
                    )}
                  </div>
                </section>

                {/* Case law / legislation */}
                {record.aiStatus === "ok" && ((record.caseReferences?.length ?? 0) > 0 || (record.legislation?.length ?? 0) > 0) && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {(record.caseReferences?.length ?? 0) > 0 && (
                      <section style={card} className="p-4">
                        <h4 className="mb-3 flex items-center gap-2" style={sectionLabel}>
                          <Scale className="h-3.5 w-3.5" aria-hidden="true" /> Identified case law
                        </h4>
                        <ul className="space-y-2">
                          {record.caseReferences.map((c, i) => (
                            <li key={i} className="flex items-start gap-2 text-[12.5px]" style={{ color: T.text }}>
                              <span className="mt-0.5" style={{ color: GOLD }} aria-hidden="true">•</span>
                              {c}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {(record.legislation?.length ?? 0) > 0 && (
                      <section style={card} className="p-4">
                        <h4 className="mb-3 flex items-center gap-2" style={sectionLabel}>
                          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Referenced legislation
                        </h4>
                        <ul className="space-y-2">
                          {record.legislation.map((l, i) => (
                            <li key={i} className="flex items-start gap-2 text-[12.5px]" style={{ color: T.text }}>
                              <span className="mt-0.5" style={{ color: GOLD }} aria-hidden="true">•</span>
                              {l}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sources" className="mt-0 space-y-6">
                {/* Citations */}
                <section style={card} className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.border}`, background: T.surfaceB }}>
                    <h3 className="flex items-center gap-2" style={sectionLabel}>
                      <BadgeInfo className="h-3.5 w-3.5" aria-hidden="true" /> Citations
                    </h3>
                    <CitationStatusBadge status={record.citationStatus} />
                  </div>
                  <div className="p-4">
                    {citations.length === 0 ? (
                      <p className="text-[12.5px]" style={{ color: T.textDim }}>No citations were recorded for this research.</p>
                    ) : (
                      <ul className="space-y-2">
                        {citations.map((c, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 px-3 py-2.5"
                            style={{ background: T.surfaceB, border: `1px solid ${T.borderSub ?? T.border}`, borderRadius: 8 }}
                          >
                            <span
                              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-semibold"
                              style={{ background: `color-mix(in srgb, ${GOLD} 14%, transparent)`, color: GOLD, borderRadius: 4 }}
                              aria-hidden="true"
                            >
                              {i + 1}
                            </span>
                            <span className="min-w-0 flex-1 font-mono text-[11.5px] leading-snug" style={{ color: T.text }}>{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                {/* Suggested precedents */}
                {precedents.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2" style={sectionLabel}>
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Suggested precedents
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {precedents.map(h => (
                        <Link key={h.id} href={`/knowledge`}>
                          <div className="group cursor-pointer p-4 transition-colors" style={{ ...card, borderRadius: 8 }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="text-[9px]" style={{ color: GOLD, borderColor: `color-mix(in srgb, ${GOLD} 35%, transparent)` }}>Firm precedent</Badge>
                                  <span className="text-[10px]" style={{ color: T.textFaint }}>{h.category}</span>
                                </div>
                                <h4 className="text-[13px] font-medium transition-colors group-hover:opacity-80" style={{ color: T.text }}>{h.title}</h4>
                                {h.snippet && <p className="mt-1.5 line-clamp-2 text-[11.5px]" style={{ color: T.textDim }}>{h.snippet}</p>}
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: T.textFaint }} aria-hidden="true" />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {/* Knowledge base hits */}
                {otherInternal.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2" style={sectionLabel}>
                      <BadgeInfo className="h-3.5 w-3.5" aria-hidden="true" /> Firm knowledge base
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {otherInternal.map(h => (
                        <Link key={h.id} href={`/knowledge`}>
                          <div className="group cursor-pointer p-4 transition-colors" style={{ ...card, borderRadius: 8 }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="text-[9px]" style={{ color: T.textDim, borderColor: T.border }}>{h.type.replace('_', ' ')}</Badge>
                                  <span className="text-[10px]" style={{ color: T.textFaint }}>{h.category}</span>
                                </div>
                                <h4 className="text-[13px] font-medium transition-colors group-hover:opacity-80" style={{ color: T.text }}>{h.title}</h4>
                                {h.snippet && <p className="mt-1.5 line-clamp-2 text-[11.5px]" style={{ color: T.textDim }}>{h.snippet}</p>}
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: T.textFaint }} aria-hidden="true" />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {citations.length === 0 && precedents.length === 0 && otherInternal.length === 0 && (
                  <p className="text-[12.5px]" style={{ color: T.textDim }}>No sources were recorded for this research.</p>
                )}
              </TabsContent>
            </div>

            {/* ── Summary rail ───────────────────────────────────────────── */}
            <aside className="w-full shrink-0 space-y-4 lg:w-[300px]">
              <section style={card} className="overflow-hidden">
                <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.border}`, background: T.surfaceB }}>
                  <h3 style={sectionLabel}>Research summary</h3>
                </div>
                <dl className="divide-y" style={{ borderColor: T.border }}>
                  <div className="px-4 py-3">
                    <dt style={sectionLabel}>Data sources</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">
                      {record.sourcesRequested.map(s => (
                        <span
                          key={s}
                          className="px-2 py-0.5 text-[10px] font-medium"
                          style={{ color: T.textDim, background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 20 }}
                        >
                          {s.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </dd>
                  </div>

                  {record.aiStatus === "ok" && (
                    <>
                      <div className="flex items-center justify-between px-4 py-3">
                        <dt style={sectionLabel}>Confidence</dt>
                        <dd className="text-[15px] font-semibold tabular-nums" style={{ color: T.text }}>
                          {record.confidenceScore !== null && record.confidenceScore !== undefined ? `${record.confidenceScore}%` : "Unavailable"}
                        </dd>
                      </div>

                      <div className="flex items-center justify-between px-4 py-3">
                        <dt style={sectionLabel}>Citations</dt>
                        <dd className="flex items-center gap-2">
                          <span className="text-[12.5px] font-medium" style={{ color: T.text }}>
                            {citations.length} source{citations.length === 1 ? "" : "s"}
                          </span>
                          <CitationStatusBadge status={record.citationStatus} />
                        </dd>
                      </div>

                      <div className="flex items-center justify-between px-4 py-3">
                        <dt style={sectionLabel}>Model</dt>
                        <dd className="font-mono text-[11px]" style={{ color: T.textDim }}>{record.model || "Unknown"}</dd>
                      </div>
                    </>
                  )}
                </dl>

                {citations.length > 0 && (
                  <div className="px-4 pb-4">
                    <button
                      type="button"
                      onClick={() => setTab("sources")}
                      className="text-[11px] font-semibold transition-colors hover:underline"
                      style={{ color: GOLD }}
                    >
                      View all sources
                    </button>
                  </div>
                )}
              </section>

              {record.aiStatus === "ok" && record.explanation && (
                <Collapsible style={card} className="overflow-hidden">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-[11px] font-semibold" style={{ color: T.text }}>
                    <span className="flex items-center gap-2"><Info className="h-3.5 w-3.5" aria-hidden="true" /> AI explanation</span>
                    <ChevronRight className="h-3.5 w-3.5" style={{ color: T.textFaint }} aria-hidden="true" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="whitespace-pre-wrap px-4 pb-4 text-[11.5px]" style={{ color: T.textDim, borderTop: `1px solid ${T.border}` }}>
                    <div className="pt-3">{record.explanation}</div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {record.savedToMatter && (
                <div
                  className="px-4 py-3 text-center"
                  style={{ background: `color-mix(in srgb, ${T.ok} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${T.ok} 30%, transparent)`, borderRadius: 10 }}
                >
                  <CheckCircle2 className="mx-auto mb-1 h-4 w-4" style={{ color: T.ok }} aria-hidden="true" />
                  <div className="text-[11px] font-semibold" style={{ color: T.ok }}>Saved to matter</div>
                  <div className="mt-0.5 text-[10px]" style={{ color: T.textDim }}>
                    by {record.savedBy} {record.savedAt && `on ${new Date(record.savedAt).toLocaleDateString()}`}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </Tabs>
    </div>
  )
}

function CitationStatusBadge({ status }: { status: ResearchRecord["citationStatus"] }) {
  if (status === "verified") {
    return <Badge variant="outline" className="text-[10px]" style={{ color: T.ok, borderColor: `color-mix(in srgb, ${T.ok} 30%, transparent)`, background: `color-mix(in srgb, ${T.ok} 10%, transparent)` }}>Verified</Badge>
  }
  if (status === "unverified") {
    return <Badge variant="outline" className="text-[10px]" style={{ color: T.warn, borderColor: `color-mix(in srgb, ${T.warn} 30%, transparent)`, background: `color-mix(in srgb, ${T.warn} 10%, transparent)` }}>Unverified</Badge>
  }
  return <Badge variant="outline" className="text-[10px]" style={{ color: T.textFaint, borderColor: T.border }}>None</Badge>
}
