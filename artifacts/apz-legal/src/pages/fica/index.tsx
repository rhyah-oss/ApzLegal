import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "wouter"
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle,
  CheckCircle2, XCircle, Clock, User, Building2, Landmark,
  RefreshCw, FileText, Search,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { PageLoader } from "@/components/ui/loader"
import { useGetCurrentUser } from "@workspace/api-client-react"
import { T, cardStyle, pillStyle } from "@/lib/theme"

// ── API fetch ─────────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""
async function apiFetch<R>(path: string, init?: RequestInit): Promise<R> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Status config ──────────────────────────────────────────────────────────────
const COMPLIANCE_META = {
  compliant:       { color: T.ok,   Icon: ShieldCheck,  label: "Compliant"       },
  review_required: { color: T.warn, Icon: ShieldAlert,  label: "Review Required" },
  blocked:         { color: T.risk, Icon: ShieldX,      label: "Blocked"         },
}

const DOC_STATUS_META: Record<string, { color: string; label: string }> = {
  missing:              { color: T.risk,      label: "Missing"              },
  uploaded:             { color: T.warn,      label: "Uploaded"             },
  pending_verification: { color: T.warn,      label: "Pending"              },
  verified:             { color: T.ok,        label: "Verified"             },
  rejected:             { color: T.risk,      label: "Rejected"             },
  expired:              { color: "#F97316",   label: "Expired"              },
}

const RISK_META = {
  low:    { color: T.ok,   label: "Low"    },
  medium: { color: T.warn, label: "Medium" },
  high:   { color: T.risk, label: "High"   },
}

const TYPE_ICON: Record<string, typeof User> = {
  individual: User, corporate: Building2, trust: Landmark, government: Landmark,
}

// ── Types ─────────────────────────────────────────────────────────────────────
type DashboardClient = {
  id: number; name: string; type: string
  complianceStatus: string; riskLevel: string; riskScore: number
  missing: number; rejected: number; expired: number; pending: number
  requirements: { type: string; label: string; critical: boolean; status: string }[]
}

type ExpiringFicaResponse = {
  days: number
  documents: { id: number; clientId: number; clientName: string; type: string; expiryDate: string; status: string; daysRemaining: number }[]
}

// ── KPI tile ─────────────────────────────────────────────────────────────────
function KpiTile({
  label, value, color, active, onClick,
}: {
  label: string; value: number; color: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        padding: "16px 0",
        background: active ? `${color}10` : T.surface,
        border: `1px solid ${active ? color + "50" : T.border}`,
        borderRadius: 10,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <span style={{ fontSize: 28, fontWeight: 300, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: active ? color : T.textFaint }}>
        {label}
      </span>
    </button>
  )
}

// ── Doc status cell ───────────────────────────────────────────────────────────
function DocCell({ status }: { status: string }) {
  if (status === "n/a") {
    return <span style={{ fontSize: 10, color: T.textFaint }}>—</span>
  }
  const meta = DOC_STATUS_META[status] ?? { color: T.textFaint, label: status }
  const icon =
    status === "verified"
      ? <CheckCircle2 style={{ width: 10, height: 10, color: T.ok, flexShrink: 0 }} />
      : status === "missing" || status === "rejected"
        ? <XCircle style={{ width: 10, height: 10, color: T.risk, flexShrink: 0 }} />
        : status === "expired"
          ? <AlertTriangle style={{ width: 10, height: 10, color: "#F97316", flexShrink: 0 }} />
          : <Clock style={{ width: 10, height: 10, color: T.warn, flexShrink: 0 }} />
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {icon}
      <span style={pillStyle(meta.color)}>{meta.label}</span>
    </span>
  )
}

export default function FicaDashboardPage() {
  const qc = useQueryClient()
  const [search, setSearch]       = useState("")
  const [filterStatus, setFilter] = useState<string>("all")

  const { data: clients, isLoading } = useQuery<DashboardClient[]>({
    queryKey: ["fica", "dashboard"],
    queryFn:  () => apiFetch("/fica/dashboard"),
  })
  const { data: currentUser } = useGetCurrentUser()
  const { data: expiring } = useQuery<ExpiringFicaResponse>({
    queryKey: ["fica", "expiring", 30],
    queryFn:  () => apiFetch("/fica/expiring?days=30"),
  })
  const canManageCompliance = ["compliance_officer", "partner", "managing_partner", "admin", "super_admin"].includes(currentUser?.role ?? "")

  const recompute = useMutation({
    mutationFn: (id: number) => apiFetch(`/clients/${id}/fica/recompute`, { method: "POST" }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["fica", "dashboard"] }),
  })

  const filtered = (clients ?? []).filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === "all"
      || c.complianceStatus === filterStatus
      || (filterStatus === "missing_documents" && c.missing > 0)
    return matchSearch && matchStatus
  })

  const blocked        = (clients ?? []).filter(c => c.complianceStatus === "blocked").length
  const reviewRequired = (clients ?? []).filter(c => c.complianceStatus === "review_required").length
  const compliant      = (clients ?? []).filter(c => c.complianceStatus === "compliant").length
  const totalMissing   = (clients ?? []).reduce((s, c) => s + c.missing, 0)

  // shared row-hover handler
  const onRowEnter = (e: React.MouseEvent<HTMLTableRowElement>) => {
    (e.currentTarget as HTMLElement).style.background = T.surfaceB
  }
  const onRowLeave = (e: React.MouseEvent<HTMLTableRowElement>) => {
    (e.currentTarget as HTMLElement).style.background = "transparent"
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, minHeight: "100%", padding: 24, gap: 20 }}>

      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
          FICA Compliance
        </h1>
        <p style={{ fontSize: 13, fontWeight: 600, color: T.text, marginTop: 4 }}>
          Client compliance status · document tracking · risk classification
        </p>
      </div>

      {/* Expiry alert */}
      {(expiring?.documents.length ?? 0) > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 14px", borderRadius: 8,
          background: `color-mix(in srgb, ${T.warn} 5.5%, transparent)`, border: `1px solid color-mix(in srgb, ${T.warn} 30%, transparent)`,
        }}>
          <AlertTriangle style={{ width: 13, height: 13, color: T.warn, flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: T.text, margin: 0 }}>
            <strong style={{ color: T.warn }}>{expiring!.documents.length} FICA document{expiring!.documents.length === 1 ? "" : "s"}</strong>
            {" "}expire in the next 30 days. Next: {expiring!.documents[0].clientName} — {expiring!.documents[0].type.replace(/_/g, " ")} ({expiring!.documents[0].daysRemaining} days).
          </p>
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 10 }}>
        <KpiTile label="Blocked"         value={blocked}        color={T.risk} active={filterStatus === "blocked"}         onClick={() => setFilter(filterStatus === "blocked"         ? "all" : "blocked")}         />
        <KpiTile label="Review Required" value={reviewRequired} color={T.warn} active={filterStatus === "review_required"} onClick={() => setFilter(filterStatus === "review_required" ? "all" : "review_required")} />
        <KpiTile label="Compliant"       value={compliant}      color={T.ok}   active={filterStatus === "compliant"}       onClick={() => setFilter(filterStatus === "compliant"       ? "all" : "compliant")}       />
        <KpiTile label="Docs Missing"    value={totalMissing}   color={T.risk} active={filterStatus === "missing_documents"} onClick={() => setFilter(filterStatus === "missing_documents" ? "all" : "missing_documents")} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative", maxWidth: 300 }}>
          <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: T.textFaint }} />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="h-8 pl-7 text-[11px]"
            style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text }}
          />
        </div>
        {filterStatus !== "all" && (
          <button
            onClick={() => setFilter("all")}
            style={{
              fontSize: 10, padding: "5px 12px", background: "transparent",
              border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer", borderRadius: 6,
            }}
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Table card */}
      <div style={{ ...cardStyle, overflow: "hidden", flex: 1 }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center" }}><PageLoader /></div>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", paddingTop: 48 }}>
            No clients match the current filter.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                  {["Client", "Type", "Compliance", "Risk", "ID / Passport", "Proof of Address", "Company Reg", "Beneficial Ownership", ""].map(h => (
                    <th key={h} style={{
                      padding: "8px 14px", fontSize: 9, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.1em",
                      color: T.textFaint, textAlign: "left", whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const cm   = COMPLIANCE_META[c.complianceStatus as keyof typeof COMPLIANCE_META] ?? COMPLIANCE_META.review_required
                  const rm   = RISK_META[c.riskLevel as keyof typeof RISK_META] ?? RISK_META.low
                  const Icon = TYPE_ICON[c.type] ?? User

                  const byType = Object.fromEntries(c.requirements.map(r => [r.type, r.status]))
                  const docCols = [
                    { key: "id_document",         fallback: byType["passport"] ?? null              },
                    { key: "proof_of_address",     fallback: null                                   },
                    { key: "company_registration", fallback: byType["trust_deed"] ?? byType["mandate_letter"] ?? null },
                    { key: "beneficial_ownership", fallback: null                                   },
                  ]

                  return (
                    <tr
                      key={c.id}
                      style={{ borderBottom: `1px solid ${T.borderSub}` }}
                      onMouseEnter={onRowEnter}
                      onMouseLeave={onRowLeave}
                    >
                      {/* Client name */}
                      <td style={{ padding: "9px 14px", borderLeft: `2px solid ${cm.color}` }}>
                        <Link href={`/clients/${c.id}`}>
                          <span
                            style={{ fontSize: 12, fontWeight: 600, color: T.text, cursor: "pointer" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.cyan }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.text }}
                          >
                            {c.name}
                          </span>
                        </Link>
                      </td>

                      {/* Type */}
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.textFaint, textTransform: "capitalize" }}>
                          <Icon style={{ width: 10, height: 10 }} /> {c.type}
                        </span>
                      </td>

                      {/* Compliance */}
                      <td style={{ padding: "9px 14px" }}>
                        <span style={pillStyle(cm.color)}>{cm.label}</span>
                      </td>

                      {/* Risk */}
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: rm.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {rm.label}
                        </span>
                      </td>

                      {/* Doc status cells */}
                      {docCols.map((col, i) => {
                        const rawStatus = byType[col.key] ?? (col.fallback ?? "n/a")
                        const status = rawStatus === "n/a" ? "n/a" : rawStatus
                        return (
                          <td key={i} style={{ padding: "9px 14px" }}>
                            <DocCell status={status} />
                          </td>
                        )
                      })}

                      {/* Actions */}
                      <td style={{ padding: "9px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Link href={`/clients/${c.id}?tab=compliance`}>
                            <button style={{
                              fontSize: 10, padding: "4px 10px", borderRadius: 6,
                              background: "transparent", border: `1px solid ${T.border}`,
                              color: T.textDim, cursor: "pointer",
                              display: "inline-flex", alignItems: "center", gap: 4,
                            }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                            >
                              <FileText style={{ width: 9, height: 9 }} /> Review
                            </button>
                          </Link>
                          {canManageCompliance && (
                            <button
                              onClick={() => recompute.mutate(c.id)}
                              title="Recompute compliance status"
                              style={{
                                padding: "4px 6px", borderRadius: 6, background: "transparent",
                                border: `1px solid ${T.border}`, color: T.textFaint, cursor: "pointer",
                                display: "inline-flex", alignItems: "center",
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.text; (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.textFaint; (e.currentTarget as HTMLElement).style.background = "transparent" }}
                            >
                              <RefreshCw style={{ width: 10, height: 10 }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 4 }}>
        {Object.entries(DOC_STATUS_META).map(([key, meta]) => (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, color: meta.color }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  )
}
