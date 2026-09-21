import './_group.css'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts"
import {
  AlertTriangle, FilePlus, UserPlus, Clock, CheckCircle2,
  Activity, ArrowRight, TrendingUp, ShieldAlert, ShieldCheck,
  Briefcase, Users, FileText, GitMerge, Receipt, Bot,
  CheckSquare, Info, CalendarDays, UserCheck,
} from "lucide-react"

// ── Token set (identical to main app) ────────────────────────────────────────
const T = {
  bg:        "#040C1A",
  surface:   "#060D1B",
  surfaceB:  "#08101F",
  rule:      "#1A2D4A",
  rule2:     "#0F1E30",
  text:      "#C8DAEA",
  textDim:   "#5A7FA8",
  textFaint: "#2D4A6A",
  ok:        "#22c55e",
  warn:      "#f59e0b",
  risk:      "#ef4444",
  blue:      "#4169E1",
  cyan:      "#00CFFF",
}

// ── Static mock data ──────────────────────────────────────────────────────────
const STATS = {
  activeMatters: 47,
  ficaIssues: 3,
  conflictsPending: 2,
  pendingDocuments: 11,
  aiHighRiskDocs: 1,
  overdueTaskCount: 4,
  mattersAtRisk: 2,
  mattersAwaitingApproval: 5,
  unbilledHours: 28,
  openInvoices: 9,
  ficaCompliantRate: 87,
}

const FICA = { compliant: 38, pending: 6, expired: 2, blocked: 1 }

const BILLING = {
  totalRevenue: 842000,
  outstanding: 127500,
  overdue: 34200,
}

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
  { id: 1,  userName: "S. Petersen",   description: "created matter: Estate of M. Williams",    occurredAt: new Date(Date.now() - 12*60000).toISOString() },
  { id: 2,  userName: "T. Khoza",      description: "approved document: Settlement Agreement",  occurredAt: new Date(Date.now() - 28*60000).toISOString() },
  { id: 3,  userName: "A. Botha",      description: "opened conflict check for J. van Rensburg",occurredAt: new Date(Date.now() - 45*60000).toISOString() },
  { id: 4,  userName: "System",        description: "FICA expiry warning: client B. Dlamini",   occurredAt: new Date(Date.now() - 68*60000).toISOString() },
  { id: 5,  userName: "P. Naidoo",     description: "completed review of AI-drafted NDA",       occurredAt: new Date(Date.now() - 92*60000).toISOString() },
  { id: 6,  userName: "S. Petersen",   description: "created client: Cape Industries (Pty) Ltd",occurredAt: new Date(Date.now() - 2.5*3600000).toISOString() },
  { id: 7,  userName: "T. Khoza",      description: "paid invoice #INV-1041",                   occurredAt: new Date(Date.now() - 3.2*3600000).toISOString() },
  { id: 8,  userName: "A. Botha",      description: "flagged matter HM-2024-008 at risk",       occurredAt: new Date(Date.now() - 4.1*3600000).toISOString() },
  { id: 9,  userName: "P. Naidoo",     description: "added time entry: 2.5h research",          occurredAt: new Date(Date.now() - 5.8*3600000).toISOString() },
  { id: 10, userName: "System",        description: "conflict check completed: no conflicts found", occurredAt: new Date(Date.now() - 7.3*3600000).toISOString() },
]

const WORKLOAD = [
  { userId: 1, userName: "S. Petersen",  matterCount: 14 },
  { userId: 2, userName: "T. Khoza",     matterCount: 11 },
  { userId: 3, userName: "A. Botha",     matterCount: 9  },
  { userId: 4, userName: "P. Naidoo",    matterCount: 8  },
  { userId: 5, userName: "C. Fourie",    matterCount: 5  },
]

const PIPELINE_COLOR: Record<string, string> = {
  "Lead":           "#5A7FA8",
  "Conflict Check": "#f59e0b",
  "Approved":       "#4169E1",
  "Active":         "#22c55e",
  "Review":         "#a78bfa",
  "Completed":      "#34d399",
  "Closed":         "#3A5878",
  "Archived":       "#2D4A6A",
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(v)
}

function getInitials(name: string) {
  return name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1)  return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function activityMeta(desc: string): { color: string; Icon: React.ElementType } {
  if (/created|opened/i.test(desc))      return { color: T.blue,     Icon: FilePlus      }
  if (/client|contact/i.test(desc))      return { color: T.cyan,     Icon: UserPlus      }
  if (/time|hour/i.test(desc))           return { color: T.textDim,  Icon: Clock         }
  if (/complet|closed|paid/i.test(desc)) return { color: T.ok,       Icon: CheckCircle2  }
  if (/conflict/i.test(desc))            return { color: T.risk,     Icon: AlertTriangle }
  return { color: T.textFaint, Icon: Activity }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, flag, icon: Icon }: {
  label: string; value: string | number; sub?: string
  flag?: "ok" | "warn" | "risk"; icon: React.ElementType
}) {
  const valColor = flag === "risk" ? T.risk : flag === "warn" ? T.warn : flag === "ok" ? T.ok : T.text
  return (
    <div className="flex flex-col gap-1 px-4 py-3" style={{ borderRight: `1px solid ${T.rule}` }}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0" style={{ color: T.textFaint }} />
        <p className="text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: T.textFaint }}>{label}</p>
      </div>
      <p className="text-[24px] font-light tabular-nums leading-none" style={{ color: valColor }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: T.textDim }}>{sub}</p>}
    </div>
  )
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] shrink-0" style={{ color: T.textFaint }}>{children}</p>
      <div className="flex-1 h-px" style={{ background: T.rule }} />
    </div>
  )
}

function PipelineBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const color = PIPELINE_COLOR[label] ?? T.blue
  return (
    <div className="flex items-center gap-3 py-1.5" style={{ borderBottom: `1px solid ${T.rule2}` }}>
      <div className="flex items-center gap-2 w-28 shrink-0">
        <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[11px]" style={{ color: T.textDim }}>{label}</span>
      </div>
      <div className="flex-1 h-px relative" style={{ background: T.rule2 }}>
        <div className="h-full absolute top-0 left-0" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-[11px] w-5 text-right shrink-0" style={{ color: T.text }}>{count}</span>
    </div>
  )
}

function BannerRow({ type, label }: { type: "risk" | "warn" | "info"; label: string }) {
  const color = type === "risk" ? T.risk : type === "warn" ? T.warn : T.blue
  return (
    <div className="flex items-center gap-3 px-6 py-2" style={{ borderBottom: `1px solid ${T.rule2}` }}>
      <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-[11px] flex-1" style={{ color }}>{label}</span>
      <ArrowRight className="h-3 w-3" style={{ color: T.textFaint }} />
    </div>
  )
}

function RevTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-2 py-1 text-[10px]" style={{ background: T.surface, border: `1px solid ${T.rule}` }}>
      <span style={{ color: T.text }}>{formatCurrency(payload[0].value)}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Current() {
  const stats   = STATS
  const fica    = FICA
  const billing = BILLING
  const workload = WORKLOAD
  const pipeline = PIPELINE
  const activity = ACTIVITY

  const ficaRate = stats.ficaCompliantRate
  const ficaOk   = ficaRate >= 90
  const pipelineTotal = pipeline.reduce((s, r) => s + r.count, 0)

  const sparkline = [
    { m: "Feb", v: billing.totalRevenue * 0.52 },
    { m: "Mar", v: billing.totalRevenue * 0.65 },
    { m: "Apr", v: billing.totalRevenue * 0.73 },
    { m: "May", v: billing.totalRevenue * 0.81 },
    { m: "Jun", v: billing.totalRevenue * 0.91 },
    { m: "Jul", v: billing.totalRevenue },
  ]

  const actionItems = [
    { type: "risk" as const, label: "1 client blocked — FICA compliance incomplete" },
    { type: "risk" as const, label: "2 matters flagged at risk" },
    { type: "warn" as const, label: "1 AI-generated document flagged high-risk — approval required" },
    { type: "warn" as const, label: `FICA compliance at ${ficaRate}% — below 90% firm threshold` },
    { type: "warn" as const, label: "4 tasks overdue" },
    { type: "info" as const, label: "2 conflict checks awaiting review" },
  ]

  const today = new Date().toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  })

  return (
    <div className="flex flex-col min-h-screen" style={{ background: T.bg, fontFamily: "'Inter', sans-serif" }}>

      {/* ── Page header ── */}
      <div className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: `1px solid ${T.rule}` }}>
        <div>
          <h1 className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text }}>Dashboard</h1>
          <p className="text-[10px] mt-0.5" style={{ color: T.textFaint }}>{today}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px]" style={{ color: T.warn }}>
            <ShieldAlert className="h-3 w-3" />
            {actionItems.length} items requiring attention
          </span>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white"
            style={{ background: T.blue }}>
            New Matter <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── Attention banners ── */}
      <div style={{ borderBottom: `1px solid ${T.rule}` }}>
        {actionItems.map((a, i) => <BannerRow key={i} type={a.type} label={a.label} />)}
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-6" style={{ borderBottom: `1px solid ${T.rule}` }}>
        <KpiTile label="Active Matters"    value={47}    icon={Briefcase}   />
        <KpiTile label="FICA Issues"       value={3}     icon={ShieldCheck} flag="risk" sub="2 expired · 1 blocked" />
        <KpiTile label="Conflicts Pending" value={2}     icon={GitMerge}    flag="warn" />
        <KpiTile label="Docs in Review"    value={11}    icon={FileText}    flag="warn" sub="1 AI high-risk" />
        <KpiTile label="Overdue Tasks"     value={4}     icon={CheckSquare} flag="risk" />
        <KpiTile label="Unbilled Hours"    value="28h"   icon={Clock}       flag="warn" sub="9 open invoices" />
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0" style={{ minHeight: 480 }}>

        {/* LEFT: Pipeline + Revenue */}
        <div className="flex flex-col" style={{ width: "32%", borderRight: `1px solid ${T.rule}` }}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.rule}` }}>
            <RowLabel>Matter Pipeline — {pipelineTotal} total</RowLabel>
            {pipeline.map(s => (
              <PipelineBar key={s.label} label={s.label} count={s.count} total={pipelineTotal} />
            ))}
            <div className="flex items-center gap-1 mt-3 text-[10px]" style={{ color: T.textFaint }}>
              View all matters <ArrowRight className="h-2.5 w-2.5" />
            </div>
          </div>

          <div className="flex-1 px-5 py-4">
            <RowLabel>Revenue — 6-month trend</RowLabel>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <span className="text-[20px] font-light tabular-nums" style={{ color: T.text }}>
                  {formatCurrency(billing.totalRevenue)}
                </span>
                <span className="ml-2 text-[10px] text-emerald-400">
                  <TrendingUp className="inline h-2.5 w-2.5 mr-0.5" />YTD
                </span>
              </div>
              <div className="text-right">
                <p className="text-[11px]" style={{ color: T.risk }}>{formatCurrency(billing.outstanding)}</p>
                <p className="text-[9px]" style={{ color: T.textFaint }}>outstanding</p>
              </div>
            </div>
            <div style={{ height: 70 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkline} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={T.blue} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={T.blue} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="m" tick={{ fill: T.textFaint, fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<RevTip />} />
                  <Area type="monotone" dataKey="v" stroke={T.blue} strokeWidth={1.5} fill="url(#rv)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* CENTRE: Senior panel (approval + workload) */}
        <div className="flex flex-col" style={{ width: "32%", borderRight: `1px solid ${T.rule}` }}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.rule}` }}>
            <RowLabel>Requires Your Approval</RowLabel>
            <div className="space-y-1">
              {[
                { label: "Matters awaiting commencement", value: 5,  color: T.blue, flag: true  },
                { label: "Conflict checks pending",        value: 2,  color: T.warn, flag: true  },
                { label: "Documents awaiting approval",    value: 11, color: T.warn, flag: true  },
                { label: "AI high-risk documents",         value: 1,  color: T.risk, flag: true  },
                { label: "Matters flagged at risk",        value: 2,  color: T.risk, flag: true  },
              ].map(d => (
                <div key={d.label}
                  className="flex items-center justify-between px-3 py-1.5"
                  style={{ borderLeft: `2px solid ${d.flag ? d.color : T.rule}`, background: `${d.color}0A` }}>
                  <span className="text-[11px]" style={{ color: d.color }}>{d.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[13px] font-semibold" style={{ color: d.color }}>{d.value}</span>
                    <ArrowRight className="h-3 w-3" style={{ color: T.textFaint }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 px-5 py-4 overflow-y-auto">
            <RowLabel>Team Workload</RowLabel>
            {workload.map((m, i, arr) => {
              const maxCount = Math.max(...arr.map(x => x.matterCount), 1)
              const pct = Math.round((m.matterCount / maxCount) * 100)
              return (
                <div key={m.userId} className="flex items-center gap-3 py-1.5"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.rule2}` : "none" }}>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center text-[8px] font-bold text-white"
                    style={{ background: "#1A3060", border: `1px solid #2A4A80` }}>
                    {getInitials(m.userName)}
                  </div>
                  <span className="text-[10px] w-20 shrink-0 truncate" style={{ color: T.textDim }}>{m.userName}</span>
                  <div className="flex-1 h-px relative" style={{ background: T.rule2 }}>
                    <div className="h-full absolute top-0 left-0" style={{ width: `${pct}%`, background: T.blue }} />
                  </div>
                  <span className="font-mono text-[10px] w-4 text-right shrink-0" style={{ color: T.text }}>{m.matterCount}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT: Activity feed */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <RowLabel>Recent Activity</RowLabel>
            {activity.map((item, i, arr) => {
              const { color, Icon } = activityMeta(item.description)
              return (
                <div key={item.id}
                  className="flex gap-3 py-2.5"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.rule2}` : "none" }}>
                  <Icon className="h-3 w-3 shrink-0 mt-0.5" style={{ color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] leading-snug" style={{ color: T.textDim }}>
                      <span className="font-medium" style={{ color: T.text }}>{item.userName}</span>
                      {" "}{item.description}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] shrink-0 mt-0.5 whitespace-nowrap" style={{ color: T.textFaint }}>
                    {timeAgo(item.occurredAt)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Quick nav footer */}
          <div className="px-5 py-2.5 flex items-center gap-5" style={{ borderTop: `1px solid ${T.rule}` }}>
            {["All matters", "Conflicts", "Billing", "Audit log"].map(l => (
              <div key={l} className="flex items-center gap-1 text-[10px]" style={{ color: T.textFaint }}>
                {l} <ArrowRight className="h-2.5 w-2.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
