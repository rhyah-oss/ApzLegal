import { visiblePrompt, uniqueSources } from "@/lib/ai-presentation"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  CheckCircle2, 
  AlertTriangle, 
  Save, 
  ExternalLink,
  Info,
  Search,
  Bot
} from "lucide-react"
import { Link } from "wouter"
import { 
  useGetAiOutput, 
  useReviewAiOutput,
  useVerifyAiCitations,
  useSaveAiOutputToMatter,
  getGetAiOutputQueryKey,
  getListAiConversationsQueryKey,
  getListAuditLogsQueryKey,
  getGetMatterTimelineQueryKey,
  getListMatterDocumentsQueryKey,
  getListAllDocumentsQueryKey
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { PageLoader } from "@/components/ui/loader"
import { getRiskBadge } from "./AiWorkflowLauncher"

export function AiOutputView({ 
  outputId,
  onClose
}: { 
  outputId: number 
  onClose?: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const { data: output, isLoading } = useGetAiOutput(outputId, { 
    query: { enabled: !!outputId, queryKey: getGetAiOutputQueryKey(outputId) } 
  })

  const reviewMutation = useReviewAiOutput()
  const verifyMutation = useVerifyAiCitations()
  const saveMutation = useSaveAiOutputToMatter()

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewNote, setReviewNote] = useState("")
  const [reviewDecision, setReviewDecision] = useState<"reviewed" | "overridden">("reviewed")

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveContent, setSaveContent] = useState("")

  if (isLoading) return <PageLoader />
  if (!output) return <div className="p-6 text-muted-foreground">Output not found.</div>

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetAiOutputQueryKey(outputId) })
    queryClient.invalidateQueries({ queryKey: getListAiConversationsQueryKey() })
    if (output.matterId) {
      queryClient.invalidateQueries({ queryKey: getListAiConversationsQueryKey({ matterId: output.matterId }) })
      queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey({ matterId: output.matterId }) })
      queryClient.invalidateQueries({ queryKey: getGetMatterTimelineQueryKey(output.matterId) })
      queryClient.invalidateQueries({ queryKey: getListMatterDocumentsQueryKey(output.matterId) })
    }
    queryClient.invalidateQueries({ queryKey: getListAllDocumentsQueryKey() })
  }

  const handleReview = () => {
    if (reviewDecision === "overridden" && !reviewNote.trim()) {
      toast({ title: "Note required", description: "Please provide a reason for overriding.", variant: "destructive" })
      return
    }
    reviewMutation.mutate({ id: outputId, data: { decision: reviewDecision, note: reviewNote || undefined } }, {
      onSuccess: () => {
        toast({ title: "Review recorded" })
        setReviewOpen(false)
        invalidateAll()
      },
      onError: (err: any) => toast({ title: "Failed to save review", description: err?.data?.error || err?.message, variant: "destructive" })
    })
  }

  const handleVerifyCitations = () => {
    verifyMutation.mutate({ id: outputId }, {
      onSuccess: () => {
        toast({ title: "Citations verified" })
        invalidateAll()
      },
      onError: (err: any) => toast({ title: "Verification failed", description: err?.data?.error || err?.message, variant: "destructive" })
    })
  }

  const handleSaveToMatter = () => {
    saveMutation.mutate({ id: outputId, data: { content: saveContent } }, {
      onSuccess: () => {
        toast({ title: "Saved to Matter", description: "Created a new governed document draft." })
        setSaveOpen(false)
        invalidateAll()
      },
      onError: (err: any) => toast({ title: "Failed to save", description: err?.data?.error || err?.message, variant: "destructive" })
    })
  }

  const openSaveDialog = () => {
    setSaveContent(output.response)
    setSaveOpen(true)
  }

  const isSaveBlocked = output.riskLevel === "high" && output.reviewStatus === "pending"

  return (
    <div className="flex flex-col h-full bg-background relative z-0">
      {/* Header */}
      <header className="flex-none px-6 py-4 border-b border-border bg-card flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground border-border bg-secondary/50">
              {output.workflowLabel}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-medium">Requested by {output.requestedBy} • {new Date(output.createdAt).toLocaleString()}</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">{output.title || "AI Output"}</h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs text-muted-foreground hover:text-foreground">
            Close View
          </Button>
        )}
      </header>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Main Content - Editorial View */}
        <div className="flex-1 overflow-y-auto bg-background px-6 md:px-12 py-8">
          <div className="max-w-3xl mx-auto space-y-10">
            {/* Query */}
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/40 rounded-full" />
              <div className="pl-5">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Original Prompt</h3>
                <p className="text-sm text-foreground/90 leading-relaxed">{visiblePrompt(output)}</p>
              </div>
            </div>

            <div className="w-12 h-px bg-border" />

            {/* Response */}
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                <Bot className="h-3.5 w-3.5" /> Generated Response
              </h3>
              <div className="prose prose-invert prose-blue max-w-none text-foreground/90 text-[15px] leading-[1.8] font-serif whitespace-pre-wrap selection:bg-primary/30">
                {output.response}
              </div>
            </div>
          </div>
        </div>

        {/* Governance Panel */}
        <div className="w-full md:w-[320px] shrink-0 bg-card border-t md:border-t-0 md:border-l border-border overflow-y-auto flex flex-col">
          <div className="p-5 flex-1 space-y-6">
            
            {/* Governance Action Block */}
            <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-4 shadow-sm">
              <div className="flex justify-between items-start">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Governance State</h4>
                {getRiskBadge(output.riskLevel)}
              </div>
              
              {output.reviewStatus === "pending" ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-amber-500 bg-amber-500/10 p-2.5 rounded text-xs border border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p className="leading-snug">Pending human review. Must be reviewed before saving to matter.</p>
                  </div>
                  <Button onClick={() => setReviewOpen(true)} className="w-full h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white border-0">
                    Review Output
                  </Button>
                </div>
              ) : output.reviewStatus === "reviewed" ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-emerald-500 bg-emerald-500/10 p-2.5 rounded text-xs border border-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <p className="leading-snug">Reviewed by {output.reviewedBy || "Attorney"}.</p>
                  </div>
                  {!output.documentId ? (
                    <Button onClick={openSaveDialog} disabled={isSaveBlocked} className="w-full h-8 text-xs shadow-md border-0 bg-primary text-primary-foreground hover:bg-primary/90">
                      <Save className="h-3.5 w-3.5 mr-2" /> Save to Matter
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full h-8 text-xs border-border text-foreground hover:bg-secondary" asChild>
                      <Link href={`/matters/${output.matterId}/documents/${output.documentId}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-2" /> View Draft Document
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-blue-500 bg-blue-500/10 p-2.5 rounded text-xs border border-blue-500/20">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <p className="leading-snug">Overridden by {output.reviewedBy || "Attorney"}. Reason logged.</p>
                  </div>
                  {!output.documentId && (
                    <Button onClick={openSaveDialog} disabled={isSaveBlocked} className="w-full h-8 text-xs shadow-md border-0 bg-primary text-primary-foreground hover:bg-primary/90">
                      <Save className="h-3.5 w-3.5 mr-2" /> Save to Matter
                    </Button>
                  )}
                </div>
              )}
            </div>

              {/* Evidence & Context */}
             <div className="space-y-4">
               <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5">Evidence & Context</h4>
               
               {/* RAG Retrieval Info */}
               {(output.retrievalMode || (output.chunksRetrieved ?? 0) > 0) && (
                 <div className="space-y-2">
                   <div className="flex items-center justify-between text-xs">
                     <span className="text-foreground font-medium">Retrieval</span>
                     <span className="text-[10px] text-muted-foreground font-mono">{output.retrievalMode || "none"}</span>
                   </div>
                   {(output.chunksRetrieved ?? 0) > 0 && (
                     <div className="text-[11px] text-muted-foreground">
                       {output.chunksRetrieved} chunk(s) retrieved from authorised sources
                     </div>
                   )}
                   {output.sourcesUsed && output.sourcesUsed.length > 0 && (
                     <div className="flex flex-wrap gap-1.5 pt-1">
                       {uniqueSources(output.sourcesUsed).map((s: any, i: number) => (
                         <Badge key={i} variant="outline" className="text-[9px] border-border text-muted-foreground">
                           {s.type} {s.title ? `(${s.title})` : `#${s.id}`} {s.chunkCount ? `×${s.chunkCount}` : ""}
                         </Badge>
                       ))}
                     </div>
                   )}
                 </div>
               )}

               <div className="space-y-2">
                 <div className="flex items-center justify-between text-xs">
                   <span className="text-foreground font-medium">Sources Cited</span>
                   {output.citationStatus === "verified" ? (
                     <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> Verified</span>
                   ) : (
                     <span className="text-[10px] text-amber-500 font-medium">Unverified</span>
                   )}
                 </div>
                 {output.citations && output.citations.length > 0 ? (
                   <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-3.5 marker:text-border">
                     {output.citations.map((c, i) => <li key={i}>{c}</li>)}
                   </ul>
                 ) : (
                   <div className="text-[11px] text-muted-foreground/60 italic">No specific sources cited.</div>
                 )}
                 
                 {output.citations && output.citations.length > 0 && output.citationStatus === "unverified" && (
                   <Button variant="outline" size="sm" onClick={handleVerifyCitations} disabled={verifyMutation.isPending} className="w-full mt-2 h-7 text-[10px] border-border bg-transparent text-muted-foreground hover:text-foreground">
                     <Search className="h-3 w-3 mr-1.5" /> Verify Citations
                   </Button>
                 )}
               </div>

               <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
                 <div>
                   <span className="block text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Confidence</span>
                   <span className="text-sm font-mono text-foreground">
                     {output.confidenceScore !== null && output.confidenceScore !== undefined ? `${Math.round(output.confidenceScore)}%` : "N/A"}
                   </span>
                 </div>
                 <div>
                   <span className="block text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Model</span>
                   <span className="text-xs font-mono text-foreground">{output.model || "Unknown"}</span>
                 </div>
               </div>

               {output.explanation && (
                 <div className="pt-3 border-t border-border/50">
                   <Collapsible className="group">
                     <CollapsibleTrigger className="text-[10px] uppercase tracking-widest text-muted-foreground group-hover:text-foreground flex items-center justify-between w-full transition-colors">
                       <span>Model Reasoning</span>
                       <Info className="h-3 w-3" />
                     </CollapsibleTrigger>
                     <CollapsibleContent className="pt-2 text-[11px] text-muted-foreground leading-relaxed">
                       {output.explanation}
                     </CollapsibleContent>
                   </Collapsible>
                 </div>
               )}
             </div>

          </div>
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="border-border bg-card shadow-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Review AI Output</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Record your review of this AI-generated content. Overriding requires a reason for the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-4">
              <Button 
                variant={reviewDecision === "reviewed" ? "default" : "outline"}
                className={reviewDecision === "reviewed" ? "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent" : "border-border text-foreground hover:bg-secondary"}
                onClick={() => setReviewDecision("reviewed")}
              >
                Approve (Reviewed)
              </Button>
              <Button 
                variant={reviewDecision === "overridden" ? "default" : "outline"}
                className={reviewDecision === "overridden" ? "bg-blue-600 hover:bg-blue-700 text-white border-transparent" : "border-border text-foreground hover:bg-secondary"}
                onClick={() => setReviewDecision("overridden")}
              >
                Override
              </Button>
            </div>
            {(reviewDecision === "overridden" || reviewDecision === "reviewed") && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Review Note {reviewDecision === "overridden" && "*"}</label>
                <Textarea 
                  value={reviewNote} 
                  onChange={e => setReviewNote(e.target.value)} 
                  placeholder={reviewDecision === "overridden" ? "Why is this being overridden?" : "Optional review comments..."}
                  className="bg-background border-border"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)} className="border-border text-foreground">Cancel</Button>
            <Button onClick={handleReview} disabled={reviewMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">Save Review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-2xl border-border bg-card shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Save to Matter</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will create a new document draft in the matter. You may edit the content before saving. Edited content will be marked as "AI Assisted".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea 
              value={saveContent} 
              onChange={e => setSaveContent(e.target.value)} 
              className="min-h-[300px] font-mono text-sm bg-background border-border"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} className="border-border text-foreground">Cancel</Button>
            <Button onClick={handleSaveToMatter} disabled={saveMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">Save as Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
