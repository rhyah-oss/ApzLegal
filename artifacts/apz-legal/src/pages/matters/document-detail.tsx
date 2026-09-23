import { useState, useEffect, useRef } from "react"
import { useParams, Link, useLocation } from "wouter"
import {
  useGetMatterDocument,
  getGetMatterDocumentQueryKey,
  useUpdateMatterDocument,
  useListDocumentVersions,
  getListDocumentVersionsQueryKey,
  useChangeDocumentStatus,
  useApplyDocumentAiAssist,
  useSubmitDocumentForApproval,
  useDecideDocumentApproval,
  useSendDocumentForSignature,
  useMarkDocumentSigned,
  useArchiveDocument,
  useListAuditLogs,
  getListAuditLogsQueryKey,
  useGetCurrentUser,
  useGetMatter,
  customFetch,
  getGetMatterTimelineQueryKey,
  getListMatterDocumentsQueryKey,
  type DocumentStatusChangeStatus,
  type DocumentApprovalDecision,
  type DocumentAiAssistOrigin,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { PageLoader } from "@/components/ui/loader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select"
import { 
  ChevronLeft, FileText, History, FileCheck, CheckCircle2, ShieldAlert,
  Bot, Clock, User, Check, AlertTriangle, Send, Archive, Loader2, ArrowRight, Download, RotateCcw
} from "lucide-react"
import { formatDate } from "@/lib/format"
import { T, cardStyle, pillStyle } from "@/lib/theme"
import { ProviderOperationBadge } from "@/components/provider-operation-status"

const LIFECYCLE_STAGES = [
  { key: 'draft', label: 'Draft' },
  { key: 'ai_assist', label: 'AI Assist' },
  { key: 'review', label: 'Review' },
  { key: 'partner_approval', label: 'Partner Approval' },
  { key: 'client_signing', label: 'Client Signing' },
  { key: 'archived', label: 'Archived' },
] as const
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""

function formatFileSize(size: number | null | undefined): string {
  if (size == null) return "Unknown size"
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: T.surfaceEl, borderRadius: 6, padding: "5px 10px", marginBottom: 10 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: T.textDim }}>
        {children}
      </span>
    </div>
  )
}

export default function DocumentDetailPage() {
  const { matterId: mId, id: dId } = useParams()
  const matterId = Number(mId)
  const id = Number(dId)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [_, setLocation] = useLocation()
  
  const [content, setContent] = useState("")
  const [title, setTitle] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [changeSummary, setChangeSummary] = useState("")
  const [queueSignatureDialogOpen, setQueueSignatureDialogOpen] = useState(false)
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false)
  const [signerName, setSignerName] = useState("")
  const [signerEmail, setSignerEmail] = useState("")
  const initializedForId = useRef<number | null>(null)
  const [sidebarTab, setSidebarTab] = useState<"details" | "versions" | "audit">("details")
  
  const { data: user } = useGetCurrentUser()
  const { data: matter } = useGetMatter(matterId, { 
    query: { enabled: !!matterId, queryKey: ['/api/matters', matterId] } 
  })

  const { data: doc, isLoading: docLoading } = useGetMatterDocument(matterId, id, {
    query: { enabled: !!id && !!matterId, queryKey: getGetMatterDocumentQueryKey(matterId, id) }
  })

  const { data: versions } = useListDocumentVersions(matterId, id, {
    query: { enabled: !!id && !!matterId, queryKey: getListDocumentVersionsQueryKey(matterId, id) }
  })

  const { data: auditLogs, isError: auditLogsError } = useListAuditLogs({ entityType: 'document', entityId: id }, {
    query: { enabled: !!id, queryKey: getListAuditLogsQueryKey({ entityType: 'document', entityId: id }) }
  })

  const updateDoc = useUpdateMatterDocument()
  const changeStatus = useChangeDocumentStatus()
  const applyAiAssist = useApplyDocumentAiAssist()
  const submitApproval = useSubmitDocumentForApproval()
  const decideApproval = useDecideDocumentApproval()
  const sendForSig = useSendDocumentForSignature()
  const markSigned = useMarkDocumentSigned()
  const archiveDoc = useArchiveDocument()
  const verifyDocumentCitations = async () => {
    try {
      await customFetch(`/api/matters/${matterId}/documents/${id}/verify-citations`, { method: "POST" })
      invalidateAll()
      toast({ title: "Citations verified", description: "Verification has been recorded in the document audit trail." })
    } catch (err: any) {
      toast({ title: "Failed to verify citations", description: err?.data?.error || err.message, variant: "destructive" })
    }
  }

  useEffect(() => {
    if (doc && initializedForId.current !== id) {
      initializedForId.current = id
      setContent(doc.content || "")
      setTitle(doc.title)
    }
  }, [doc, id])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetMatterDocumentQueryKey(matterId, id) })
    queryClient.invalidateQueries({ queryKey: getListDocumentVersionsQueryKey(matterId, id) })
    queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey({ entityType: 'document', entityId: id }) })
    queryClient.invalidateQueries({ queryKey: getGetMatterTimelineQueryKey(matterId) })
    queryClient.invalidateQueries({ queryKey: getListMatterDocumentsQueryKey(matterId) })
  }

  const handleSave = () => {
    updateDoc.mutate({
      matterId,
      id,
      data: { title, content, changeSummary: changeSummary || undefined }
    }, {
      onSuccess: () => {
        setIsEditing(false)
        setChangeSummary("")
        invalidateAll()
        toast({ title: "Document saved", description: "Changes recorded in version history." })
      },
      onError: (err: any) => {
        const errorMsg = err?.data?.error || (typeof err?.data === 'string' ? err.data : err.message) || "Could not save document"
        toast({ title: "Failed to save", description: errorMsg, variant: "destructive" })
      }
    })
  }

  const handleStatusChange = (status: DocumentStatusChangeStatus) => {
    changeStatus.mutate({ matterId, id, data: { status } }, {
      onSuccess: () => { invalidateAll(); toast({ title: "Status updated" }) },
      onError: (err: any) => {
        const errorMsg = err?.data?.error || (typeof err?.data === 'string' ? err.data : err.message) || "Update failed"
        toast({ title: "Update failed", description: errorMsg, variant: "destructive" })
      }
    })
  }

  const [aiAssistOrigin, setAiAssistOrigin] = useState<DocumentAiAssistOrigin>('ai_assisted')
  const [aiAssistSections, setAiAssistSections] = useState("")
  
  const handleApplyAiAssist = () => {
    const sections = aiAssistSections ? [{ heading: "AI Review", origin: aiAssistOrigin, summary: aiAssistSections }] : []
    applyAiAssist.mutate({
      matterId, id, data: { origin: aiAssistOrigin, sections: sections.length ? sections as any : undefined }
    }, {
      onSuccess: () => {
        invalidateAll()
        toast({ title: "AI Assistance Recorded" })
        const closeBtn = document.querySelector('#ai-assist-dialog-close') as HTMLButtonElement
        if(closeBtn) closeBtn.click()
      },
      onError: (err: any) => {
        const errorMsg = err?.data?.error || (typeof err?.data === 'string' ? err.data : err.message) || "Failed to record AI"
        toast({ title: "Failed to record AI", description: errorMsg, variant: "destructive" })
      }
    })
  }

  const [approvalReason, setApprovalReason] = useState("")
  const handleApprovalDecision = (decision: 'approve' | 'reject' | 'request_changes') => {
    decideApproval.mutate({
      matterId, id, data: { decision: decision as any, reason: approvalReason }
    }, {
      onSuccess: () => { invalidateAll(); toast({ title: "Approval decision recorded" }); setApprovalReason(""); },
      onError: (err: any) => {
        const errorMsg = err?.data?.error || (typeof err?.data === 'string' ? err.data : err.message) || "Decision failed"
        toast({ title: "Decision failed", description: errorMsg, variant: "destructive" })
      }
    })
  }

  const isPartner = ['partner', 'managing_partner', 'admin'].includes(user?.role || '')

  if (docLoading) return <div style={{ flex: 1, background: T.bg }}><PageLoader /></div>
  if (!doc) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <p style={{ color: T.textFaint }}>Document not found</p>
    </div>
  )

  const currentStageIndex = LIFECYCLE_STAGES.findIndex(s => s.key === doc.status)
  const canEdit = ['draft', 'ai_assist', 'review'].includes(doc.status)

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: T.bg, overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "14px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setLocation(`/matters/${matterId}?tab=documents`)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, background: T.nav, border: `1px solid ${T.navBorder}`, borderRadius: 6, cursor: "pointer", color: T.navText }}>
              <ChevronLeft size={14} />
            </button>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: T.textDim, background: T.surfaceEl, padding: "2px 7px", borderRadius: 4, border: `1px solid ${T.border}` }}>
                  {doc.matterReference || matter?.reference}
                </span>
                <span style={pillStyle(T.textDim)}>{doc.documentType || 'General'}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: T.textFaint }}>v{doc.version}</span>
              </div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>{doc.title}</h1>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {doc.status === 'client_signing' && doc.signatureStatus === 'not_sent' && (
              <Dialog open={queueSignatureDialogOpen} onOpenChange={setQueueSignatureDialogOpen}>
                <DialogTrigger asChild>
                  <Button style={{ height: 32, fontSize: 12, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                    <Send className="h-3.5 w-3.5 mr-2" /> Queue Signature Request
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Queue signature request</DialogTitle>
                    <DialogDescription>The request will be saved as pending until a connected provider confirms it. No client will receive it yet.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Signer full name" />
                    <Input type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="Signer email address" />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setQueueSignatureDialogOpen(false)}>Cancel</Button>
                    <Button disabled={signerName.trim().length < 2 || !signerEmail.trim() || sendForSig.isPending}
                      style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}
                      onClick={() => sendForSig.mutate({ matterId, id, data: { signerName, signerEmail } }, {
                        onSuccess: () => { setQueueSignatureDialogOpen(false); setSignerName(""); setSignerEmail(""); invalidateAll(); toast({title:"Signature request queued", description: "The provider handoff is recorded; client delivery is not confirmed."}) },
                        onError: (err: any) => toast({ title: "Failed to queue signature request", description: err?.data?.error || err.message, variant: "destructive" })
                      })}>
                      {sendForSig.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-2" />} Queue request
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {doc.status === 'client_signing' && doc.signatureStatus === 'sent' && doc.providerOperation?.status === 'provider_confirmed' && (
              <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
                <DialogTrigger asChild>
                  <Button style={{ height: 32, fontSize: 12, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Record Signature
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record verified client signature</DialogTitle>
                    <DialogDescription>Confirm the signer's identity before recording an evidence-sealed signature record.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Signer full name" />
                    <Input type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="Signer email address" />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSignatureDialogOpen(false)}>Cancel</Button>
                    <Button disabled={!signerName.trim() || !signerEmail.trim() || markSigned.isPending}
                      style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}
                      onClick={() => markSigned.mutate({ matterId, id, data: { signerName, signerEmail, signerMethod: "staff_verified" } }, {
                        onSuccess: () => { setSignatureDialogOpen(false); invalidateAll(); toast({title:"Signature evidence recorded"}) },
                        onError: (err: any) => toast({ title: "Failed to record signature", description: err?.data?.error || err.message, variant: "destructive" })
                      })}>
                      {markSigned.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-2" />} Record signature
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {doc.status === 'client_signing' && doc.signatureStatus === 'sent' && doc.providerOperation?.status === 'failed' && (
              <Button variant="outline" onClick={async () => {
                try {
                  await customFetch(`/api/provider-operations/${doc.providerOperation?.id}/retry`, { method: "POST" })
                  invalidateAll()
                  toast({ title: "Signature request requeued", description: "A new provider attempt is pending; client delivery is not confirmed." })
                } catch (err: any) {
                  toast({ title: "Could not requeue signature request", description: err?.data?.error || err.message, variant: "destructive" })
                }
              }} style={{ height: 32, fontSize: 12 }}>
                <RotateCcw className="h-3.5 w-3.5 mr-2" /> Retry Provider Handoff
              </Button>
            )}
            {doc.status === 'client_signing' && doc.signatureStatus === 'signed' && (
              <>
                <Button asChild variant="outline" style={{ height: 32, fontSize: 12 }}>
                  <a href={`${BASE}/api/matters/${matterId}/documents/${id}/signature-certificate`}>
                    <Download className="h-3.5 w-3.5 mr-2" /> Certificate
                  </a>
                </Button>
                <Button style={{ height: 32, fontSize: 12, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}
                  onClick={() => archiveDoc.mutate({ matterId, id }, { 
                    onSuccess: () => { invalidateAll(); toast({title:"Document archived"}) },
                    onError: (err: any) => toast({ title: "Failed to archive", description: err?.data?.error || err.message, variant: "destructive" })
                  })}>
                  <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                </Button>
              </>
            )}
            {doc.status === 'archived' && doc.signatureStatus === 'signed' && (
              <Button asChild variant="outline" style={{ height: 32, fontSize: 12 }}>
                <a href={`${BASE}/api/matters/${matterId}/documents/${id}/signature-certificate`}>
                  <Download className="h-3.5 w-3.5 mr-2" /> Certificate
                </a>
              </Button>
            )}
            {canEdit && (
              <Button
                variant={isEditing ? "default" : "outline"}
                onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                style={{ height: 32, fontSize: 12, ...(isEditing ? { background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` } : {}) }}
              >
                {isEditing ? "Save Changes" : "Edit Details"}
              </Button>
            )}
          </div>
        </div>

        {doc.status === "client_signing" && (
          <div style={{ padding: "0 24px 12px", background: T.surface }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11, color: T.textDim }}>
              <span style={{ fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Provider handoff</span>
              <ProviderOperationBadge operation={doc.providerOperation} />
              {doc.providerOperation?.providerRequestId && <span>Request <code style={{ color: T.text }}>{doc.providerOperation.providerRequestId}</code></span>}
              {doc.providerOperation?.attempt && <span>Attempt {doc.providerOperation.attempt}</span>}
              {doc.providerOperation?.updatedAt && <span>Updated {new Date(doc.providerOperation.updatedAt).toLocaleString()}</span>}
              {doc.providerOperation?.errorMessage && <span style={{ color: T.risk }}>{doc.providerOperation.errorMessage}</span>}
            </div>
          </div>
        )}

        {/* Lifecycle Stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const isCurrent = stage.key === doc.status
            const isPast = idx < currentStageIndex
            return (
              <div key={stage.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <div style={{ height: 3, width: "100%", background: isPast ? T.cyan : isCurrent ? `color-mix(in srgb, ${T.cyan} 60%, transparent)` : T.border, borderRadius: 2 }} />
                  <div style={{ fontSize: 9, fontWeight: 600, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", color: isPast || isCurrent ? T.cyan : T.textFaint }}>
                    {stage.label}
                  </div>
                </div>
                {idx < LIFECYCLE_STAGES.length - 1 && (
                  <div style={{ height: 3, width: 12, background: idx < currentStageIndex ? T.cyan : T.border }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

          {/* Document Content card */}
          <div style={{ ...cardStyle, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <SectionHeader>Document Content</SectionHeader>
              {doc.contentOrigin === 'ai_generated' ? (
                <span style={pillStyle("#8B5CF6")}><Bot size={10} /> AI Generated</span>
              ) : doc.contentOrigin === 'ai_assisted' ? (
                <span style={pillStyle(T.cyan)}><Bot size={10} /> AI Assisted</span>
              ) : (
                <span style={pillStyle(T.textDim)}><User size={10} /> Human</span>
              )}
            </div>

            {isEditing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, display: "block", marginBottom: 4 }}>Title</label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, display: "block", marginBottom: 4 }}>Content</label>
                  <Textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    style={{ minHeight: 300, fontFamily: "monospace", fontSize: 12, lineHeight: 1.6, background: T.surfaceEl }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, display: "block", marginBottom: 4 }}>Change Summary (for version history)</label>
                  <Input placeholder="E.g., Added indemnity clause..." value={changeSummary} onChange={e => setChangeSummary(e.target.value)} />
                </div>
              </div>
            ) : (
              <div>
                {doc.fileObjectPath && (
                  <div style={{ padding: 12, marginBottom: 12, background: T.surfaceEl, borderRadius: 8, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.originalFilename || "Stored document"}
                        </div>
                        <div style={{ fontSize: 10, color: T.textFaint, marginTop: 3 }}>
                          {doc.mimeType || "Unknown type"} · {formatFileSize(doc.fileSize)}
                        </div>
                      </div>
                      <a href={`${BASE}/api/storage${doc.fileObjectPath}`} download={doc.originalFilename || true} target="_blank" rel="noreferrer"
                        style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, color: T.cyan, fontSize: 10, textDecoration: "underline" }}>
                        <Download size={12} /> Download
                      </a>
                    </div>
                    {doc.mimeType === "application/pdf" && (
                      <iframe
                        src={`${BASE}/api/storage${doc.fileObjectPath}`}
                        title={`Preview of ${doc.originalFilename || "document"}`}
                        style={{ width: "100%", height: 360, border: `1px solid ${T.border}`, borderRadius: 5, background: "#fff" }}
                      />
                    )}
                    {doc.mimeType !== "application/pdf" && (
                      <div style={{ fontSize: 10, color: T.textFaint, paddingTop: 4 }}>
                        Preview is available after download for this file type.
                      </div>
                    )}
                  </div>
                )}
                {doc.content ? (
                  <div style={{ whiteSpace: "pre-wrap", fontFamily: "Georgia, serif", fontSize: 13, lineHeight: 1.75, padding: "14px 16px", background: T.surfaceEl, borderRadius: 8, border: `1px solid ${T.border}`, color: T.text }}>
                    {doc.content}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", fontStyle: "italic", padding: "32px 0" }}>No content provided.</p>
                )}
              </div>
            )}
          </div>

          {/* Sections Breakdown */}
          {doc.sections && doc.sections.length > 0 && (
            <div style={{ ...cardStyle, padding: 18 }}>
              <SectionHeader>Content Provenance Breakdown</SectionHeader>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {doc.sections.map((sec, i) => (
                  <div key={i} style={{ padding: 12, background: T.surfaceEl, borderRadius: 8, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{sec.heading}</span>
                      <span style={pillStyle(T.textDim)}>{sec.origin.replace('_', ' ')}</span>
                    </div>
                    {sec.summary && <span style={{ fontSize: 11, color: T.textDim }}>{sec.summary}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Workflow Actions */}
          <div style={{ ...cardStyle, padding: 16, border: `1px solid color-mix(in srgb, ${T.cyan} 30%, transparent)`, background: `color-mix(in srgb, ${T.cyan} 6%, transparent)` }}>
            <div style={{ background: T.surfaceEl, borderRadius: 6, padding: "5px 10px", marginBottom: 12 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.cyan }}>
                Workflow Actions
              </span>
            </div>

            {['draft', 'ai_assist', 'review'].includes(doc.status) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <Button variant="outline" size="sm" onClick={() => handleStatusChange('draft')} disabled={doc.status === 'draft'} style={{ fontSize: 11, height: 28 }}>
                    Draft
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleStatusChange('review')} disabled={doc.status === 'review'} style={{ fontSize: 11, height: 28 }}>
                    Review
                  </Button>
                </div>
                <Button style={{ width: "100%", height: 32, fontSize: 12, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}
                  onClick={() => submitApproval.mutate({ matterId, id }, { 
                    onSuccess: () => { invalidateAll(); toast({title:"Submitted for approval"}) },
                    onError: (err: any) => toast({ title: "Submission failed", description: err?.data?.error || err.message, variant: "destructive" })
                  })}>
                  Submit for Partner Approval <ArrowRight className="h-3 w-3 ml-2" />
                </Button>

                {doc.status === 'draft' && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" style={{ width: "100%", fontSize: 11, height: 30, gap: 6 }}>
                        <Bot size={12} /> Record AI Assistance
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Record AI Assistance</DialogTitle>
                        <DialogDescription>Declare AI tools used in generating this document content.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Type of Assistance</label>
                          <Select value={aiAssistOrigin} onValueChange={(v) => setAiAssistOrigin(v as any)}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ai_assisted">AI Assisted (Human drafted, AI reviewed/improved)</SelectItem>
                              <SelectItem value="ai_generated">AI Generated (AI drafted, human reviewed)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Section Summary (Optional)</label>
                          <Input placeholder="E.g., Entire document, Liability clause..." value={aiAssistSections} onChange={e=>setAiAssistSections(e.target.value)} />
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogTrigger id="ai-assist-dialog-close" className="hidden" />
                        <Button onClick={handleApplyAiAssist} style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>Save Record</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}

            {doc.status === 'partner_approval' && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {doc.approvalStatus === 'pending' ? (
                  isPartner ? (
                    <div style={{ padding: 12, background: T.surfaceEl, borderRadius: 8, border: `1px solid ${T.border}` }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: T.warn, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                        <AlertTriangle size={11} /> Your approval is required
                      </p>
                      <Textarea placeholder="Reason (required for reject/changes)..."
                        style={{ fontSize: 11, minHeight: 60, background: T.bg, marginBottom: 8 }}
                        value={approvalReason} onChange={e=>setApprovalReason(e.target.value)} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <Button size="sm" style={{ background: T.ok, fontSize: 11, height: 30, border: "none" }} onClick={() => handleApprovalDecision('approve')}>
                          Approve
                        </Button>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          <Button size="sm" variant="outline" style={{ fontSize: 11, height: 30, color: T.warn }} onClick={() => handleApprovalDecision('request_changes')} disabled={!approvalReason.trim()}>
                            Request Changes
                          </Button>
                          <Button size="sm" variant="destructive" style={{ fontSize: 11, height: 30 }} onClick={() => handleApprovalDecision('reject')} disabled={!approvalReason.trim()}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 12, background: T.surfaceEl, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
                      <Clock size={18} style={{ color: T.textFaint, margin: "0 auto 8px" }} />
                      <p style={{ fontSize: 12, color: T.textDim }}>Waiting for partner review.</p>
                      <p style={{ fontSize: 10, color: T.textFaint, marginTop: 4 }}>
                        Submitted by {doc.submittedByName} on {formatDate(doc.submittedAt || '')}
                      </p>
                    </div>
                  )
                ) : (
                  <div style={{ padding: 12, background: T.surfaceEl, borderRadius: 8, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      {doc.approvalStatus === 'approved' && <CheckCircle2 size={14} style={{ color: T.ok }} />}
                      {doc.approvalStatus === 'rejected' && <ShieldAlert size={14} style={{ color: T.risk }} />}
                      {doc.approvalStatus === 'changes_requested' && <AlertTriangle size={14} style={{ color: T.warn }} />}
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.text, textTransform: "capitalize" }}>{doc.approvalStatus?.replace(/_/g, ' ')}</span>
                    </div>
                    <p style={{ fontSize: 10, color: T.textFaint }}>By {doc.approvedByName} on {formatDate(doc.approvedAt || '')}</p>
                    {doc.approvalReason && (
                      <p style={{ marginTop: 8, fontSize: 11, background: T.bg, padding: "6px 8px", borderRadius: 4, color: T.textDim, fontStyle: "italic" }}>"{doc.approvalReason}"</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar tabs: Details / Versions / Audit */}
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            {/* Tab bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: `1px solid ${T.border}` }}>
              {(["details", "versions", "audit"] as const).map(t => (
                <button key={t} onClick={() => setSidebarTab(t)}
                  style={{
                    padding: "8px 4px", fontSize: 11, fontWeight: 600, textTransform: "capitalize",
                    color: sidebarTab === t ? T.text : T.textFaint,
                    borderBottom: sidebarTab === t ? `2px solid ${T.cyan}` : "2px solid transparent",
                    background: "transparent", cursor: "pointer",
                  }}>
                  {t}
                </button>
              ))}
            </div>

            {/* Details */}
            {sidebarTab === "details" && (
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, display: "block", marginBottom: 6 }}>Citations</span>
                  {doc.citations && doc.citations.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {doc.citations.map((cit, i) => (
                        <div key={i} style={{ fontSize: 10, padding: "5px 8px", background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 4, fontFamily: "monospace", color: T.text }}>{cit}</div>
                      ))}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                        <span style={pillStyle(doc.citationStatus === 'verified' ? T.ok : T.textDim)}>
                          {doc.citationStatus === 'verified' ? 'Verified' : 'Unverified'}
                        </span>
                        {doc.citationStatus !== 'verified' && (
                          <button onClick={verifyDocumentCitations}
                            style={{ fontSize: 10, color: T.cyan, background: "transparent", cursor: "pointer" }}>
                            Mark Verified
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: T.textFaint }}>No citations found.</span>
                  )}
                </div>
                <div style={{ height: 1, background: T.border }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, display: "block", marginBottom: 2 }}>Created By</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{doc.createdByName || 'Unknown'}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, display: "block", marginBottom: 2 }}>Created Date</span>
                    <span style={{ fontSize: 11, color: T.text }}>{formatDate(doc.createdAt)}</span>
                  </div>
                  {doc.aiRiskLevel && (
                    <div>
                      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, display: "block", marginBottom: 2 }}>AI Risk</span>
                      <span style={{ fontSize: 11, color: T.text, textTransform: "capitalize" }}>{doc.aiRiskLevel}</span>
                    </div>
                  )}
                  {doc.confidenceScore != null && (
                    <div>
                      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, display: "block", marginBottom: 2 }}>AI Confidence</span>
                      <span style={{ fontSize: 11, color: T.text }}>{doc.confidenceScore}%</span>
                    </div>
                  )}
                  {doc.fileChecksum && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, display: "block", marginBottom: 2 }}>SHA-256 Integrity</span>
                      <span title={doc.fileChecksum} style={{ fontSize: 10, color: T.text, fontFamily: "monospace", overflowWrap: "anywhere" }}>{doc.fileChecksum}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Versions */}
            {sidebarTab === "versions" && (
              <div>
                {(!versions || versions.length === 0) ? (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: T.textFaint }}>No versions found</div>
                ) : (
                  versions.map(v => (
                    <div key={v.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.borderSub}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Version {v.version}</span>
                        <span style={{ fontSize: 10, color: T.textFaint }}>{formatDate(v.createdAt)}</span>
                      </div>
                      <span style={{ fontSize: 11, color: T.textDim }}>By {v.authorName || 'System'}</span>
                      {v.changeSummary && (
                        <div style={{ marginTop: 6, fontSize: 11, fontStyle: "italic", padding: "4px 8px", background: T.surfaceEl, borderRadius: 4, color: T.textDim }}>{v.changeSummary}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Audit */}
            {sidebarTab === "audit" && (
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                {auditLogsError ? (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: T.textFaint }}>Audit access is restricted to compliance officers and partners.</div>
                ) : (!auditLogs || auditLogs.length === 0) ? (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: T.textFaint }}>No audit trail yet</div>
                ) : (
                  auditLogs.map(log => (
                    <div key={log.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.borderSub}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: T.text, margin: 0, textTransform: "capitalize" }}>{log.action.replace(/_/g, ' ')}</p>
                      <p style={{ fontSize: 10, color: T.textFaint, margin: "2px 0 0" }}>{formatDate(log.createdAt)} · {log.userName || 'System'}</p>
                      {log.details && (
                        <p style={{ fontSize: 10, marginTop: 4, padding: "3px 6px", background: T.surfaceEl, borderRadius: 4, fontFamily: "monospace", color: T.textFaint, wordBreak: "break-all" }}>{log.details}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
