import './_group.css'
import React, { useState } from 'react'
import {
  AlertTriangle, FilePlus, UserPlus, Clock, CheckCircle2,
  Activity, ArrowRight, TrendingUp, ShieldAlert, ShieldCheck,
  Briefcase, FileText, GitMerge, CheckSquare, ChevronRight,
  Zap, Bell, CalendarDays, UserCheck, LayoutDashboard,
  Users, Scale, FileSearch, Receipt, Settings, LogOut,
  ChevronDown, BarChart2, Search, Plus,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:         '#030A15',
  sidebar:    '#060D1C',
  surface:    '#071020',
  surfaceB:   '#0B1830',
  surfaceEl:  '#0D1E35',
  border:     '#162440',
  borderSub:  '#0D1A30',
  text:       '#D4E5F7',
  textDim:    '#5A80A8',
  textFaint:  '#28446A',
  ok:         '#4F9A7A',
  warn:       '#B3833A',
  risk:       '#B75D63',
  blue:       '#4169E1',
  cyan:       '#00CFFF',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v)
}
function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

// ── Static mock data ──────────────────────────────────────────────────────────
const MOCK_USER = { name: 'Andile Khumalo', role: 'Managing Partner', initials: 'AK' }

const MOCK_STATS = {
  activeMatters:        47,
  ficaIssues:           3,
  ficaCompliantRate:    87,
  conflictsPending:     5,
  pendingDocuments:     12,
  aiHighRiskDocs:       2,
  overdueTaskCount:     4,
  unbilledHours:        38,
  openInvoices:         9,
  mattersAwaitingApproval: 6,
  mattersAtRisk:        2,
}

const MOCK_FICA = { compliant: 134, pending: 18, expired: 2, blocked: 1 }

const MOCK_BILLING = {
  totalRevenue: 2_840_000,
  outstanding:  620_000,
  overdue:      185_000,
}

const MOCK_PIPELINE = [
  { label: 'Lead',           count: 8  },
  { label: 'Conflict Check', count: 5  },
  { label: 'Approved',       count: 11 },
  { label: 'Active',         count: 47 },
  { label: 'Review',         count: 9  },
  { label: 'Completed',      count: 23 },
  { label: 'Closed',         count: 31 },
]

const PIPELINE_COLOR: Record<string, string> = {
  'Lead':           '#5A80A8',
  'Conflict Check': '#B3833A',
  'Approved':       '#4169E1',
  'Active':         '#4F9A7A',
  'Review':         '#7F75B5',
  'Completed':      '#5B9078',
  'Closed':         '#3A5878',
}

const MOCK_WORKLOAD = [
  { userId: '1', userName: 'Andile Khumalo',   matterCount: 14 },
  { userId: '2', userName: 'Nothando Dlamini', matterCount: 11 },
  { userId: '3', userName: 'Sipho Mokoena',    matterCount: 9  },
  { userId: '4', userName: 'Lindiwe Nkosi',    matterCount: 7  },
  { userId: '5', userName: 'Thabo Sithole',    matterCount: 6  },
  { userId: '6', userName: 'Zanele Mthembu',   matterCount: 4  },
]

const MOCK_ACTIVITY = [
  { id: 1,  userName: 'Nothando Dlamini', description: 'created Matter M-2024-0391 for Sasol Ltd',          occurredAt: new Date(Date.now() - 8   * 60000).toISOString() },
  { id: 2,  userName: 'System',           description: 'conflict check completed — no conflicts found',      occurredAt: new Date(Date.now() - 22  * 60000).toISOString() },
  { id: 3,  userName: 'Sipho Mokoena',    description: 'time entry logged — 3.5h on M-2024-0367',           occurredAt: new Date(Date.now() - 55  * 60000).toISOString() },
  { id: 4,  userName: 'Zanele Mthembu',   description: 'client contact added — Standard Bank Treasury',     occurredAt: new Date(Date.now() - 2.1 * 3600000).toISOString() },
  { id: 5,  userName: 'Andile Khumalo',   description: 'approved Matter M-2024-0388 for commencement',      occurredAt: new Date(Date.now() - 3.4 * 3600000).toISOString() },
  { id: 6,  userName: 'Lindiwe Nkosi',    description: 'document NDA-Draft-v3.docx marked high-risk by AI', occurredAt: new Date(Date.now() - 5   * 3600000).toISOString() },
  { id: 7,  userName: 'Thabo Sithole',    description: 'invoice INV-1147 marked paid — R45 000',            occurredAt: new Date(Date.now() - 6.8 * 3600000).toISOString() },
  { id: 8,  userName: 'System',           description: 'FICA documentation expired for client Absa Group',  occurredAt: new Date(Date.now() - 1.2 * 86400000).toISOString() },
  { id: 9,  userName: 'Nothando Dlamini', description: 'opened document review for Merger Agreement v2',    occurredAt: new Date(Date.now() - 1.5 * 86400000).toISOString() },
  { id: 10, userName: 'Sipho Mokoena',    description: 'closed Matter M-2024-0312 — all tasks complete',    occurredAt: new Date(Date.now() - 2   * 86400000).toISOString() },
]

const SPARKLINE = [
  { m: 'Feb', v: 1_477_000 },
  { m: 'Mar', v: 1_846_000 },
  { m: 'Apr', v: 2_074_000 },
  { m: 'May', v: 2_300_000 },
  { m: 'Jun', v: 2_582_000 },
  { m: 'Jul', v: 2_840_000 },
]

const ACTION_ITEMS = [
  { type: 'risk' as const, label: '1 client blocked — FICA compliance incomplete',           href: '/clients'   },
  { type: 'risk' as const, label: '2 clients with expired FICA documentation',               href: '/clients'   },
  { type: 'risk' as const, label: '2 matters flagged at risk',                               href: '/matters'   },
  { type: 'warn' as const, label: '2 AI documents flagged high-risk — approval required',    href: '/documents' },
  { type: 'warn' as const, label: 'FICA compliance at 87% — below 90% firm threshold',       href: '/audit'     },
  { type: 'warn' as const, label: '4 tasks overdue',                                          href: '/matters'   },
]

const TODAY = new Date().toLocaleDateString('en-ZA', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1)  return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function activityMeta(desc: string): { color: string; Icon: React.ElementType } {
  if (/created|opened/i.test(desc))      return { color: T.blue,     Icon: FilePlus      }
  if (/client|contact/i.test(desc))      return { color: T.cyan,     Icon: UserPlus      }
  if (/time|hour/i.test(desc))           return { color: T.textDim,  Icon: Clock         }
  if (/complet|closed|paid/i.test(desc)) return { color: T.ok,       Icon: CheckCircle2  }
  if (/conflict/i.test(desc))            return { color: T.risk,     Icon: AlertTriangle }
  if (/expired|fica/i.test(desc))        return { color: T.warn,     Icon: ShieldAlert   }
  if (/high-risk|flagged/i.test(desc))   return { color: T.risk,     Icon: AlertTriangle }
  if (/approved/i.test(desc))            return { color: T.ok,       Icon: CheckCircle2  }
  return { color: T.textFaint, Icon: Activity }
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Compact label with optional left accent rule */
function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      {accent && (
        <div style={{ width: 2, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />
      )}
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.textFaint, margin: 0 }}>
        {children}
      </p>
    </div>
  )
}

/** Clean metric row — no card nesting, flat with subtle hover */
function MetricRow({
  label, value, color = T.text, highlight = false,
}: {
  label: string; value: string | number; color?: string; highlight?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        padding:      '6px 8px',
        borderRadius: 4,
        background:   hov ? T.surfaceB : highlight ? `${color}0A` : 'transparent',
        borderLeft:   highlight ? `2px solid ${color}` : '2px solid transparent',
        marginBottom: 1,
        cursor:       'pointer',
        transition:   'background 0.12s',
      }}
    >
      <span style={{ fontSize: 11, color: highlight ? color : T.textDim }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color, fontFamily: 'Menlo, Consolas, monospace' }}>
        {value}
      </span>
    </div>
  )
}

/** Revenue sparkline tooltip */
function RevTip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ padding: '4px 8px', borderRadius: 4, background: T.surfaceEl, border: `1px solid ${T.border}`, fontSize: 10 }}>
      <span style={{ color: T.text }}>{formatCurrency(payload[0].value)}</span>
    </div>
  )
}

/** KPI metric tile — editorial, less shadow/rounding */
function KpiTile({
  label, value, sub, flag, icon: Icon,
}: {
  label: string; value: string | number; sub?: string
  flag?: 'ok' | 'warn' | 'risk'; icon: React.ElementType
}) {
  const [hov, setHov] = useState(false)
  const accent = flag === 'risk' ? T.risk : flag === 'warn' ? T.warn : flag === 'ok' ? T.ok : T.textFaint
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           6,
        padding:       '16px 18px',
        background:    hov ? T.surfaceB : T.surface,
        borderTop:     `2px solid ${flag ? accent : T.border}`,
        borderBottom:  `1px solid ${T.border}`,
        borderLeft:    `1px solid ${T.border}`,
        borderRight:   `1px solid ${T.border}`,
        cursor:        'pointer',
        transition:    'background 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon style={{ width: 11, height: 11, color: accent, flexShrink: 0 }} />
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.textFaint, margin: 0 }}>
          {label}
        </p>
      </div>
      <p style={{ fontSize: 28, fontWeight: 300, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: flag ? accent : T.text, margin: 0 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 9, color: T.textFaint, margin: 0 }}>{sub}</p>}
    </div>
  )
}

/** Alert notice — flat, editorial */
function AlertNotice() {
  const risks = ACTION_ITEMS.filter(i => i.type === 'risk')
  const warns = ACTION_ITEMS.filter(i => i.type === 'warn')
  return (
    <div style={{ marginBottom: 20, borderLeft: `3px solid ${T.risk}`, background: `${T.risk}08`, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Bell style={{ width: 12, height: 12, color: T.risk, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>
          {ACTION_ITEMS.length} items requiring your attention
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {risks.length > 0 && (
            <span style={{ padding: '1px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', background: `${T.risk}20`, color: T.risk, borderRadius: 2 }}>
              {risks.length} critical
            </span>
          )}
          {warns.length > 0 && (
            <span style={{ padding: '1px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', background: `${T.warn}20`, color: T.warn, borderRadius: 2 }}>
              {warns.length} warning
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
        {ACTION_ITEMS.map((item, i) => {
          const color = item.type === 'risk' ? T.risk : T.warn
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', cursor: 'pointer' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color, lineHeight: 1.4 }}>{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Pipeline section */
function PipelineSection() {
  const total = MOCK_PIPELINE.reduce((s, p) => s + p.count, 0)
  return (
    <div style={{ marginBottom: 24 }}>
      <SectionLabel accent={T.blue}>Matter Pipeline — {total} total</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {MOCK_PIPELINE.map(p => {
          const pct = total > 0 ? (p.count / total) * 100 : 0
          const color = PIPELINE_COLOR[p.label] ?? T.blue
          return (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 112, flexShrink: 0 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: T.textDim }}>{p.label}</span>
              </div>
              <div style={{ flex: 1, height: 2, background: T.borderSub, borderRadius: 1, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, opacity: 0.85 }} />
              </div>
              <span style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 11, width: 20, textAlign: 'right', color: T.text, flexShrink: 0 }}>
                {p.count}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.borderSub}`, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.textFaint, cursor: 'pointer' }}>
        View all matters <ArrowRight style={{ width: 10, height: 10, marginLeft: 'auto' }} />
      </div>
    </div>
  )
}

/** Revenue sparkline */
function RevenueCard() {
  return (
    <div>
      <SectionLabel accent={T.cyan}>Revenue — 6-month trend</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 26, fontWeight: 300, fontVariantNumeric: 'tabular-nums', color: T.text }}>
            {formatCurrency(MOCK_BILLING.totalRevenue)}
          </span>
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: T.ok }}>
            ↑ YTD
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.warn, margin: 0 }}>
            {formatCurrency(MOCK_BILLING.outstanding)}
          </p>
          <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.textFaint, margin: 0 }}>
            outstanding
          </p>
        </div>
      </div>
      <div style={{ height: 72 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={SPARKLINE} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rvGrad2" x1="0" y1="0" x2="1" y2="0">
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
            <Area type="monotone" dataKey="v" stroke="url(#rvGrad2)" strokeWidth={2}
              fill="url(#rvFill2)" dot={false} activeDot={{ r: 3, fill: T.cyan, stroke: 'none' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Senior panel — approvals + workload */
function SeniorPanel() {
  const max = Math.max(...MOCK_WORKLOAD.map(x => x.matterCount), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ marginBottom: 24 }}>
        <SectionLabel accent={T.warn}>Requires Approval</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[
            { label: 'Matters awaiting commencement', value: MOCK_STATS.mattersAwaitingApproval, color: T.blue, flag: MOCK_STATS.mattersAwaitingApproval > 0 },
            { label: 'Conflict checks pending',        value: MOCK_STATS.conflictsPending,        color: T.warn, flag: MOCK_STATS.conflictsPending > 0        },
            { label: 'Documents awaiting approval',    value: MOCK_STATS.pendingDocuments,        color: T.warn, flag: MOCK_STATS.pendingDocuments > 5        },
            { label: 'AI high-risk documents',         value: MOCK_STATS.aiHighRiskDocs,          color: T.risk, flag: MOCK_STATS.aiHighRiskDocs > 0          },
            { label: 'Matters flagged at risk',        value: MOCK_STATS.mattersAtRisk,           color: T.risk, flag: MOCK_STATS.mattersAtRisk > 0           },
          ].map(d => (
            <MetricRow key={d.label} label={d.label} value={d.value} color={d.color} highlight={d.flag} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel accent={T.blue}>Team Workload</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MOCK_WORKLOAD.map(m => {
            const pct = Math.round((m.matterCount / max) * 100)
            return (
              <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 24, height: 24, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: '#fff',
                  background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
                  borderRadius: '50%',
                }}>
                  {getInitials(m.userName)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: T.textDim }}>{m.userName}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: T.text }}>{m.matterCount}</span>
                  </div>
                  <div style={{ height: 2, background: T.borderSub, borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${T.blue}, ${T.cyan})` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Activity feed */
function ActivityFeed() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SectionLabel accent={T.cyan}>Recent Activity</SectionLabel>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {MOCK_ACTIVITY.map((item, i) => {
          const { color, Icon } = activityMeta(item.description)
          return (
            <div key={item.id} style={{
              display:     'flex',
              alignItems:  'flex-start',
              gap:         10,
              padding:     '9px 0',
              borderBottom: i < MOCK_ACTIVITY.length - 1 ? `1px solid ${T.borderSub}` : 'none',
            }}>
              <Icon style={{ width: 13, height: 13, color, flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, lineHeight: 1.45, color: T.textDim, margin: 0 }}>
                  <span style={{ fontWeight: 600, color: T.text }}>{item.userName || 'System'}</span>
                  {' '}{item.description}
                </p>
              </div>
              <span style={{
                fontFamily: 'Menlo, Consolas, monospace',
                fontSize: 10, flexShrink: 0, marginTop: 1,
                padding: '2px 6px', borderRadius: 2,
                color: T.textFaint, background: T.borderSub,
                whiteSpace: 'nowrap',
              }}>
                {timeAgo(item.occurredAt)}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        {['All matters', 'Conflicts', 'Billing', 'Audit log'].map(l => (
          <span key={l} style={{
            padding: '4px 10px', borderRadius: 2, fontSize: 10,
            background: T.borderSub, color: T.textDim, cursor: 'pointer',
          }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',  active: true  },
  { icon: Briefcase,       label: 'Matters',    active: false },
  { icon: Users,           label: 'Clients',    active: false },
  { icon: GitMerge,        label: 'Conflicts',  active: false, badge: 5,  badgeColor: T.warn },
  { icon: FileText,        label: 'Documents',  active: false, badge: 12, badgeColor: T.textDim },
  { icon: Scale,           label: 'FICA',       active: false, badge: 3,  badgeColor: T.risk },
  { icon: Receipt,         label: 'Billing',    active: false },
  { icon: FileSearch,      label: 'Audit',      active: false },
  { icon: BarChart2,       label: 'Reports',    active: false },
]

function Sidebar() {
  return (
    <div style={{
      width: 220, flexShrink: 0,
      background: T.sidebar,
      borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Scale style={{ width: 16, height: 16, color: '#fff' }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, letterSpacing: '-0.01em' }}>APZ Legal</p>
            <p style={{ fontSize: 9, color: T.textFaint, margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Matter Management</p>
          </div>
        </div>
      </div>

      {/* User */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, flexShrink: 0,
            background: `linear-gradient(135deg, ${T.blue}80, ${T.cyan}60)`,
            border: `1px solid ${T.border}`,
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: T.text,
          }}>
            {MOCK_USER.initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: T.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {MOCK_USER.name}
            </p>
            <p style={{ fontSize: 9, color: T.textFaint, margin: 0 }}>{MOCK_USER.role}</p>
          </div>
          <ChevronDown style={{ width: 12, height: 12, color: T.textFaint, flexShrink: 0 }} />
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.borderSub}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 3,
          background: T.surfaceEl, border: `1px solid ${T.border}`,
        }}>
          <Search style={{ width: 11, height: 11, color: T.textFaint, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: T.textFaint }}>Search…</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, color: T.textFaint, fontFamily: 'Menlo, Consolas, monospace', background: T.border, padding: '1px 4px', borderRadius: 2 }}>
            ⌘K
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 4, marginBottom: 1,
            background: item.active ? `${T.blue}18` : 'transparent',
            borderLeft: item.active ? `2px solid ${T.blue}` : '2px solid transparent',
            cursor: 'pointer',
          }}>
            <item.icon style={{ width: 14, height: 14, color: item.active ? T.blue : T.textDim, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: item.active ? T.text : T.textDim, fontWeight: item.active ? 600 : 400, flex: 1 }}>
              {item.label}
            </span>
            {item.badge !== undefined && (
              <span style={{
                fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                padding: '1px 5px', borderRadius: 2,
                background: `${item.badgeColor}20`,
                color: item.badgeColor,
              }}>
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </nav>

      {/* New Matter CTA */}
      <div style={{ padding: '12px 12px 8px', borderTop: `1px solid ${T.border}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '8px 12px',
          background: `linear-gradient(135deg, ${T.blue}, ${T.cyan}90)`,
          borderRadius: 4, cursor: 'pointer',
        }}>
          <Plus style={{ width: 13, height: 13, color: '#fff' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>New Matter</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 12px 16px', display: 'flex', gap: 4 }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px', borderRadius: 3, cursor: 'pointer',
        }}>
          <Settings style={{ width: 12, height: 12, color: T.textFaint }} />
          <span style={{ fontSize: 11, color: T.textFaint }}>Settings</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '5px 8px', borderRadius: 3, cursor: 'pointer',
        }}>
          <LogOut style={{ width: 12, height: 12, color: T.textFaint }} />
        </div>
      </div>
    </div>
  )
}

// ── Main dashboard content ────────────────────────────────────────────────────
function DashboardContent() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: T.bg, overflow: 'auto' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 28px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bg,
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em', color: T.text, margin: 0 }}>
            Good morning, Andile
          </h1>
          <p style={{ fontSize: 11, color: T.textFaint, margin: '3px 0 0' }}>{TODAY}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Notification bell with badge */}
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 4, cursor: 'pointer',
            }}>
              <Bell style={{ width: 14, height: 14, color: T.textDim }} />
            </div>
            <span style={{
              position: 'absolute', top: -5, right: -5,
              width: 16, height: 16, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: '#fff',
              background: T.risk,
            }}>
              {ACTION_ITEMS.length}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>

        {/* Alert notice */}
        <AlertNotice />

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0, marginBottom: 28, border: `1px solid ${T.border}` }}>
          {[
            { label: 'Active Matters',    value: MOCK_STATS.activeMatters,                  icon: Briefcase,   flag: undefined                                           },
            { label: 'FICA Issues',       value: MOCK_STATS.ficaIssues,                     icon: ShieldCheck, flag: 'risk' as const,  sub: `${MOCK_FICA.expired}exp · ${MOCK_FICA.blocked}blk` },
            { label: 'Conflicts',         value: MOCK_STATS.conflictsPending,               icon: GitMerge,    flag: 'warn' as const                                     },
            { label: 'Docs in Review',    value: MOCK_STATS.pendingDocuments,               icon: FileText,    flag: 'warn' as const,  sub: `${MOCK_STATS.aiHighRiskDocs} AI high-risk`          },
            { label: 'Overdue Tasks',     value: MOCK_STATS.overdueTaskCount,               icon: CheckSquare, flag: 'risk' as const                                     },
            { label: 'Unbilled Hours',    value: `${MOCK_STATS.unbilledHours}h`,            icon: Clock,       flag: 'warn' as const,  sub: `${MOCK_STATS.openInvoices} open invoices`            },
          ].map((tile, idx) => (
            <div key={tile.label} style={{ borderLeft: idx > 0 ? `1px solid ${T.border}` : 'none' }}>
              <KpiTile {...tile} />
            </div>
          ))}
        </div>

        {/* Three-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>

          {/* LEFT: Pipeline + Revenue */}
          <div>
            <PipelineSection />
            <div style={{ paddingTop: 24, borderTop: `1px solid ${T.border}` }}>
              <RevenueCard />
            </div>
          </div>

          {/* CENTRE: Senior panel */}
          <div style={{ borderLeft: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, paddingLeft: 28, paddingRight: 28 }}>
            <SeniorPanel />
          </div>

          {/* RIGHT: Activity feed */}
          <div style={{ minHeight: 500 }}>
            <ActivityFeed />
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────
export function RefinedDashboard() {
  return (
    <div className="apz-dash-root" style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <Sidebar />
      <DashboardContent />
    </div>
  )
}
