import { Fragment, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Search, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react"
import { Link as RouterLink } from "wouter"

import { useRunConflictCheck, useListConflicts, getListConflictsQueryKey } from "@workspace/api-client-react"

type ConflictRecordSeverity = string
type ConflictRecordStatus = string
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageLoader } from "@/components/ui/loader"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/format"
import {
  ConflictReviewCard,
  severityBadge,
  statusBadge,
  type ConflictRecordView,
} from "@/components/conflicts/conflict-review-card"
import { T, cardStyle, pillStyle } from "@/lib/theme"

const conflictCheckSchema = z.object({
  clientName: z.string().min(2, "Client name is required"),
  opposingParty: z.string().optional(),
})

type ConflictCheckFormValues = z.infer<typeof conflictCheckSchema>

// ── Shared label style ────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: T.textFaint,
  textTransform: "uppercase",
  letterSpacing: "0.09em",
  display: "block",
  marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  background: T.surfaceEl,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  color: T.text,
  fontSize: 12,
  outline: "none",
}

export default function ConflictsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: conflicts, isLoading: conflictsLoading, isError: conflictsError, refetch: refetchConflicts } = useListConflicts()
  const runCheck = useRunConflictCheck()

  const form = useForm<ConflictCheckFormValues>({
    resolver: zodResolver(conflictCheckSchema),
    defaultValues: { clientName: "", opposingParty: "" },
  })

  function onSubmit(data: ConflictCheckFormValues) {
    runCheck.mutate(
      { data },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListConflictsQueryKey() })
          if (result.hasConflicts) {
            toast({
              title: "Conflicts Found",
              description: `Potential conflicts identified — severity: ${result.severity}.`,
              variant: "destructive",
            })
          } else {
            toast({ title: "Clear", description: "No conflicts found for this party." })
            form.reset()
          }
        },
        onError: () => {
          toast({ title: "Check Failed", description: "An error occurred while running the conflict check.", variant: "destructive" })
        },
      }
    )
  }

  const getSeverityBadge = severityBadge
  const getStatusBadge = statusBadge

  const filtered = search
    ? conflicts?.filter(c =>
        String(c.matterId).includes(search) ||
        (c.clientName || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.opposingParty || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.reviewedByName || "").toLowerCase().includes(search.toLowerCase())
      )
    : conflicts

  return (
    <div className="conflicts-page" style={{ flex: 1, minHeight: 0, background: T.bg, padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Page header ── */}
      <div>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
          Conflict Checks
        </h2>
        <p style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>
          Run and manage conflict of interest checks across all matters.
        </p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="conflicts-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, alignItems: "start" }}>

        {/* ── Run Check Panel ── */}
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          {/* Card header */}
          <div style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Run New Check</span>
            <span style={{ fontSize: 11, color: T.textDim }}>Search the firm's database for potential conflicts</span>
          </div>

          {/* Form body */}
          <div style={{ padding: "18px" }}>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel style={labelStyle}>Client / Party Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter name to check…"
                          {...field}
                          style={inputStyle}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="opposingParty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel style={labelStyle}>Opposing Party (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter opposing party name…"
                          {...field}
                          style={inputStyle}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <button
                  type="submit"
                  disabled={runCheck.isPending}
                  style={{
                    width: "100%",
                    height: 36,
                    background: runCheck.isPending
                      ? T.surfaceEl
                      : `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: runCheck.isPending ? T.textDim : "#fff",
                    cursor: runCheck.isPending ? "not-allowed" : "pointer",
                    transition: "opacity 0.15s",
                    marginTop: 4,
                  }}
                >
                  {runCheck.isPending ? "Scanning database…" : "Run Conflict Check"}
                </button>

                {runCheck.isSuccess && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: `1px solid ${runCheck.data.hasConflicts ? `color-mix(in srgb, ${T.risk} 30%, transparent)` : `color-mix(in srgb, ${T.ok} 30%, transparent)`}`,
                      background: runCheck.data.hasConflicts ? `color-mix(in srgb, ${T.risk} 5.5%, transparent)` : `color-mix(in srgb, ${T.ok} 5.5%, transparent)`,
                    }}
                  >
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 12,
                      fontWeight: 600,
                      color: runCheck.data.hasConflicts ? T.risk : T.ok,
                      marginBottom: 6,
                    }}>
                      {runCheck.data.hasConflicts
                        ? <AlertTriangle size={14} />
                        : <CheckCircle2 size={14} />}
                      {runCheck.data.hasConflicts ? "Conflicts Identified" : "Clear to Proceed"}
                    </div>
                    {runCheck.data.aiReasoning && (
                      <p style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5, margin: 0 }}>
                        {runCheck.data.aiReasoning}
                      </p>
                    )}
                  </div>
                )}
              </form>
            </Form>
          </div>
        </div>

        {/* ── History table panel ── */}
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          {/* Panel header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${T.border}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Recent Conflict Checks</span>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: T.textFaint, pointerEvents: "none" }} />
              <input
                type="search"
                placeholder="Search history…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  height: 32,
                  width: 200,
                  paddingLeft: 28,
                  paddingRight: 10,
                  background: T.surfaceEl,
                  border: `1px solid ${T.border}`,
                  borderRadius: 7,
                  color: T.text,
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                {["Date", "Parties", "Matter", "Severity", "Status", "Reviewed By"].map(h => (
                  <TableHead
                    key={h}
                    style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: T.textFaint }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {conflictsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ height: 96, textAlign: "center" }}>
                    <PageLoader />
                  </TableCell>
                </TableRow>
              ) : conflictsError ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ height: 120, textAlign: "center" }}>
                    <div className="list-state">
                      <AlertTriangle size={16} />
                      <strong>Conflict history could not be loaded</strong>
                      <span>Check your connection and try again.</span>
                      <button type="button" onClick={() => refetchConflicts()}>Retry</button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ height: 120, textAlign: "center" }}>
                    <div className="list-state">
                      <ShieldCheck size={16} />
                      <strong>{search ? "No matching checks" : "No conflict checks yet"}</strong>
                      <span>{search ? "Try a different search term." : "Run a check to create a review record."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered?.map((record) => (
                  <Fragment key={record.id}>
                    <TableRow
                      style={{ borderBottom: `1px solid ${T.borderSub}`, cursor: "pointer" }}
                      onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    >
                      <TableCell style={{ fontSize: 11, color: T.textDim, whiteSpace: "nowrap" }}>
                        {formatDate(record.checkedAt)}
                      </TableCell>
                      <TableCell style={{ fontSize: 12 }}>
                        <span style={{ color: T.text }}>{record.clientName}</span>
                        {record.opposingParty && (
                          <span style={{ color: T.textDim }}> vs {record.opposingParty}</span>
                        )}
                      </TableCell>
                      <TableCell style={{ fontFamily: "monospace", fontSize: 11 }}>
                        {record.matterId ? (
                          <RouterLink
                            href={`/matters/${record.matterId}`}
                            style={{ color: T.blue }}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            #{record.matterId}
                          </RouterLink>
                        ) : "--"}
                      </TableCell>
                      <TableCell>{getSeverityBadge(record.severity)}</TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell style={{ fontSize: 12, color: T.textDim }}>
                        {record.reviewedByName || "--"}
                      </TableCell>
                    </TableRow>
                    {expandedId === record.id && (
                      <TableRow style={{ borderBottom: `1px solid ${T.borderSub}` }}>
                        <TableCell
                          colSpan={6}
                          style={{
                            padding: "14px 18px",
                            background: T.surfaceB,
                          }}
                        >
                          <ConflictReviewCard record={record as ConflictRecordView} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
