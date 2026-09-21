import './_group.css'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts"
import {
  AlertTriangle, FilePlus, UserPlus, Clock, CheckCircle2,
  Activity, ArrowRight, TrendingUp, ShieldAlert, ShieldCheck,
  Briefcase, FileText, GitMerge, CheckSquare, ChevronRight,
  Zap, Bell,
} from "lucide-react"

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        "#030A15",        // deepest navy
  surface:   "#071020",        // card bg
  surfaceHov:"#0B1830",        // card hover
  surfaceEl: "#0D1E35",        // elevated card
  border:    "#162440",        // card border
  borderSub: "#0D1A30",        // subtle divider
  text:      "#D4E5F7",        // primary text
  textDim:   "#5A80A8",        // secondary text
  textFaint: "#28446A",        // tertiary / placeholder
  ok:        "#22c55e",
  okDim:     "#15803d",
  warn:      "#f59e0b",
  warnDim:   "#92400e",
  risk:      "#ef4444",
  riskDim:   "#991b1b",
  blue:      "#4169E1",
  cyan:      "#00CFFF",
  grad0:     "#4169E1",        // gradient start (button / accent)
  grad1:     "#00CFFF",        // gradient end
}

// ── Mock data (same as Current) ───────────────────────────────────────────────
const STATS = {
  activeMatters: 47, ficaIssues: 3, conflictsPending: 2,
  pendingDocuments: 11, aiHighRiskDocs: 1, overdueTaskCount: 4,
  mattersAtRisk: 2, mattersAwaitingApproval: 5,
  unbilledHours: 28, openInvoices: 9, ficaCompliantRate: 87,
}
const FICA    = { compliant: 38, pending: 6, expired: 2, blocked: 1 }
const BILLING = { totalRevenue: 842000, outstanding: 127500, overdue: 34200 }

const PIPELINE = [
  { label: "Lead",           count: 8  },
  { label: "Conflict Check", count: 2  },
  { label: "Approved",       count: 5  },
  { label: "Active",         count: 47 },
  { label: "Review",         count: 6  },
  { label: "Completed",      count: 19 },
  { label: "Closed",         count: 14 },
]

const ACTIVITY = [
  { id: 1,  userName: "S. Petersen",   description: "created matter: Estate of M. Williams",     occurredAt: new Date(Date.now() - 12*60000).toISOString(),     kind: "create" },
  { id: 2,  userName: "T. Khoza",      description: "approved document: Settlement Agreement",   occurredAt: new Date(Date.now() - 28*60000).toISOString(),     kind: "approve" },
  { id: 3,  userName: "A. Botha",      description: "opened conflict check for J. van Rensburg", occurredAt: new Date(Date.now() - 45*60000).toISOString(),     kind: "conflict" },
  { id: 4,  userName: "System",        description: "FICA expiry warning: client B. Dlamini",    occurredAt: new Date(Date.now() - 68*60000).toISOString(),     kind: "warn" },
  { id: 5,  userName: "P. Naidoo",     description: "completed review of AI-drafted NDA",        occurredAt: new Date(Date.now() - 92*60000).toISOString(),     kind: "approve" },
  { id: 6,  userName: "S. Petersen",   description: "created client: Cape Industries (Pty) Ltd", occurredAt: new Date(Date.now() - 2.5*3600000).toISOString(), kind: "create" },
  { id: 7,  userName: "T. Khoza",      description: "paid invoice #INV-1041",                    occurredAt: new Date(Date.now() - 3.2*3600000).toISOString(), kind: "approve" },
  { id: 8,  userName: "A. Botha",      description: "flagged matter HM-2024-008 at risk",        occurredAt: new Date(Date.now() - 4.1*3600000).toISOString(), kind: "conflict" },
  { id: 9,  userName: "P. Naidoo",     description: "added time entry: 2.5h research",           occurredAt: new Date(Date.now() - 5.8*3600000).toISOString(), kind: "create" },
  { id: 10, userName: "System",        description: "conflict check completed: no conflicts found",occurredAt: new Date(Date.now() - 7.3*3600000).toISOString(), kind: "approve" },
]

const WORKLOAD = [
  { userId: 1, userName: "S. Petersen", initials: "SP", matterCount: 14 },
  { userId: 2, userName: "T. Khoza",    initials: "TK", matterCount: 11 },
  { userId: 3, userName: "A. Botha",    initials: "AB", matterCount: 9  },
  { userId: 4, userName: "P. Naidoo",   initials: "PN", matterCount: 8  },
  { userId: 5, userName: "C. Fourie",   initials: "CF", matterCount: 5  },
]

const PIPELINE_COLOR: Record<string, string> = {
  "Lead":           "#4A90D9",
  "Conflict Check": "#f59e0b",
  "Approved":       "#4169E1",
  "Active":         "#22c55e",
  "Review":         "#a78bfa",
  "Completed":      "#34d399",
  "Closed":         "#3A5878",
  "Archived":       "#2D4A6A",
}

const ACTIVITY_STYLE: Record<string, { color: string; bg: string; Icon: React.ElementType }> = {
  create:   { color: T.blue, bg: `${T.blue}20`,  Icon: FilePlus       },
  approve:  { color: T.ok,   bg: `${T.ok}18`,    Icon: CheckCircle2   },
  conflict: { color: T.risk, bg: `${T.risk}18`,  Icon: AlertTriangle  },
  warn:     { color: T.warn, bg: `${T.warn}18`,  Icon: ShieldAlert    },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(v)
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "now"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ── Shared primitives ─────────────────────────────────────────────────────────

/** Glass card with optional gradient border highlight */
function Card({ children, className = "", glow }: { children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <div
      className={`flex flex-col ${className}`}
      style={{
        background: T.surface,
        border: `1px solid ${glow ? T.blue + "50" : T.border}`,
        borderRadius: 12,
        boxShadow: glow ? `0 0 24px ${T.blue}18` : "0 2px 12px rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      {accent && <div className="h-3.5 w-[2px] rounded-full" style={{ background: accent }} />}
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.textFaint }}>
        {children}
      </p>
    </div>
  )
}

/** Compact metric row used inside side panels */
function MetricRow({
  label, value, color = T.text, highlight = false, last = false,
}: {
  label: string; value: string | number; color?: string; highlight?: boolean; last?: boolean
}) {
  return (
    <div
      className="flex items-center justify-between py-2 px-3 transition-colors"
      style={{
        borderBottom: last ? "none" : `1px solid ${T.borderSub}`,
        background:   highlight ? `${color}0C` : "transparent",
        borderRadius: 6,
        borderLeft:   highlight ? `2px solid ${color}` : "2px solid transparent",
        marginBottom: 2,
      }}
    >
      <span className="text-[11px]" style={{ color: highlight ? color : T.textDim }}>{label}</span>
      <span className="font-mono text-[13px] font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}

function RevTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-2.5 py-1.5 text-[10px] rounded-md" style={{ background: T.surfaceEl, border: `1px solid ${T.border}` }}>
      <span style={{ color: T.text }}>{fmt(payload[0].value)}</span>
    </div>
  )
}

// ── KPI strip ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, flag, icon: Icon, large }: {
  label: string; value: string | number; sub?: string
  flag?: "ok" | "warn" | "risk"; icon: React.ElementType; large?: boolean
}) {
  const accent = flag === "risk" ? T.risk : flag === "warn" ? T.warn : flag === "ok" ? T.ok : T.textFaint
  const showGlow = flag === "risk" || flag === "warn"
  return (
    <div
      className="flex flex-col gap-1.5 px-5 py-4"
      style={{
        background:   T.surface,
        border:       `1px solid ${T.border}`,
        borderRadius: 10,
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3 w-3" style={{ color: accent }} />
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.textFaint }}>{label}</p>
      </div>
      <p className={`font-light tabular-nums leading-none ${large ? "text-[28px]" : "text-[26px]"}`}
        style={{ color: accent === T.textFaint ? T.text : accent }}>
        {value}
      </p>
      {sub && <p className="text-[9px]" style={{ color: T.textFaint }}>{sub}</p>}
    </div>
  )
}

// ── Alert banner ──────────────────────────────────────────────────────────────
function AlertBanner({ items }: { items: Array<{ type: "risk" | "warn" | "info"; label: string }> }) {
  const risks = items.filter(i => i.type === "risk")
  const warns = items.filter(i => i.type === "warn")

  return (
    <Card className="mb-5">
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-center h-6 w-6 rounded-full" style={{ background: `${T.risk}20` }}>
          <Bell className="h-3 w-3" style={{ color: T.risk }} />
        </div>
        <span className="text-[11px] font-semibold" style={{ color: T.text }}>
          {items.length} items requiring your attention
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {risks.length > 0 && (
            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-full"
              style={{ background: `${T.risk}20`, color: T.risk }}>
              {risks.length} critical
            </span>
          )}
          {warns.length > 0 && (
            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-full"
              style={{ background: `${T.warn}20`, color: T.warn }}>
              {warns.length} warning
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px" style={{ background: T.border }}>
        {items.map((item, i) => {
          const color = item.type === "risk" ? T.risk : item.type === "warn" ? T.warn : T.blue
          return (
            <div key={i} className="flex items-center gap-2.5 px-4 py-2.5"
              style={{ background: T.surface }}>
              <div className="h-1 w-1 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-[11px]" style={{ color }}>{item.label}</span>
              <ChevronRight className="h-2.5 w-2.5 ml-auto shrink-0" style={{ color: T.textFaint }} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ── Pipeline ─────────────────────────────────────────────────────────────────
function PipelineSection({ pipeline }: { pipeline: typeof PIPELINE }) {
  const total = pipeline.reduce((s, p) => s + p.count, 0)
  return (
    <Card className="flex-1">
      <div className="px-5 py-4 flex flex-col h-full">
        <SectionLabel accent={T.blue}>Matter Pipeline</SectionLabel>
        <div className="flex flex-col gap-1.5 flex-1">
          {pipeline.map(p => {
            const pct = total > 0 ? (p.count / total) * 100 : 0
            const color = PIPELINE_COLOR[p.label] ?? T.blue
            return (
              <div key={p.label} className="flex items-center gap-3 group">
                <div className="flex items-center gap-2 w-28 shrink-0">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-[11px]" style={{ color: T.textDim }}>{p.label}</span>
                </div>
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 3, background: T.borderSub }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
                </div>
                <span className="font-mono text-[11px] w-5 text-right shrink-0" style={{ color: T.text }}>{p.count}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-1 mt-4 text-[10px] pt-3" style={{ borderTop: `1px solid ${T.borderSub}` }}>
          <span style={{ color: T.textFaint }}>Total: </span>
          <span className="font-semibold" style={{ color: T.text }}>{total} matters</span>
          <ArrowRight className="h-2.5 w-2.5 ml-auto" style={{ color: T.textFaint }} />
        </div>
      </div>
    </Card>
  )
}

// ── Revenue sparkline ─────────────────────────────────────────────────────────
function RevenueCard({ billing }: { billing: typeof BILLING }) {
  const sparkline = [
    { m: "Feb", v: billing.totalRevenue * 0.52 },
    { m: "Mar", v: billing.totalRevenue * 0.65 },
    { m: "Apr", v: billing.totalRevenue * 0.73 },
    { m: "May", v: billing.totalRevenue * 0.81 },
    { m: "Jun", v: billing.totalRevenue * 0.91 },
    { m: "Jul", v: billing.totalRevenue },
  ]
  return (
    <Card className="mt-4">
      <div className="px-5 py-4">
        <SectionLabel accent={T.cyan}>Revenue — 6-month trend</SectionLabel>
        <div className="flex items-end justify-between mb-3">
          <div>
            <span className="text-[26px] font-light tabular-nums" style={{ color: T.text }}>
              {fmt(billing.totalRevenue)}
            </span>
            <span className="ml-2 text-[10px] font-medium" style={{ color: T.ok }}>
              <TrendingUp className="inline h-2.5 w-2.5 mr-0.5" />+12.4% YTD
            </span>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-semibold" style={{ color: T.warn }}>{fmt(billing.outstanding)}</p>
            <p className="text-[9px] uppercase tracking-wide" style={{ color: T.textFaint }}>outstanding</p>
          </div>
        </div>
        <div style={{ height: 72 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rvG2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor={T.blue} />
                  <stop offset="100%" stopColor={T.cyan} />
                </linearGradient>
                <linearGradient id="rvFill2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={T.blue} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={T.cyan} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis dataKey="m" tick={{ fill: T.textFaint, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<RevTip />} cursor={{ stroke: T.border, strokeWidth: 1 }} />
              <Area type="monotone" dataKey="v" stroke="url(#rvG2)" strokeWidth={2}
                fill="url(#rvFill2)" dot={false} activeDot={{ r: 3, fill: T.cyan, stroke: "none" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  )
}

// ── Approval panel ────────────────────────────────────────────────────────────
function ApprovalPanel({ stats }: { stats: typeof STATS }) {
  const items = [
    { label: "Matters awaiting commencement", value: stats.mattersAwaitingApproval, color: T.blue,  flag: stats.mattersAwaitingApproval > 0  },
    { label: "Conflict checks pending",        value: stats.conflictsPending,         color: T.warn,  flag: stats.conflictsPending > 0          },
    { label: "Documents awaiting approval",    value: stats.pendingDocuments,         color: T.warn,  flag: stats.pendingDocuments > 5          },
    { label: "AI high-risk documents",         value: stats.aiHighRiskDocs,           color: T.risk,  flag: stats.aiHighRiskDocs > 0            },
    { label: "Matters flagged at risk",        value: stats.mattersAtRisk,            color: T.risk,  flag: stats.mattersAtRisk > 0             },
  ]
  return (
    <Card>
      <div className="px-5 py-4">
        <SectionLabel accent={T.warn}>Requires Approval</SectionLabel>
        <div className="flex flex-col gap-1">
          {items.map(d => (
            <MetricRow key={d.label} label={d.label} value={d.value} color={d.color} highlight={d.flag} />
          ))}
        </div>
      </div>
    </Card>
  )
}

// ── Team workload ─────────────────────────────────────────────────────────────
function WorkloadPanel({ workload }: { workload: typeof WORKLOAD }) {
  const max = Math.max(...workload.map(w => w.matterCount), 1)
  return (
    <Card className="mt-4">
      <div className="px-5 py-4">
        <SectionLabel accent={T.blue}>Team Workload</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {workload.map(m => {
            const pct = Math.round((m.matterCount / max) * 100)
            return (
              <div key={m.userId} className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center text-[8px] font-bold rounded-full text-white"
                  style={{
                    background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
                    boxShadow: `0 0 0 1px ${T.blue}50`,
                  }}>
                  {m.initials}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px]" style={{ color: T.textDim }}>{m.userName}</span>
                    <span className="font-mono text-[11px] font-semibold" style={{ color: T.text }}>{m.matterCount}</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 3, background: T.borderSub }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${T.blue}, ${T.cyan})` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────
function ActivityFeed({ activity }: { activity: typeof ACTIVITY }) {
  return (
    <Card className="h-full">
      <div className="px-5 py-4 flex flex-col h-full">
        <SectionLabel accent={T.cyan}>Recent Activity</SectionLabel>
        <div className="flex flex-col gap-0 flex-1">
          {activity.map((item, i, arr) => {
            const style = ACTIVITY_STYLE[item.kind] ?? { color: T.textFaint, bg: `${T.textFaint}10`, Icon: Activity }
            const { color, bg, Icon } = style
            return (
              <div key={item.id}
                className="flex items-start gap-3 py-2.5"
                style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSub}` : "none" }}>
                <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-snug" style={{ color: T.textDim }}>
                    <span className="font-semibold" style={{ color: T.text }}>{item.userName} </span>
                    {item.description}
                  </p>
                </div>
                <span className="font-mono text-[10px] shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                  style={{ color: T.textFaint, background: T.borderSub, whiteSpace: "nowrap" }}>
                  {timeAgo(item.occurredAt)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Quick nav */}
        <div className="flex items-center gap-1 mt-4 pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
          {["All matters", "Conflicts", "Billing", "Audit log"].map(l => (
            <button key={l}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] transition-colors"
              style={{ background: T.borderSub, color: T.textDim }}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Redesigned() {
  const stats    = STATS
  const billing  = BILLING
  const pipeline = PIPELINE
  const activity = ACTIVITY
  const workload = WORKLOAD

  const today = new Date().toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  const actionItems = [
    { type: "risk" as const, label: "1 client blocked — FICA compliance incomplete"                    },
    { type: "risk" as const, label: "2 matters flagged at risk"                                        },
    { type: "warn" as const, label: "1 AI-generated document flagged high-risk — approval required"    },
    { type: "warn" as const, label: `FICA compliance at ${stats.ficaCompliantRate}% — below threshold` },
    { type: "warn" as const, label: "4 tasks overdue"                                                  },
    { type: "info" as const, label: "2 conflict checks awaiting review"                                },
  ]

  return (
    <div className="min-h-screen flex flex-col" style={{ background: T.bg, fontFamily: "'Inter', sans-serif" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${T.border}` }}>
        <div>
          <h1 className="text-[13px] font-semibold tracking-tight" style={{ color: T.text }}>Dashboard</h1>
          <p className="text-[11px] mt-0.5" style={{ color: T.textFaint }}>{today}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Notification badge */}
          <div className="relative">
            <div className="flex items-center justify-center h-8 w-8 rounded-full"
              style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <Bell className="h-3.5 w-3.5" style={{ color: T.textDim }} />
            </div>
            <span className="absolute -top-1 -right-1 flex items-center justify-center h-4 w-4 rounded-full text-[8px] font-bold text-white"
              style={{ background: T.risk }}>{actionItems.length}</span>
          </div>

          {/* CTA */}
          <button className="flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-white rounded-lg"
            style={{ background: `linear-gradient(135deg, ${T.grad0}, ${T.grad1})`, boxShadow: `0 0 20px ${T.blue}40` }}>
            <Zap className="h-3 w-3" /> New Matter
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-6 py-5 overflow-y-auto">

        {/* Alert banner */}
        <AlertBanner items={actionItems} />

        {/* KPI strip */}
        <div className="grid grid-cols-6 gap-3 mb-5">
          <KpiCard label="Active Matters"    value={47}   icon={Briefcase}   />
          <KpiCard label="FICA Issues"       value={3}    icon={ShieldCheck} flag="risk" sub="2 expired · 1 blocked" />
          <KpiCard label="Conflicts Pending" value={2}    icon={GitMerge}    flag="warn" />
          <KpiCard label="Docs in Review"    value={11}   icon={FileText}    flag="warn" sub="1 AI high-risk" />
          <KpiCard label="Overdue Tasks"     value={4}    icon={CheckSquare} flag="risk" />
          <KpiCard label="Unbilled Hours"    value="28h"  icon={Clock}       flag="warn" sub="9 open invoices" />
        </div>

        {/* Three-column body */}
        <div className="grid grid-cols-3 gap-4" style={{ minHeight: 480 }}>

          {/* LEFT: Pipeline + Revenue */}
          <div className="flex flex-col gap-0">
            <PipelineSection pipeline={pipeline} />
            <RevenueCard billing={billing} />
          </div>

          {/* CENTRE: Approval + Workload */}
          <div className="flex flex-col">
            <ApprovalPanel stats={stats} />
            <WorkloadPanel workload={workload} />
          </div>

          {/* RIGHT: Activity */}
          <div className="flex flex-col" style={{ minHeight: 520 }}>
            <ActivityFeed activity={activity} />
          </div>
        </div>
      </div>
    </div>
  )
}
