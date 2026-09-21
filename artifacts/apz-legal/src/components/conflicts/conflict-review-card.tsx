import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useReviewConflict,
  useGetCurrentUser,
  getListConflictsQueryKey,
} from "@workspace/api-client-react"
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Bot,
  UserCheck,
  Link as LinkIcon,
} from "lucide-react"
import { Link } from "wouter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/format"

const PARTNER_ROLES = ["partner", "managing_partner", "admin"]

export interface ConflictItemView {
  type: string
  description: string
  severity: string
  relatedMatterId?: number | null
  existingClient?: string | null
  existingMatterRef?: string | null
  relatedParty?: string | null
  reason?: string | null
}

export interface ConflictRecordView {
  id: number
  matterId?: number | null
  clientName?: string
  opposingParty?: string | null
  severity: string
  status: string
  conflicts?: ConflictItemView[]
  aiReasoning?: string | null
  reviewedByName?: string | null
  reviewDecision?: string | null
  reviewReason?: string | null
  reviewedAt?: string | null
  checkedAt: string
}

export function severityBadge(severity: string) {
  switch (severity) {
    case "none":   return <Badge variant="emerald"><CheckCircle2 className="mr-1 h-3 w-3" /> Clear</Badge>
    case "low":    return <Badge variant="slate"><AlertCircle className="mr-1 h-3 w-3" /> Low</Badge>
    case "medium": return <Badge variant="amber"><AlertTriangle className="mr-1 h-3 w-3" /> Medium</Badge>
    case "high":   return <Badge variant="red"><ShieldAlert className="mr-1 h-3 w-3" /> High</Badge>
    default:       return <Badge variant="outline">{severity}</Badge>
  }
}

export function statusBadge(status: string) {
  switch (status) {
    case "cleared":        return <Badge variant="emerald">Cleared</Badge>
    case "pending":        return <Badge variant="amber">Pending Review</Badge>
    case "approved":       return <Badge variant="emerald">Approved</Badge>
    case "rejected":       return <Badge variant="red">Rejected</Badge>
    case "further_review": return <Badge variant="purple">Further Review</Badge>
    case "flagged":        return <Badge variant="red">Flagged</Badge>
    default:               return <Badge variant="outline">{status}</Badge>
  }
}

/**
 * Full conflict result display + partner review actions.
 * Used on the matter workspace and the conflicts register.
 */
export function ConflictReviewCard({
  record,
  onReviewed,
}: {
  record: ConflictRecordView
  onReviewed?: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: user } = useGetCurrentUser()
  const review = useReviewConflict()
  const [reason, setReason] = useState("")

  const isPartner = PARTNER_ROLES.includes(user?.role ?? "")
  const reviewable = ["pending", "further_review"].includes(record.status)

  function submit(decision: "approve" | "reject" | "request_further_review") {
    if (reason.trim().length < 3) {
      toast({ title: "Reason required", description: "Record a reason for this decision.", variant: "destructive" })
      return
    }
    review.mutate(
      { id: record.id, data: { decision, reason: reason.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConflictsQueryKey() })
          queryClient.invalidateQueries({ queryKey: ["/api/matters"] })
          toast({ title: "Review recorded", description: `Decision: ${decision.replace(/_/g, " ")}.` })
          setReason("")
          onReviewed?.()
        },
        onError: (err: any) => {
          toast({
            title: "Review failed",
            description: err?.data?.error ?? "Unable to record the review.",
            variant: "destructive",
          })
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge(record.status)}
        {severityBadge(record.severity)}
        <span className="text-xs text-muted-foreground">Checked {formatDate(record.checkedAt)}</span>
      </div>

      {/* Parties */}
      <div className="text-sm text-slate-300">
        <span className="font-medium">{record.clientName}</span>
        {record.opposingParty && <span className="text-muted-foreground"> vs {record.opposingParty}</span>}
      </div>

      {/* Flags */}
      {record.conflicts && record.conflicts.length > 0 ? (
        <div className="space-y-3">
          {record.conflicts.map((c, i) => (
            <div key={i} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-200 capitalize">{c.type.replace(/_/g, " ")}</span>
                {severityBadge(c.severity)}
              </div>
              <p className="text-slate-400 text-xs">{c.description}</p>
              <div className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                {c.existingClient && (
                  <div><span className="text-muted-foreground">Existing Client: </span><span className="text-slate-300">{c.existingClient}</span></div>
                )}
                {c.relatedParty && (
                  <div><span className="text-muted-foreground">Related Party: </span><span className="text-slate-300">{c.relatedParty}</span></div>
                )}
                {c.existingMatterRef && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Existing Matter: </span>
                    {c.relatedMatterId ? (
                      <Link href={`/matters/${c.relatedMatterId}`} className="text-primary hover:underline inline-flex items-center gap-0.5">
                        <LinkIcon className="h-3 w-3" />{c.existingMatterRef}
                      </Link>
                    ) : (
                      <span className="text-slate-300">{c.existingMatterRef}</span>
                    )}
                  </div>
                )}
              </div>
              {c.reason && (
                <p className="text-xs text-amber-300/80 pt-0.5">Reason: {c.reason}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> No conflicts detected — clear to proceed.
        </div>
      )}

      {/* AI reasoning */}
      {record.aiReasoning && (
        <div className="rounded-lg border border-[#6366F1]/20 bg-[#6366F1]/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[#8B8DF7] mb-1">
            <Bot className="h-3.5 w-3.5" /> AI Reasoning
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{record.aiReasoning}</p>
        </div>
      )}

      {/* Review record */}
      {record.reviewedByName && record.reviewDecision && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-medium text-slate-300">
            <UserCheck className="h-3.5 w-3.5" /> Partner Review
          </div>
          <div><span className="text-muted-foreground">Reviewer: </span><span className="text-slate-300">{record.reviewedByName}</span></div>
          <div><span className="text-muted-foreground">Decision: </span><span className="text-slate-300 capitalize">{record.reviewDecision.replace(/_/g, " ")}</span></div>
          {record.reviewReason && <div><span className="text-muted-foreground">Reason: </span><span className="text-slate-300">{record.reviewReason}</span></div>}
          {record.reviewedAt && <div><span className="text-muted-foreground">Date: </span><span className="text-slate-300">{formatDate(record.reviewedAt)}</span></div>}
        </div>
      )}

      {/* Partner actions */}
      {reviewable && (
        isPartner ? (
          <div className="space-y-2 pt-1">
            <Textarea
              placeholder="Reason for decision (required, recorded in the audit trail)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-sm min-h-[64px]"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => submit("approve")} disabled={review.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => submit("reject")} disabled={review.isPending}>
                Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => submit("request_further_review")} disabled={review.isPending}>
                Request Further Review
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-amber-300/80 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Awaiting partner review — only a partner can approve or reject this conflict result.
          </p>
        )
      )}
    </div>
  )
}
