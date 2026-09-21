import { useState } from "react"
import { useParams, Link } from "wouter"
import { ResearchComposer } from "@/components/research/ResearchComposer"
import { ResearchRegister } from "@/components/research/ResearchRegister"
import { ResearchRecordView } from "@/components/research/ResearchRecordView"
import { useGetResearch, getGetResearchQueryKey } from "@workspace/api-client-react"
import { AiWorkflowLauncher, getRiskBadge } from "@/components/ai/AiWorkflowLauncher"
import { AiOutputView } from "@/components/ai/AiOutputView"
import { 
  useGetMatter,
  useGetMatterTimeline,
  getGetMatterTimelineQueryKey,
  useUpdateMatter,
  useUpdateMatterStatus,
  getGetMatterQueryKey,
  getListMattersQueryKey,
  useListMatterDocuments,
  useAddMatterDocument,
  useRequestStorageUploadUrl,
  getListMatterDocumentsQueryKey,
  useListMatterTasks,
  useAddMatterTask,
  useUpdateMatterTask,
  getListMatterTasksQueryKey,
  getListAuditLogsQueryKey,
  useListConflicts,
  getListConflictsQueryKey,
  useRunConflictCheck,
  useListAiConversations,
  getListAiConversationsQueryKey,
  useListAuditLogs,
  useListKnowledgeItems,
  useGetClient,
  useGetCurrentUser,
  useListMatterAssignees,
  getListMatterAssigneesQueryKey,
  type MatterStatusUpdateStatus,
  type MatterUpdateRiskLevel,
} from "@workspace/api-client-react"
import { ConflictReviewCard, type ConflictRecordView } from "@/components/conflicts/conflict-review-card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useQueryClient } from "@tanstack/react-query"
import { PageLoader } from "@/components/ui/loader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  Bot, 
  History,
  AlertTriangle,
  ChevronRight,
  MoreVertical,
  Shield,
  Users,
  Mail,
  BookOpen,
  FileCheck,
  Plus,
  Search,
  Send,
  Download,
  Eye,
  CheckSquare,
  Circle,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/format"
import { resolveUploadContentType } from "@/lib/storageUpload"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { T, cardStyle, pillStyle } from "@/lib/theme"
import { ProviderOperationBadge } from "@/components/provider-operation-status"
import { MatterEmails } from "@/components/email/MatterEmails"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""

async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

// Lifecycle stages in order
const LIFECYCLE_STAGES = [
  { key: 'lead', label: 'Lead' },
  { key: 'conflict_check', label: 'Conflict Check' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Active' },
  { key: 'review', label: 'Review' },
  { key: 'completed', label: 'Completed' },
  { key: 'closed', label: 'Closed' },
  { key: 'archived', label: 'Archived' },
] as const

// Valid status transitions from server logic
const VALID_TRANSITIONS: Record<string, MatterStatusUpdateStatus[]> = {
  lead: ['conflict_check'],
  conflict_check: ['approved', 'lead'],
  approved: ['active', 'conflict_check'],
  active: ['review'],
  review: ['completed', 'active'],
  completed: ['closed'],
  closed: ['archived'],
  archived: [],
}

const STATUS_COLOR: Record<string, string> = {
  lead: T.textDim,
  conflict_check: T.warn,
  approved: T.ok,
  active: T.cyan,
  review: "#8B5CF6",
  completed: T.ok,
  closed: T.textDim,
  archived: T.textFaint,
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: T.surfaceEl, borderRadius: 6, padding: "5px 10px", marginBottom: 12 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: T.textDim }}>
        {children}
      </span>
    </div>
  )
}

export default function MatterDetailPage() {
  const { id } = useParams()
  const matterId = Number(id)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const { data: matter, isLoading: matterLoading } = useGetMatter(matterId, { 
    query: { enabled: !!matterId, queryKey: getGetMatterQueryKey(matterId) } 
  })

  const { data: client } = useGetClient(matter?.clientId ?? 0, {
    query: { enabled: !!matter?.clientId, queryKey: ['/api/clients', matter?.clientId] }
  })

  const { data: timeline } = useGetMatterTimeline(matterId, {
    query: { enabled: !!matterId, queryKey: getGetMatterTimelineQueryKey(matterId) }
  })

  const { data: documents } = useListMatterDocuments(matterId, {
    query: { enabled: !!matterId, queryKey: getListMatterDocumentsQueryKey(matterId) }
  })

  const { data: tasks } = useListMatterTasks(matterId, {
    query: { enabled: !!matterId, queryKey: getListMatterTasksQueryKey(matterId) }
  })

  const { data: aiConversations } = useListAiConversations({ matterId }, {
    query: { enabled: !!matterId, queryKey: getListAiConversationsQueryKey({ matterId }) }
  })

  const { data: auditLogs } = useListAuditLogs({ matterId }, {
    query: { enabled: !!matterId, queryKey: getListAuditLogsQueryKey({ matterId }) }
  })

  const { data: user } = useGetCurrentUser()
  const mayAssignTeam = ["partner", "managing_partner", "admin", "super_admin"].includes(user?.role ?? "")
  const { data: assignees, isLoading: assigneesLoading } = useListMatterAssignees(matterId, {
    query: {
      enabled: !!matterId && mayAssignTeam,
      queryKey: getListMatterAssigneesQueryKey(matterId),
    },
  })

  const updateMatter = useUpdateMatter()
  const updateStatus = useUpdateMatterStatus()
  const addDocument = useAddMatterDocument()
  const requestUploadUrl = useRequestStorageUploadUrl()
  const addTask = useAddMatterTask()
  const updateTask = useUpdateMatterTask()

  const { data: conflictRecords } = useListConflicts(
    { matterId },
    { query: { enabled: !!matterId, queryKey: getListConflictsQueryKey({ matterId }) } }
  )
  const runScan = useRunConflictCheck()
  const [opposingParty, setOpposingParty] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeOutputId, setActiveOutputId] = useState<number | null>(null)
  const [activeResearchId, setActiveResearchId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [editForm, setEditForm] = useState({ title: "", description: "", practiceArea: "", value: "" })
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("unassigned")

  const { data: activeResearchRecord, isLoading: researchLoading } = useGetResearch(activeResearchId!, {
    query: { enabled: activeResearchId !== null, queryKey: getGetResearchQueryKey(activeResearchId!) }
  })

  if (matterLoading) return <div style={{ flex: 1, background: T.bg }}><PageLoader /></div>
  if (!matter) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <p style={{ color: T.textFaint }}>Matter not found</p>
    </div>
  )

  const latestConflict = (conflictRecords ?? [])[0] as ConflictRecordView | undefined
  const conflictCleared = latestConflict && ["cleared", "approved"].includes(latestConflict.status)
  const conflictBlocked = latestConflict?.status === "rejected"

  const currentStageIndex = LIFECYCLE_STAGES.findIndex(s => s.key === matter.status)
  const availableTransitions = VALID_TRANSITIONS[matter.status] || []

  const handleStatusChange = (newStatus: MatterStatusUpdateStatus) => {
    updateStatus.mutate(
      { id: matterId, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMatterQueryKey(matterId) })
          queryClient.invalidateQueries({ queryKey: getGetMatterTimelineQueryKey(matterId) })
          queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey({ matterId }) })
          toast({
            title: "Status updated",
            description: `Matter status is now ${newStatus.replace(/_/g, ' ')}.`,
          })
        },
        onError: (err: any) => {
          toast({
            title: "Status change blocked",
            description: err?.data?.error ?? "The matter status could not be changed.",
            variant: "destructive",
          })
        }
      }
    )
  }

  const handleRiskLevelChange = (riskLevel: MatterUpdateRiskLevel) => {
    updateMatter.mutate(
      { id: matterId, data: { riskLevel } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMatterQueryKey(matterId) })
          toast({
            title: "Risk level updated",
            description: `Risk level set to ${riskLevel.replace(/_/g, ' ')}.`,
          })
        },
        onError: (err: any) => {
          toast({
            title: "Update failed",
            description: err?.data?.error ?? "Could not update risk level.",
            variant: "destructive",
          })
        }
      }
    )
  }

  const refreshMatterData = () => {
    queryClient.invalidateQueries({ queryKey: getGetMatterQueryKey(matterId) })
    queryClient.invalidateQueries({ queryKey: getListMattersQueryKey() })
    queryClient.invalidateQueries({ queryKey: getGetMatterTimelineQueryKey(matterId) })
    queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey({ matterId }) })
  }

  const openEditDialog = () => {
    setEditForm({
      title: matter.title,
      description: matter.description ?? "",
      practiceArea: matter.practiceArea ?? "",
      value: matter.value == null ? "" : String(matter.value),
    })
    setEditDialogOpen(true)
  }

  const saveMatterDetails = () => {
    const title = editForm.title.trim()
    if (title.length < 3) {
      toast({ title: "Matter title is required", description: "Enter at least three characters before saving.", variant: "destructive" })
      return
    }
    const numericValue = editForm.value.trim() === "" ? null : Number(editForm.value)
    if (numericValue !== null && (!Number.isFinite(numericValue) || numericValue < 0)) {
      toast({ title: "Invalid matter value", description: "Enter a positive number or leave the field blank.", variant: "destructive" })
      return
    }
    updateMatter.mutate(
      {
        id: matterId,
        data: {
          title,
          description: editForm.description.trim(),
          practiceArea: editForm.practiceArea.trim(),
          value: numericValue,
        },
      },
      {
        onSuccess: () => {
          refreshMatterData()
          setEditDialogOpen(false)
          toast({ title: "Matter details updated", description: "The matter record has been saved." })
        },
        onError: (err: any) => toast({
          title: "Could not update matter",
          description: err?.data?.error ?? "Please check your changes and try again.",
          variant: "destructive",
        }),
      },
    )
  }

  const openAssignDialog = () => {
    setSelectedAssigneeId(matter.assignedToId == null ? "unassigned" : String(matter.assignedToId))
    setAssignDialogOpen(true)
  }

  const saveAssignment = () => {
    updateMatter.mutate(
      { id: matterId, data: { assignedToId: selectedAssigneeId === "unassigned" ? null : Number(selectedAssigneeId) } },
      {
        onSuccess: () => {
          refreshMatterData()
          setAssignDialogOpen(false)
          toast({ title: "Team assignment updated", description: "The responsible team member has been updated." })
        },
        onError: (err: any) => toast({
          title: "Could not assign team member",
          description: err?.data?.error ?? "Please try again.",
          variant: "destructive",
        }),
      },
    )
  }

  const exportMatterDossier = async () => {
    setIsExporting(true)
    try {
      const response = await fetch(`${BASE}/api/matters/${matterId}/export`, { credentials: "include" })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? "The matter dossier could not be exported.")
      }
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = `${matter.reference.toLowerCase()}-matter-dossier.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)
      refreshMatterData()
      toast({ title: "Matter dossier exported", description: "The JSON export has been downloaded." })
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "The matter dossier could not be exported.",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleRunScan = () => {
    runScan.mutate(
      { data: { clientName: matter.clientName, opposingParty: opposingParty.trim() || undefined, matterId } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListConflictsQueryKey({ matterId }) })
          queryClient.invalidateQueries({ queryKey: getListConflictsQueryKey() })
          queryClient.invalidateQueries({ queryKey: getGetMatterQueryKey(matterId) })
          queryClient.invalidateQueries({ queryKey: getGetMatterTimelineQueryKey(matterId) })
          queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey({ matterId }) })
          toast(result.hasConflicts
            ? { title: "Conflicts flagged", description: `Severity ${result.severity} — partner review required before this matter can proceed.`, variant: "destructive" }
            : { title: "Scan clear", description: "No conflicts detected — the matter may proceed." })
        },
        onError: () => toast({ title: "Scan failed", description: "The conflict scan could not be completed.", variant: "destructive" }),
      }
    )
  }

  const getStatusColor = (status: string) => STATUS_COLOR[status] ?? T.textDim

  const getRiskBadgeLocal = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'no_risk':           return { color: T.ok,   label: "No Risk" }
      case 'review_required':   return { color: T.warn, label: "Review Required" }
      case 'high_risk':         return { color: T.risk, label: "High Risk" }
      case 'compliance_blocked':return { color: T.risk, label: "Compliance Blocked" }
      default:                  return { color: T.textDim, label: "Not Set" }
    }
  }

  const getRiskBadge = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'no_risk':
        return <Badge variant="emerald" className="gap-1"><ShieldCheck className="h-3 w-3" /> No Risk</Badge>
      case 'review_required':
        return <Badge variant="amber" className="gap-1"><Shield className="h-3 w-3" /> Review Required</Badge>
      case 'high_risk':
        return <Badge variant="red" className="gap-1"><ShieldAlert className="h-3 w-3" /> High Risk</Badge>
      case 'compliance_blocked':
        return <Badge variant="red" className="gap-1 animate-pulse"><ShieldAlert className="h-3 w-3" /> Compliance Blocked</Badge>
      default:
        return <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" /> Not Set</Badge>
    }
  }

  const getComplianceBadge = (ficaStatus?: string) => {
    switch (ficaStatus) {
      case 'compliant':
        return <Badge variant="emerald">Compliant</Badge>
      case 'pending':
        return <Badge variant="amber">Pending</Badge>
      case 'expired':
        return <Badge variant="red">Expired</Badge>
      case 'blocked':
        return <Badge variant="red" className="animate-pulse">Blocked</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'matter': return <FileText size={12} style={{ color: T.textDim }} />
      case 'conflict': return <ShieldAlert size={12} style={{ color: T.warn }} />
      case 'document': return <FileCheck size={12} style={{ color: T.textDim }} />
      case 'task': return <CheckSquare size={12} style={{ color: T.textDim }} />
      case 'email': return <Mail size={12} style={{ color: T.textDim }} />
      case 'research': return <BookOpen size={12} style={{ color: T.textDim }} />
      case 'ai': return <Bot size={12} style={{ color: T.cyan }} />
      case 'signature': return <FileCheck size={12} style={{ color: T.ok }} />
      case 'audit': return <History size={12} style={{ color: T.textDim }} />
      case 'status': return <Circle size={12} style={{ color: T.textDim }} />
      default: return <Circle size={12} style={{ color: T.textDim }} />
    }
  }

  const statusColor = getStatusColor(matter.status)

  const TABS = [
    { key: "overview",  label: "Overview" },
    { key: "timeline",  label: "Timeline",   icon: History },
    { key: "documents", label: "Documents",  icon: FileText },
    { key: "tasks",     label: "Tasks",      icon: CheckSquare },
    { key: "emails",    label: "Emails",     icon: Mail },
    { key: "research",  label: "Research",   icon: BookOpen },
    { key: "ai",        label: "AI",         icon: Bot },
    { key: "audit",     label: "Audit",      icon: FileCheck },
  ]

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: T.bg }}>
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Edit Matter Details</DialogTitle>
            <DialogDescription>Update the working details for {matter.reference}. Lifecycle status is managed separately.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <label className="grid gap-1.5 text-sm font-medium" style={{ color: T.text }}>
              Matter title
              <Input
                value={editForm.title}
                onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                disabled={updateMatter.isPending}
                autoFocus
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" style={{ color: T.text }}>
              Practice area
              <Input
                value={editForm.practiceArea}
                onChange={(event) => setEditForm((current) => ({ ...current, practiceArea: event.target.value }))}
                placeholder="e.g. Commercial litigation"
                disabled={updateMatter.isPending}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" style={{ color: T.text }}>
              Matter value
              <Input
                value={editForm.value}
                onChange={(event) => setEditForm((current) => ({ ...current, value: event.target.value }))}
                placeholder="0.00"
                inputMode="decimal"
                disabled={updateMatter.isPending}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" style={{ color: T.text }}>
              Description
              <Textarea
                value={editForm.description}
                onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Add a concise matter description"
                rows={5}
                disabled={updateMatter.isPending}
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} disabled={updateMatter.isPending}>Cancel</Button>
            <Button type="button" onClick={saveMatterDetails} disabled={updateMatter.isPending}>
              {updateMatter.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign Matter Team</DialogTitle>
            <DialogDescription>Set the active staff member responsible for this matter. Only active legal-workspace staff are listed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-1">
            <label className="text-sm font-medium" style={{ color: T.text }}>Responsible team member</label>
            <Select value={selectedAssigneeId} onValueChange={setSelectedAssigneeId} disabled={assigneesLoading || updateMatter.isPending}>
              <SelectTrigger>
                <SelectValue placeholder={assigneesLoading ? "Loading active staff…" : "Choose a team member"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(assignees ?? []).map((assignee) => (
                  <SelectItem key={assignee.id} value={String(assignee.id)}>
                    {assignee.name} · {assignee.role.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!assigneesLoading && (assignees?.length ?? 0) === 0 && (
              <p className="text-sm" style={{ color: T.textFaint }}>No active eligible staff members are available.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={updateMatter.isPending}>Cancel</Button>
            <Button type="button" onClick={saveAssignment} disabled={assigneesLoading || updateMatter.isPending}>
              {updateMatter.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "14px 24px" }}>

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Link href="/matters">
                <button style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textFaint, background: "transparent", cursor: "pointer" }}>
                  <ArrowLeft size={11} /> Matters
                </button>
              </Link>
              <span style={{ color: T.textFaint, fontSize: 11 }}>·</span>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: T.textDim, background: T.surfaceEl, padding: "2px 7px", borderRadius: 4, border: `1px solid ${T.border}` }}>
                {matter.reference}
              </span>
              <span style={pillStyle(statusColor)}>{matter.status.replace(/_/g, ' ')}</span>
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>{matter.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.textDim }}>
              <Link href={`/clients/${matter.clientId}`}>
                <span style={{ color: T.cyan, cursor: "pointer", fontWeight: 500 }}>{matter.clientName}</span>
              </Link>
              <span style={{ color: T.textFaint }}>·</span>
              <span>{matter.practiceArea || 'General Practice'}</span>
              <span style={{ color: T.textFaint }}>·</span>
              <span>{matter.assignedToName || 'Unassigned'}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {availableTransitions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={updateStatus.isPending} style={{ fontSize: 11, height: 30 }}>
                    {updateStatus.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <ChevronRight className="h-3 w-3 mr-2" />}
                    Advance Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {availableTransitions.map(status => (
                    <DropdownMenuItem key={status} onClick={() => handleStatusChange(status)}>
                      {status.replace(/_/g, ' ')}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" style={{ height: 30, width: 30 }}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openEditDialog}>Edit Matter Details</DropdownMenuItem>
                {mayAssignTeam && <DropdownMenuItem onClick={openAssignDialog}>Assign Team</DropdownMenuItem>}
                <DropdownMenuItem onClick={exportMatterDossier} disabled={isExporting}>
                  {isExporting ? "Preparing export…" : "Export Matter Dossier"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Lifecycle Stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 14 }}>
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const isCurrent = stage.key === matter.status
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

        {/* Meta strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, padding: "10px 14px", ...cardStyle }}>
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, marginBottom: 4 }}>Next Action</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{matter.nextAction || 'None required'}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, marginBottom: 4 }}>Risk Level</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button style={{ background: "transparent", cursor: "pointer", textAlign: "left" }}>{getRiskBadge(matter.riskLevel)}</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handleRiskLevelChange('no_risk' as MatterUpdateRiskLevel)}>No Risk</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRiskLevelChange('review_required' as MatterUpdateRiskLevel)}>Review Required</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRiskLevelChange('high_risk' as MatterUpdateRiskLevel)}>High Risk</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRiskLevelChange('compliance_blocked' as MatterUpdateRiskLevel)}>Compliance Blocked</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, marginBottom: 4 }}>Conflict</div>
            {matter.conflictStatus ? (
              <span style={pillStyle(matter.conflictStatus === 'approved' || matter.conflictStatus === 'cleared' ? T.ok : matter.conflictStatus === 'rejected' ? T.risk : T.warn)}>
                {matter.conflictStatus.replace(/_/g, ' ')}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: T.textFaint }}>Not scanned</span>
            )}
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, marginBottom: 4 }}>Compliance</div>
            <div style={{ fontSize: 11 }}>
              {client ? getComplianceBadge(client.ficaStatus) : <span style={{ fontSize: 10, color: T.textFaint }}>Loading…</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, marginBottom: 4 }}>Assigned To</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{matter.assignedToName || 'Unassigned'}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, marginBottom: 4 }}>Value</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{matter.value ? formatCurrency(matter.value) : 'Not set'}</div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflowX: "auto", background: T.surface }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "10px 16px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
                color: activeTab === tab.key ? T.text : T.textFaint,
                borderBottom: activeTab === tab.key ? `2px solid ${T.cyan}` : "2px solid transparent",
                background: "transparent", cursor: "pointer",
              }}
            >
              {Icon && <Icon size={12} />}
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ══════════ OVERVIEW ══════════ */}
        {activeTab === "overview" && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Conflict Check card */}
            {(['lead', 'conflict_check'].includes(matter.status) || latestConflict) && (
              <div style={{
                ...cardStyle,
                padding: 18,
                border: `1px solid ${latestConflict?.status === 'pending' || latestConflict?.status === 'further_review' ? `color-mix(in srgb, ${T.warn} 40%, transparent)` : conflictBlocked ? `color-mix(in srgb, ${T.risk} 40%, transparent)` : T.border}`,
                background: latestConflict?.status === 'pending' || latestConflict?.status === 'further_review' ? `color-mix(in srgb, ${T.warn} 8%, transparent)` : conflictBlocked ? `color-mix(in srgb, ${T.risk} 8%, transparent)` : T.surface,
              }}>
                <SectionHeader>Conflict Check</SectionHeader>
                <p style={{ fontSize: 11, color: T.textDim, marginBottom: 12 }}>Mandatory before this matter can be approved or activated.</p>
                {latestConflict ? (
                  <ConflictReviewCard
                    record={latestConflict}
                    onReviewed={() => {
                      queryClient.invalidateQueries({ queryKey: getListConflictsQueryKey({ matterId }) })
                      queryClient.invalidateQueries({ queryKey: getGetMatterQueryKey(matterId) })
                      queryClient.invalidateQueries({ queryKey: getGetMatterTimelineQueryKey(matterId) })
                      queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey({ matterId }) })
                    }}
                  />
                ) : (
                  <p style={{ fontSize: 12, color: T.textFaint }}>No conflict scan has been run for this matter yet.</p>
                )}
                {(!latestConflict || latestConflict.status === 'further_review') && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <Input
                      placeholder="Opposing party (optional)..."
                      value={opposingParty}
                      onChange={(e) => setOpposingParty(e.target.value)}
                      style={{ maxWidth: 280 }}
                    />
                    <Button onClick={handleRunScan} disabled={runScan.isPending} size="sm"
                      style={{ height: 34, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                      {runScan.isPending ? (
                        <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Scanning...</>
                      ) : latestConflict ? "Re-run Scan" : "Run Scan"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Matter info grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Matter Details */}
                <div style={{ ...cardStyle, padding: 18 }}>
                  <SectionHeader>Matter Details</SectionHeader>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { label: "Matter Number",          value: <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.text }}>{matter.reference}</span> },
                      { label: "Status",                 value: <span style={pillStyle(statusColor)}>{matter.status.replace(/_/g, ' ')}</span> },
                      { label: "Client",                 value: <Link href={`/clients/${matter.clientId}`}><span style={{ color: T.cyan, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>{matter.clientName}</span></Link> },
                      { label: "Responsible Attorney",   value: <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{matter.assignedToName || 'Unassigned'}</span> },
                      { label: "Practice Area",          value: <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{matter.practiceArea || 'General Practice'}</span> },
                      { label: "Matter Value",           value: <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{matter.value ? formatCurrency(matter.value) : 'Not set'}</span> },
                      { label: "Risk Level",             value: getRiskBadge(matter.riskLevel) },
                      { label: "Conflict Status",        value: matter.conflictStatus ? <span style={pillStyle(matter.conflictStatus === 'approved' || matter.conflictStatus === 'cleared' ? T.ok : matter.conflictStatus === 'rejected' ? T.risk : T.warn)}>{matter.conflictStatus.replace(/_/g, ' ')}</span> : <span style={{ fontSize: 11, color: T.textFaint }}>Not scanned</span> },
                      { label: "Compliance Status",      value: client ? getComplianceBadge(client.ficaStatus) : <span style={{ fontSize: 11, color: T.textFaint }}>Loading…</span> },
                      { label: "Next Required Action",   value: <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{matter.nextAction || 'None required'}</span> },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                        <div>{value}</div>
                      </div>
                    ))}
                  </div>
                  {matter.description && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint, fontWeight: 700, marginBottom: 6 }}>Description</div>
                      <p style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>{matter.description}</p>
                    </div>
                  )}
                </div>

                {/* Recent Documents */}
                <div style={{ ...cardStyle, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <SectionHeader>Recent Documents</SectionHeader>
                    <button onClick={() => setActiveTab("documents")} style={{ fontSize: 11, color: T.cyan, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                      View All <ChevronRight size={11} />
                    </button>
                  </div>
                  {!documents || documents.length === 0 ? (
                    <p style={{ fontSize: 12, color: T.textFaint }}>No documents yet.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {documents.slice(0, 5).map(doc => (
                        <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: T.surfaceEl, borderRadius: 6, border: `1px solid ${T.border}` }}>
                          <FileText size={12} style={{ color: T.textFaint, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Link href={`/matters/${matterId}/documents/${doc.id}`}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: T.cyan, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{doc.title}</div>
                            </Link>
                            <div style={{ fontSize: 10, color: T.textFaint }}>v{doc.version} · {formatDate(doc.createdAt)}</div>
                          </div>
                          <span style={pillStyle(T.textDim)}>{doc.status.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right sidebar */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Quick Stats */}
                <div style={{ ...cardStyle, padding: 18 }}>
                  <SectionHeader>Quick Stats</SectionHeader>
                  {[
                    { label: "Documents",    value: documents?.length || 0 },
                    { label: "Tasks",        value: tasks?.length || 0 },
                    { label: "Created",      value: formatDate(matter.createdAt) },
                  ].map(row => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.borderSub}` }}>
                      <span style={{ fontSize: 11, color: T.textDim }}>{row.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* Recent Activity */}
                <div style={{ ...cardStyle, padding: 18 }}>
                  <SectionHeader>Recent Activity</SectionHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {timeline?.slice(0, 5).map((event) => (
                      <div key={event.id} style={{ display: "flex", gap: 8 }}>
                        <div style={{ paddingTop: 2 }}>{getCategoryIcon(event.category)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: T.text, margin: 0 }}>{event.title}</p>
                          {event.detail && <p style={{ fontSize: 10, color: T.textDim, margin: "2px 0 0" }}>{event.detail}</p>}
                          <p style={{ fontSize: 9, color: T.textFaint, margin: "2px 0 0" }}>
                            {formatDate(event.occurredAt)}{event.actorName && ` · ${event.actorName}`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!timeline || timeline.length === 0) && (
                      <p style={{ fontSize: 12, color: T.textFaint }}>No activity yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ TIMELINE ══════════ */}
        {activeTab === "timeline" && (
          <div style={{ padding: 20 }}>
            <div style={{ ...cardStyle, padding: 18 }}>
              <SectionHeader>Complete Timeline</SectionHeader>
              <p style={{ fontSize: 11, color: T.textDim, marginBottom: 16 }}>Chronological feed of all events for this matter</p>
              {!timeline || timeline.length === 0 ? (
                <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", padding: "32px 0" }}>No timeline events yet.</p>
              ) : (
                <div style={{ position: "relative", paddingLeft: 20 }}>
                  <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 1, background: T.border }} />
                  {timeline.map((event, idx) => (
                    <div key={event.id} style={{ display: "flex", gap: 10, marginBottom: 16, position: "relative" }}>
                      <div style={{ position: "absolute", left: -15, top: 3, width: 8, height: 8, borderRadius: "50%", background: T.surfaceEl, border: `2px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: T.textDim }}>{getCategoryIcon(event.category)}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: 0 }}>{event.title}</p>
                            {event.detail && <p style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{event.detail}</p>}
                          </div>
                          <span style={pillStyle(T.textFaint)}>{event.category}</span>
                        </div>
                        <p style={{ fontSize: 9, color: T.textFaint, marginTop: 4 }}>
                          {formatDate(event.occurredAt)}{event.actorName && ` · ${event.actorName}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ DOCUMENTS ══════════ */}
        {activeTab === "documents" && (
          <div style={{ padding: 20 }}>
            <div style={{ ...cardStyle, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <SectionHeader>Documents</SectionHeader>
                  <p style={{ fontSize: 11, color: T.textDim, marginTop: -6 }}>All documents attached to this matter</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" style={{ height: 30, fontSize: 11, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                      <Plus className="h-3 w-3 mr-1" /> Add Document
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Document</DialogTitle>
                      <DialogDescription>Create a document for this matter.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const selectedFile = (formData.get("file") as File | null) ?? null
                      try {
                        let fileData: Record<string, string | number> = {}
                        if (selectedFile && selectedFile.size > 0) {
                           const contentType = resolveUploadContentType(selectedFile, "application/pdf")
                           const uploadDetails = await requestUploadUrl.mutateAsync({
                             data: { name: selectedFile.name, size: selectedFile.size, contentType },
                           })
                           const signedContentType = uploadDetails.metadata.contentType
                           const putResponse = await fetch(uploadDetails.uploadURL, {
                             method: "PUT",
                             headers: { "Content-Type": signedContentType },
                             body: selectedFile,
                           })
                           if (!putResponse.ok) throw new Error("The file could not be stored")
                           fileData = {
                             fileObjectPath: uploadDetails.objectPath,
                             originalFilename: selectedFile.name,
                             mimeType: signedContentType,
                             fileSize: selectedFile.size,
                             fileChecksum: await sha256File(selectedFile),
                           }
                        }
                        await addDocument.mutateAsync({
                          matterId,
                          data: {
                            title: formData.get("title") as string,
                            documentType: formData.get("documentType") as any,
                            content: (formData.get("content") as string) || undefined,
                            ...fileData,
                          }
                        })
                        await queryClient.invalidateQueries({ queryKey: getListMatterDocumentsQueryKey(matterId) });
                        toast({ title: selectedFile ? "Document uploaded" : "Document created", description: "The document is now persisted in this matter." });
                        const closeBtn = document.querySelector('[data-state="open"] button[aria-label="Close"]') as HTMLButtonElement;
                        if (closeBtn) closeBtn.click();
                      } catch (error: any) {
                        toast({ title: "Document upload failed", description: error?.message || "The document was not saved.", variant: "destructive" });
                      }
                    }}>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <label htmlFor="title" className="text-sm font-medium">Title</label>
                          <Input id="title" name="title" required />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="documentType" className="text-sm font-medium">Document Type</label>
                          <Select name="documentType" required defaultValue="general">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contract">Contract</SelectItem>
                              <SelectItem value="pleading">Pleading</SelectItem>
                              <SelectItem value="opinion">Opinion</SelectItem>
                              <SelectItem value="correspondence">Correspondence</SelectItem>
                              <SelectItem value="affidavit">Affidavit</SelectItem>
                              <SelectItem value="general">General</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="file" className="text-sm font-medium">Legal file (Optional)</label>
                          <Input id="file" name="file" type="file" accept=".pdf,.doc,.docx,.rtf,.txt,.odt" />
                          <p className="text-xs text-muted-foreground">Maximum 25 MB. The file is stored privately and remains subject to document governance.</p>
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="content" className="text-sm font-medium">Content (Optional)</label>
                          <Textarea id="content" name="content" className="min-h-[100px]" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={addDocument.isPending}>
                          {addDocument.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          {addDocument.isPending ? "Saving Document…" : "Create Document"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {!documents || documents.length === 0 ? (
                <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", padding: "32px 0" }}>No documents yet.</p>
              ) : (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                    {["Title & Type", "Lifecycle", "AI Provenance", "Approval", "Signature", "Modified"].map(h => (
                      <div key={h} style={{ padding: "6px 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textFaint }}>{h}</div>
                    ))}
                  </div>
                  {documents.map(doc => (
                    <div key={doc.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", borderBottom: `1px solid ${T.borderSub}`, alignItems: "center" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                      <div style={{ padding: "8px 12px" }}>
                        <Link href={`/matters/${matterId}/documents/${doc.id}`}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.cyan, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                        </Link>
                        {doc.originalFilename && doc.fileObjectPath && (
                          <a href={`${BASE}/api/storage${doc.fileObjectPath}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 10, color: T.textDim, textDecoration: "underline" }}>
                            {doc.originalFilename}
                          </a>
                        )}
                        <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2, textTransform: "capitalize" }}>
                          {doc.documentType || 'General'} · v{doc.version}
                        </div>
                      </div>
                      <div style={{ padding: "8px 12px" }}>
                        <span style={pillStyle(T.textDim)}>{doc.status.replace(/_/g, ' ')}</span>
                      </div>
                      <div style={{ padding: "8px 12px" }}>
                        {doc.contentOrigin === 'ai_generated' ? (
                          <span style={pillStyle("#8B5CF6")}>AI Generated</span>
                        ) : doc.contentOrigin === 'ai_assisted' ? (
                          <span style={pillStyle(T.cyan)}>AI Assisted</span>
                        ) : (
                          <span style={{ fontSize: 10, color: T.textFaint }}>Human</span>
                        )}
                      </div>
                      <div style={{ padding: "8px 12px" }}>
                        {doc.approvalStatus && doc.approvalStatus !== 'not_submitted' ? (
                          <span style={pillStyle(doc.approvalStatus === 'approved' ? T.ok : doc.approvalStatus === 'rejected' ? T.risk : T.warn)}>
                            {doc.approvalStatus.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: T.textFaint }}>—</span>
                        )}
                      </div>
                      <div style={{ padding: "8px 12px" }}>
                        {doc.signatureStatus === 'signed' ? (
                          <span style={pillStyle(T.ok)}>Signed</span>
                        ) : doc.providerOperation ? (
                          <ProviderOperationBadge operation={doc.providerOperation} compact />
                        ) : (
                          <span style={{ fontSize: 10, color: T.textFaint }}>—</span>
                        )}
                      </div>
                      <div style={{ padding: "8px 12px", fontSize: 10, color: T.textFaint, whiteSpace: "nowrap" }}>
                        {formatDate(doc.updatedAt || doc.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ TASKS ══════════ */}
        {activeTab === "tasks" && (
          <div style={{ padding: 20 }}>
            <div style={{ ...cardStyle, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <SectionHeader>Tasks</SectionHeader>
                  <p style={{ fontSize: 11, color: T.textDim, marginTop: -6 }}>Track action items and deliverables</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" style={{ height: 30, fontSize: 11, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                      <Plus className="h-3 w-3 mr-1" /> Add Task
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Task</DialogTitle>
                      <DialogDescription>Add a task for this matter.</DialogDescription>
                    </DialogHeader>
                    <p style={{ fontSize: 12, color: T.textDim, padding: "16px 0" }}>Task creation form would connect here.</p>
                  </DialogContent>
                </Dialog>
              </div>
              {!tasks || tasks.length === 0 ? (
                <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", padding: "32px 0" }}>No tasks yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tasks.map(task => {
                    const isCompleted = task.status === 'completed'
                    const isCancelled = task.status === 'cancelled'
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: T.surfaceEl, borderRadius: 8, border: `1px solid ${T.border}`, opacity: isCompleted || isCancelled ? 0.6 : 1 }}>
                        <button style={{ marginTop: 1, background: "transparent", cursor: "pointer" }}>
                          {isCompleted ? (
                            <CheckCircle2 size={15} style={{ color: T.ok }} />
                          ) : (
                            <Circle size={15} style={{ color: T.textFaint }} />
                          )}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{task.title}</div>
                          {task.description && <p style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{task.description}</p>}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                            <span style={pillStyle(task.priority === 'urgent' ? T.risk : task.priority === 'high' ? T.warn : T.textDim)}>
                              {task.priority}
                            </span>
                            {task.dueDate && <span style={{ fontSize: 10, color: T.textFaint }}>Due {formatDate(task.dueDate)}</span>}
                            {task.assignedToName && <span style={{ fontSize: 10, color: T.textFaint }}>· {task.assignedToName}</span>}
                          </div>
                        </div>
                        <span style={pillStyle(T.textDim)}>{task.status.replace(/_/g, ' ')}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ EMAILS ══════════ */}
        {activeTab === "emails" && (
          <MatterEmails matterId={matterId} canManageLinks={["partner", "managing_partner", "admin", "super_admin"].includes(user?.role ?? "")} />
        )}

        {/* ══════════ RESEARCH ══════════ */}
        {activeTab === "research" && (
          <div className="governed-research" style={{ height: "100%", display: "flex", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", margin: 20, background: T.bg }}>
            {/* Research Sidebar */}
            <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${T.border}`, background: T.surface }}>
              <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
                <Button
                  variant="outline"
                  style={{ width: "100%", justifyContent: "center", gap: 6, background: `color-mix(in srgb, ${T.blue} 10%, transparent)`, color: T.blue, border: `1px solid color-mix(in srgb, ${T.blue} 30%, transparent)`, fontSize: 12 }}
                  onClick={() => setActiveResearchId(null)}
                >
                  <Plus size={14} /> New Research Run
                </Button>
              </div>
              <ResearchRegister matterId={matterId} activeId={activeResearchId} onSelect={setActiveResearchId} />
            </div>

            {/* Research Main */}
            <div style={{ flex: 1, overflowY: "auto", background: T.bg }}>
              {activeResearchId ? (
                researchLoading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    <Loader2 size={22} style={{ color: T.cyan, animation: "spin 1s linear infinite" }} />
                  </div>
                ) : activeResearchRecord ? (
                  <ResearchRecordView record={activeResearchRecord} onClose={() => setActiveResearchId(null)} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.textFaint }}>Record not found</div>
                )
              ) : (
                <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column" }}>
                  <div style={{ textAlign: "center", marginBottom: 28, marginTop: 12 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                      <Search size={26} style={{ color: "#fff" }} />
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>Matter Research</h2>
                    <p style={{ fontSize: 12, color: T.textDim, maxWidth: 460, margin: "0 auto" }}>
                      Execute a traceable query against internal precedents and external databases, automatically saved to this matter.
                    </p>
                  </div>
                  <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
                    <ResearchComposer preselectedMatterId={matterId} onCompleted={setActiveResearchId} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ AI ══════════ */}
        {activeTab === "ai" && (
          <div style={{ padding: 20 }}>
            {activeOutputId ? (
              <div style={{ height: 800, ...cardStyle }}>
                <AiOutputView outputId={activeOutputId} onClose={() => setActiveOutputId(null)} />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
                {/* Launcher */}
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 4 }}>Matter AI Workflows</p>
                  <p style={{ fontSize: 12, color: T.textDim, marginBottom: 16 }}>Select a governed workflow. All outputs are bound to this matter.</p>
                  <AiWorkflowLauncher fixedMatterId={matterId} onGenerated={(id) => setActiveOutputId(id)} />
                </div>

                {/* Activity Register */}
                <div style={{ ...cardStyle, display: "flex", flexDirection: "column", height: 800 }}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, background: T.surfaceEl, borderRadius: "10px 10px 0 0" }}>
                    <History size={13} style={{ color: T.cyan }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Activity Register</span>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {!aiConversations || aiConversations.length === 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 24, textAlign: "center" }}>
                        <Bot size={28} style={{ color: T.textFaint, opacity: 0.3, marginBottom: 10 }} />
                        <p style={{ fontSize: 12, color: T.textDim }}>No workflows yet</p>
                        <p style={{ fontSize: 11, color: T.textFaint, marginTop: 4 }}>Run a workflow to see it here.</p>
                      </div>
                    ) : (
                      <div>
                        {aiConversations.map(conv => (
                          <button
                            key={conv.id}
                            onClick={() => setActiveOutputId(conv.id)}
                            style={{ width: "100%", textAlign: "left", padding: "12px 14px", borderBottom: `1px solid ${T.borderSub}`, background: "transparent", cursor: "pointer" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              <span style={{ fontFamily: "monospace", fontSize: 10, color: T.textDim, background: T.surfaceEl, padding: "1px 6px", borderRadius: 4, border: `1px solid ${T.border}` }}>{conv.workflowLabel}</span>
                              {getRiskBadge(conv.riskLevel)}
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: "0 0 4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {conv.query || conv.title || "AI Output"}
                            </p>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 9, color: T.textFaint }}>{new Date(conv.createdAt).toLocaleDateString()}</span>
                              {conv.reviewStatus === "pending" && (
                                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: T.warn }}>Review Req</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ AUDIT ══════════ */}
        {activeTab === "audit" && (
          <div style={{ padding: 20 }}>
            <div style={{ ...cardStyle, padding: 18 }}>
              <SectionHeader>Audit Trail</SectionHeader>
              <p style={{ fontSize: 11, color: T.textDim, marginTop: -6, marginBottom: 14 }}>Immutable log of all actions taken on this matter</p>
              {!auditLogs || auditLogs.length === 0 ? (
                <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", padding: "32px 0" }}>No audit logs yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {auditLogs.map((log) => (
                    <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 8px", borderRadius: 6, fontFamily: "monospace" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                      <span style={{ fontSize: 10, color: T.textFaint, flexShrink: 0, width: 120 }}>{formatDate(log.createdAt)}</span>
                      <span style={{ fontSize: 10, color: T.textFaint, flexShrink: 0, width: 90, textTransform: "uppercase" }}>{log.action}</span>
                      <span style={{ flex: 1, fontSize: 10 }}>
                        {log.entityTitle && <span style={{ fontWeight: 700, color: T.text }}>{log.entityTitle}</span>}
                        {log.details && <span style={{ color: T.textDim, marginLeft: 6 }}>{log.details}</span>}
                      </span>
                      <span style={{ fontSize: 10, color: T.textFaint, flexShrink: 0 }}>{log.userName || 'System'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
