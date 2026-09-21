import { BookOpen, AlertTriangle, ShieldCheck, CheckCircle2, Copy, FileText, ChevronRight, Scale, Search, ShieldAlert, BadgeInfo, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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

export function ResearchRecordView({ record, onClose }: { record: ResearchRecord; onClose?: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const saveMutation = useSaveResearchToMatter()

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

  return (
    <div className="flex flex-col h-full bg-[#050B1A] border border-[#162440] rounded-lg overflow-hidden relative text-[#E8EFFF]">
      {/* Header */}
      <div className="p-5 border-b border-[#162440] bg-[#0A1628] shrink-0 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="font-mono text-[10px] bg-[#4169E1]/10 text-[#4169E1] border-[#4169E1]/30">
              RESEARCH RECORD
            </Badge>
            {record.savedToMatter && (
              <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Saved to Matter
              </Badge>
            )}
          </div>
          <h2 className="text-lg font-semibold text-[#E8EFFF] mb-1">{record.query}</h2>
          <p className="text-xs text-[#6B8FBB]">
            Performed by {record.performedBy || "Unknown"} on {new Date(record.createdAt).toLocaleString()}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#6B8FBB] hover:text-[#E8EFFF] hover:bg-[#162440]">Close</Button>
        )}
      </div>

      <div className="flex-1 overflow-auto flex flex-col md:flex-row">
        {/* Main Content */}
        <div className="flex-1 p-6 space-y-8">
          
          {/* AI Analysis */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#162440] pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4169E1] flex items-center gap-2">
                <Search className="h-4 w-4" /> AI Analysis
              </h3>
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 bg-amber-500/10">
                AI-assisted — no live case law/legislation access
              </Badge>
            </div>

            {record.aiStatus === "ok" && record.aiSummary ? (
              <div className="p-5 bg-[#0A1628] rounded-md border border-[#162440] text-sm leading-relaxed whitespace-pre-wrap text-[#E8EFFF]">
                {record.aiSummary}
              </div>
            ) : (record.aiStatus === "failed" || record.aiStatus === "unavailable") ? (
              <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-md flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-red-400">AI Analysis Unavailable</h4>
                  <p className="text-sm text-red-400/80 mt-1">{record.aiError || "An unexpected error occurred during generation."}</p>
                </div>
              </div>
            ) : (
              <div className="p-5 text-sm text-[#6B8FBB] italic">AI summary unavailable for this record.</div>
            )}

            {/* Case References & Legislation */}
            {record.aiStatus === "ok" && (record.caseReferences?.length > 0 || record.legislation?.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {record.caseReferences?.length > 0 && (
                  <div className="p-4 bg-[#0A1628] border border-[#162440] rounded-md">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#6B8FBB] mb-3 flex items-center gap-2">
                      <Scale className="h-3.5 w-3.5" /> Identified Case Law
                    </h4>
                    <ul className="space-y-2">
                      {record.caseReferences.map((c, i) => (
                        <li key={i} className="text-[13px] text-[#E8EFFF] flex items-start gap-2">
                          <span className="text-[#4169E1] mt-0.5">•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {record.legislation?.length > 0 && (
                  <div className="p-4 bg-[#0A1628] border border-[#162440] rounded-md">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#6B8FBB] mb-3 flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5" /> Referenced Legislation
                    </h4>
                    <ul className="space-y-2">
                      {record.legislation.map((l, i) => (
                        <li key={i} className="text-[13px] text-[#E8EFFF] flex items-start gap-2">
                          <span className="text-[#4169E1] mt-0.5">•</span>
                          {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Internal Results - Precedents */}
          {precedents.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#162440] pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Suggested Precedents
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {precedents.map(h => (
                  <Link key={h.id} href={`/knowledge`}>
                    <div className="p-4 border border-[#162440] bg-[#0A1628] hover:border-[#00CFFF] hover:bg-[#0F1E35] transition-colors rounded-md cursor-pointer group">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge variant="outline" className="text-[9px] bg-[#00CFFF]/10 text-[#00CFFF] border-[#00CFFF]/30">Firm Precedent</Badge>
                            <span className="text-[10px] text-[#6B8FBB]">{h.category}</span>
                          </div>
                          <h4 className="text-sm font-medium text-[#E8EFFF] group-hover:text-[#00CFFF] transition-colors">{h.title}</h4>
                          {h.snippet && <p className="text-xs text-[#6B8FBB] mt-1.5 line-clamp-2">{h.snippet}</p>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-[#4A6B9A] group-hover:text-[#00CFFF]" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Internal Results - Knowledge Base */}
          {otherInternal.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#162440] pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B8FBB] flex items-center gap-2">
                  <BadgeInfo className="h-4 w-4" /> Firm Knowledge Base
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {otherInternal.map(h => (
                  <Link key={h.id} href={`/knowledge`}>
                    <div className="p-4 border border-[#162440] bg-[#0A1628] hover:border-[#4169E1] transition-colors rounded-md cursor-pointer group">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge variant="outline" className="text-[9px] bg-[#4169E1]/10 text-[#4169E1] border-[#4169E1]/30">{h.type.replace('_', ' ')}</Badge>
                            <span className="text-[10px] text-[#6B8FBB]">{h.category}</span>
                          </div>
                          <h4 className="text-sm font-medium text-[#E8EFFF] group-hover:text-[#4169E1] transition-colors">{h.title}</h4>
                          {h.snippet && <p className="text-xs text-[#6B8FBB] mt-1.5 line-clamp-2">{h.snippet}</p>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-[#4A6B9A] group-hover:text-[#4169E1]" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Metadata Sidebar */}
        <div className="w-full md:w-80 border-l border-[#162440] bg-[#0A1628] p-5 shrink-0 flex flex-col gap-6">
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#6B8FBB]">Sources Requested</h3>
            <div className="flex flex-wrap gap-1.5">
              {record.sourcesRequested.map(s => (
                <Badge key={s} variant="outline" className="text-[10px] border-[#4A6B9A] text-[#6B8FBB] bg-[#162440]/50">{s.replace(/_/g, ' ')}</Badge>
              ))}
            </div>
          </div>

          {record.aiStatus === "ok" && (
            <>
              <div className="space-y-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#6B8FBB]">Confidence</h3>
                <div className="text-lg font-mono font-medium text-[#E8EFFF]">
                  {record.confidenceScore !== null && record.confidenceScore !== undefined ? `${record.confidenceScore}%` : "Unavailable"}
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#6B8FBB]">Citations</h3>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#E8EFFF]">{record.citations?.length || 0} sources</span>
                  {record.citationStatus === "verified" ? (
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">Verified</Badge>
                  ) : record.citationStatus === "unverified" ? (
                    <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10">Unverified</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-[#162440] text-[#6B8FBB]">None</Badge>
                  )}
                </div>
                {record.citations && record.citations.length > 0 && (
                  <ul className="text-xs text-[#6B8FBB] list-disc pl-4 space-y-1">
                    {record.citations.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                )}
              </div>

              {record.explanation && (
                <Collapsible className="border border-[#162440] rounded-md">
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-xs font-medium hover:bg-[#0F1E35] transition-colors text-[#E8EFFF]">
                    <span className="flex items-center gap-2"><Info className="h-3.5 w-3.5" /> AI Explanation</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="p-3 pt-0 text-xs text-[#6B8FBB] border-t border-[#162440] bg-[#050B1A]/50 whitespace-pre-wrap">
                    {record.explanation}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#6B8FBB]">Model Context</h3>
                <div className="text-xs flex items-center gap-1.5 text-[#E8EFFF]">
                  <span className="text-[#6B8FBB]">Model:</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#162440]">{record.model || "Unknown"}</span>
                </div>
              </div>
            </>
          )}

          <div className="flex-1" />

          {/* Actions */}
          <div className="space-y-3 pt-4 border-t border-[#162440]">
            {!record.savedToMatter ? (
              <Button 
                className="w-full bg-[#4169E1] hover:bg-[#3558C8] text-white" 
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                Save to Matter
              </Button>
            ) : (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-center">
                <div className="flex justify-center mb-1"><CheckCircle2 className="h-5 w-5 text-emerald-400" /></div>
                <div className="text-[11px] font-medium text-emerald-400">Saved to Matter</div>
                <div className="text-[10px] text-emerald-400/80 mt-1">
                  by {record.savedBy} {record.savedAt && `on ${new Date(record.savedAt).toLocaleDateString()}`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
