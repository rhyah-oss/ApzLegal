import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  Bot, FileText, BookOpen, Mail, MessageSquare, Scale, FileCheck,
  ChevronRight, ShieldAlert, Shield, ShieldCheck, AlertTriangle, ArrowLeft
} from "lucide-react"
import { 
  useGenerateAiOutput, useListMatters, getListMattersQueryKey,
  getListAiConversationsQueryKey, type AiGenerateInputWorkflow
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

export const AI_WORKFLOWS: { 
  id: AiGenerateInputWorkflow; 
  label: string; 
  purpose: string; 
  risk: "low" | "medium" | "high";
  icon: any;
}[] = [
  { id: "draft_contract", label: "Draft Contract", purpose: "Generate a standard commercial agreement", risk: "medium", icon: FileText },
  { id: "analyse_clause", label: "Analyse Clause", purpose: "Review specific contractual wording for risks", risk: "medium", icon: FileCheck },
  { id: "legal_research", label: "Legal Research", purpose: "Query case law and legislation (requires review)", risk: "high", icon: BookOpen },
  { id: "draft_email", label: "Draft Email", purpose: "Compose correspondence to clients or opposing counsel", risk: "low", icon: Mail },
  { id: "summarise_matter", label: "Summarise Matter", purpose: "Condense matter correspondence and documents", risk: "low", icon: MessageSquare },
  { id: "matter_summary", label: "Generate Matter Summary", purpose: "Create a high-level overview of the matter status", risk: "low", icon: Scale },
]

export function getRiskBadge(risk: string) {
  if (risk === "low") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 tracking-wide uppercase"><ShieldCheck className="h-3 w-3" /> Low Risk</span>
  if (risk === "medium") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 tracking-wide uppercase"><Shield className="h-3 w-3" /> Med Risk</span>
  if (risk === "high") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-500 border border-red-500/20 tracking-wide uppercase"><ShieldAlert className="h-3 w-3" /> High Risk</span>
  return null
}

const CLAUSE_TYPES = [
  "Indemnity",
  "Force Majeure",
  "Dispute Resolution/Arbitration",
  "Confidentiality",
  "POPIA Data Protection",
  "Termination",
  "Restraint of Trade"
]

export function AiWorkflowLauncher({ 
  fixedMatterId,
  onGenerated
}: { 
  fixedMatterId?: number
  onGenerated?: (id: number) => void
}) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<AiGenerateInputWorkflow | null>(null)
  
  const { data: matters } = useListMatters({}, { query: { enabled: !fixedMatterId, queryKey: getListMattersQueryKey({}) } })
  
  const handleSelect = (wf: AiGenerateInputWorkflow) => {
    setSelectedWorkflow(wf)
  }

  if (!selectedWorkflow) {
    return (
      <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm animate-in fade-in duration-300">
        <div className="hidden md:grid grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_minmax(150px,1.5fr)_auto] gap-4 p-3 border-b border-border bg-secondary/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="pl-3">Workflow & Purpose</div>
          <div>Risk Level</div>
          <div>Governance</div>
          <div className="pr-3 text-right">Action</div>
        </div>
        <div className="divide-y divide-border">
          {AI_WORKFLOWS.map((wf) => {
            const Icon = wf.icon
            return (
              <div 
                key={wf.id}
                className="grid grid-cols-1 md:grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_minmax(150px,1.5fr)_auto] gap-3 md:gap-4 p-4 items-start md:items-center hover:bg-secondary/30 transition-colors group cursor-pointer"
                onClick={() => handleSelect(wf.id)}
              >
                <div className="flex gap-3 items-start md:pl-3">
                  <div className="mt-0.5 p-1.5 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{wf.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug pr-4">{wf.purpose}</div>
                  </div>
                </div>
                <div className="pl-11 md:pl-0 flex items-center">
                   {getRiskBadge(wf.risk)}
                </div>
                <div className="pl-11 md:pl-0">
                   {wf.risk === "high" ? (
                     <span className="text-[11px] font-medium text-red-500 flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5"/> Attorney Review Req.</span>
                   ) : wf.risk === "medium" ? (
                     <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5"><Shield className="h-3.5 w-3.5"/> Review Recommended</span>
                   ) : (
                     <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5"/> Standard Logging</span>
                   )}
                </div>
                <div className="md:pr-3 md:text-right hidden md:block">
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-primary hover:bg-primary/10 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    Configure <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <button 
        onClick={() => setSelectedWorkflow(null)} 
        className="text-[11px] font-medium text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 transition-colors uppercase tracking-wider"
      >
        <ArrowLeft className="h-3 w-3" /> Back to Workflows
      </button>
      
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-md">
        <div className="px-5 md:px-8 py-6 border-b border-border bg-secondary/20 flex items-start justify-between">
          <div className="flex gap-4 items-center">
             <div className="p-2.5 rounded-lg bg-primary/10 text-primary shadow-inner">
                {(() => {
                  const Icon = AI_WORKFLOWS.find(w => w.id === selectedWorkflow)?.icon || Bot;
                  return <Icon className="h-6 w-6" />
                })()}
             </div>
             <div>
               <h2 className="text-xl font-semibold text-foreground tracking-tight">{AI_WORKFLOWS.find(w => w.id === selectedWorkflow)?.label}</h2>
               <p className="text-sm text-muted-foreground mt-0.5">{AI_WORKFLOWS.find(w => w.id === selectedWorkflow)?.purpose}</p>
             </div>
          </div>
          <div className="pt-1 hidden md:block">
            {getRiskBadge(AI_WORKFLOWS.find(w => w.id === selectedWorkflow)?.risk || "")}
          </div>
        </div>

        <div className="p-5 md:p-8">
          <WorkflowForm 
            workflow={selectedWorkflow} 
            fixedMatterId={fixedMatterId} 
            matters={matters || []} 
            onGenerated={onGenerated} 
          />
        </div>
      </div>
    </div>
  )
}

function WorkflowForm({ 
  workflow, 
  fixedMatterId, 
  matters,
  onGenerated
}: { 
  workflow: AiGenerateInputWorkflow
  fixedMatterId?: number
  matters: any[]
  onGenerated?: (id: number) => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const [matterId, setMatterId] = useState<string>(fixedMatterId ? String(fixedMatterId) : "")
  const [instructions, setInstructions] = useState("")
  
  // Contract
  const [contractType, setContractType] = useState("")
  const [jurisdiction, setJurisdiction] = useState("South Africa")
  const [selectedClauses, setSelectedClauses] = useState<string[]>([])
  
  // Email
  const [recipient, setRecipient] = useState("")
  const [purpose, setPurpose] = useState("")
  
  // Clause / Research
  const [textInput, setTextInput] = useState("")

  const generateOutput = useGenerateAiOutput()
  const wfConfig = AI_WORKFLOWS.find(w => w.id === workflow)!

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!matterId) {
      toast({ title: "Matter required", description: "All governed AI workflows must be bound to a Matter.", variant: "destructive" })
      return
    }

    let params: Record<string, any> = {}
    
    if (workflow === "draft_contract") {
      if (!contractType) { toast({ title: "Missing field", description: "Please provide a contract type.", variant: "destructive" }); return }
      params = { contractType, jurisdiction, clauses: selectedClauses }
    } else if (workflow === "draft_email") {
      if (!recipient || !purpose) { toast({ title: "Missing fields", description: "Please provide recipient and purpose.", variant: "destructive" }); return }
      params = { recipient, purpose }
    } else if (workflow === "analyse_clause") {
      if (!textInput) { toast({ title: "Missing field", description: "Please provide the clause text.", variant: "destructive" }); return }
      params = { clauseText: textInput }
    } else if (workflow === "legal_research") {
      if (!textInput) { toast({ title: "Missing field", description: "Please provide the research query.", variant: "destructive" }); return }
      params = { query: textInput }
    }

    generateOutput.mutate({
      data: {
        workflow,
        matterId: Number(matterId),
        instructions: instructions || undefined,
        params
      }
    }, {
      onSuccess: (res) => {
        toast({ title: "Generation complete", description: "AI output has been generated." })
        queryClient.invalidateQueries({ queryKey: getListAiConversationsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getListAiConversationsQueryKey({ matterId: Number(matterId) }) })
        if (onGenerated) onGenerated(res.id)
      },
      onError: (err: any) => {
        toast({ 
          title: "Generation failed", 
          description: err?.data?.error || err?.message || "Could not generate AI output.", 
          variant: "destructive" 
        })
      }
    })
  }

  const toggleClause = (clause: string) => {
    setSelectedClauses(prev => 
      prev.includes(clause) ? prev.filter(c => c !== clause) : [...prev, clause]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Matter Context */}
      {!fixedMatterId && (
        <div className="space-y-3 p-5 rounded-lg bg-secondary/30 border border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Matter Context *</label>
              <p className="text-xs text-muted-foreground/80 leading-snug">All AI generations are traceably bound to a matter for compliance purposes.</p>
            </div>
            <div className="w-full sm:w-[300px] shrink-0">
              <Select value={matterId} onValueChange={setMatterId}>
                <SelectTrigger className="bg-background border-border shadow-sm">
                  <SelectValue placeholder="Select a matter..." />
                </SelectTrigger>
                <SelectContent>
                  {matters?.map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.reference} — {m.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Field sections */}
      <div className="space-y-6">
        {workflow === "draft_contract" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Contract Type *</label>
                <Input value={contractType} onChange={e => setContractType(e.target.value)} placeholder="e.g. NDA, Service Agreement" className="bg-background border-border" />
             </div>
             <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Jurisdiction *</label>
                <Input value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} className="bg-background border-border" />
             </div>
             <div className="space-y-3 md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Key Clauses</label>
                <div className="flex flex-wrap gap-2">
                  {CLAUSE_TYPES.map(clause => (
                    <button
                      type="button"
                      key={clause}
                      onClick={() => toggleClause(clause)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        selectedClauses.includes(clause) 
                          ? "bg-primary/10 border-primary text-primary font-medium" 
                          : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/40 hover:bg-secondary/50"
                      }`}
                    >
                      {clause}
                    </button>
                  ))}
                </div>
             </div>
          </div>
        )}

        {workflow === "draft_email" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recipient *</label>
              <Input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. Opposing Counsel" className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Purpose *</label>
              <Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Request extension" className="bg-background border-border" />
            </div>
          </div>
        )}

        {(workflow === "analyse_clause" || workflow === "legal_research") && (
          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {workflow === "analyse_clause" ? "Clause Text *" : "Research Query / Topic *"}
            </label>
            <Textarea 
              value={textInput} 
              onChange={e => setTextInput(e.target.value)} 
              className="bg-background border-border min-h-[140px] text-sm leading-relaxed resize-y font-serif"
              placeholder={workflow === "analyse_clause" ? "Paste the clause here..." : "Enter your legal research query..."}
            />
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-border/50">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Additional Instructions (Optional)</label>
          <Textarea 
            value={instructions} 
            onChange={e => setInstructions(e.target.value)} 
            placeholder="Specific tone, formatting, or constraints..." 
            className="bg-background border-border min-h-[80px] text-sm resize-y"
          />
        </div>
      </div>

      {wfConfig.risk === "high" && (
        <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-lg flex items-start gap-3 text-red-500 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">High Risk Workflow — Review Mandatory</p>
            <p className="text-red-500/80 leading-snug">This output is informational only and does not constitute a legal opinion. Human review by a qualified attorney is mandatory before saving to the matter or taking action.</p>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-6 border-t border-border">
        <Button 
          type="submit" 
          disabled={!matterId || generateOutput.isPending}
          className="h-10 px-8 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-medium text-sm transition-all active:scale-[0.98] w-full md:w-auto"
        >
          {generateOutput.isPending ? "Processing..." : `Run ${wfConfig.label}`}
        </Button>
      </div>
    </form>
  )
}
