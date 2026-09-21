import {
  useGetCurrentUser,
  useGetDashboardStats,
  useGetFicaOverview,
  useGetRecentActivity,
  useListMatters,
} from "@workspace/api-client-react"
import { useQuery } from "@tanstack/react-query"
import { PageLoader } from "@/components/ui/loader"
import {
  AlertTriangle, ArrowRight, BriefcaseBusiness, CheckCircle2, CheckSquare,
  Clock3, FileCheck2, FileText, Landmark, Scale, ShieldCheck,
  UserRoundCheck, Users,
} from "lucide-react"
import { Link } from "wouter"

type DashboardTask = {
  id: string
  title: string
  priority?: "critical" | "high" | "medium" | "low" | "urgent"
  status?: string
  dueDate?: string
  matterReference?: string
  matterTitle?: string
  assignedToName?: string
}

const STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  conflict_check: "Conflict Review",
  approved: "Approved",
  active: "Active",
  review: "Partner Review",
  completed: "Completed",
  closed: "Closed",
  archived: "Archived",
}

const STATUS_TONES: Record<string, string> = {
  lead: "slate",
  conflict_check: "amber",
  approved: "blue",
  active: "green",
  review: "amber",
  completed: "green",
  closed: "slate",
  archived: "slate",
}

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function shortDue(value?: string) {
  if (!value) return "No due date"
  const due = new Date(value)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (due < today) return "Overdue"
  if (due.toDateString() === today.toDateString()) return `Today, ${due.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`
  if (due.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${due.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`
  return due.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })
}

function Panel({ title, action, children, className = "" }: {
  title: string
  action?: { label: string; href: string }
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`ref-dashboard-panel ${className}`}>
      <header>
        <h2>{title}</h2>
        {action && <Link href={action.href}>{action.label} <ArrowRight size={11} /></Link>}
      </header>
      {children}
    </section>
  )
}

function ActivityIcon({ description }: { description: string }) {
  const props = { size: 15, strokeWidth: 1.5 }
  if (/approv|review/i.test(description)) return <FileCheck2 {...props} />
  if (/complet|closed|paid/i.test(description)) return <CheckCircle2 {...props} />
  if (/sign/i.test(description)) return <Scale {...props} />
  if (/time|hour/i.test(description)) return <Clock3 {...props} />
  return <FileText {...props} />
}

export default function DashboardPage() {
  const { data: currentUser } = useGetCurrentUser()
  const { data: stats, isLoading: statsLoading, isError: statsError } = useGetDashboardStats()
  const { data: activity, isLoading: activityLoading, isError: activityError } = useGetRecentActivity({ limit: 8 })
  const { data: fica, isLoading: ficaLoading, isError: ficaError } = useGetFicaOverview()
  const { data: matters, isLoading: mattersLoading, isError: mattersError } = useListMatters()
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""
  const { data: tasks = [], isLoading: tasksLoading, isError: tasksError } = useQuery<DashboardTask[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const response = await fetch(`${base}/api/tasks`, { credentials: "include" })
      if (!response.ok) throw new Error("Unable to load tasks")
      return response.json()
    },
    staleTime: 30_000,
  })

  const firstName = (currentUser?.name ?? "there").split(" ")[0]
  const today = new Date().toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
  const openMatters = (matters ?? []).filter((matter: any) => !["completed", "closed", "archived"].includes(matter.status))
  const activeMatters = openMatters.filter((matter: any) => matter.status === "active").slice(0, 5)
  const actionableTasks = tasks
    .filter(task => !["completed", "cancelled", "done"].includes(task.status ?? ""))
    .filter(task => task.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 3)

  const attention = [
    ...(fica?.blocked ? [{ label: `${fica.blocked} FICA verification${fica.blocked === 1 ? "" : "s"} incomplete`, detail: "Client compliance required", level: "critical", href: "/fica" }] : []),
    ...(fica?.expired ? [{ label: `${fica.expired} FICA document${fica.expired === 1 ? "" : "s"} expired`, detail: "Renew compliance documents", level: "critical", href: "/fica" }] : []),
    ...(stats?.aiHighRiskDocs ? [{ label: `${stats.aiHighRiskDocs} AI document${stats.aiHighRiskDocs === 1 ? "" : "s"} flagged high risk`, detail: "Review required before release", level: "high", href: "/documents" }] : []),
    ...(stats?.mattersAtRisk ? [{ label: `${stats.mattersAtRisk} matter${stats.mattersAtRisk === 1 ? "" : "s"} flagged at risk`, detail: "Review matter status and next action", level: "high", href: "/matters" }] : []),
    ...(stats?.mattersAwaitingApproval ? [{ label: `${stats.mattersAwaitingApproval} matter${stats.mattersAwaitingApproval === 1 ? "" : "s"} awaiting commencement`, detail: "Approval required before work starts", level: "high", href: "/matters" }] : []),
    ...((stats?.ficaCompliantRate ?? 100) < 90 ? [{ label: `FICA compliance is ${stats?.ficaCompliantRate ?? 0}%`, detail: "Below the firm's 90% threshold", level: "medium", href: "/fica" }] : []),
    ...(stats?.conflictsPending ? [{ label: `${stats.conflictsPending} conflict check${stats.conflictsPending === 1 ? "" : "s"} awaiting review`, detail: "Partner decision required", level: "medium", href: "/conflicts" }] : []),
    ...(stats?.overdueTaskCount ? [{ label: `${stats.overdueTaskCount} overdue task${stats.overdueTaskCount === 1 ? "" : "s"}`, detail: "Task owners need attention", level: "medium", href: "/tasks" }] : []),
  ]
  const dashboardHasError = statsError || activityError || ficaError || mattersError || tasksError

  const practiceOverview = [
    { icon: BriefcaseBusiness, label: "Matters", value: stats?.activeMatters ?? 0, href: "/matters", note: "Active matters" },
    { icon: FileText, label: "Documents", value: stats?.pendingDocuments ?? 0, href: "/documents", note: "Awaiting approval" },
    { icon: Users, label: "Clients", value: stats?.totalClients ?? 0, href: "/clients", note: "Registered clients" },
  ]

  return (
    <div className="ref-dashboard">
      <header className="ref-dashboard-heading">
        <h1>Good morning, {firstName}</h1>
        <p>{today}</p>
      </header>
      {dashboardHasError && (
        <div className="ref-inline-error" role="status">
          <AlertTriangle size={15} />
          <span>Some workspace data could not be loaded. Refresh to try again.</span>
        </div>
      )}

      <section className="ref-kpi-strip" aria-label="Firm overview">
        <Link href="/matters" className="ref-kpi">
          <span>Active matters</span>
          <strong>{stats?.activeMatters ?? 0}</strong>
          <small>{openMatters.length > (stats?.activeMatters ?? 0) ? `${openMatters.length} in progress` : "Firm matter portfolio"}</small>
        </Link>
        <Link href="/conflicts" className="ref-kpi">
          <span>Conflict checks</span>
          <strong>{stats?.conflictsPending ?? 0}</strong>
          <small>Awaiting review</small>
        </Link>
        <Link href="/fica" className="ref-kpi">
          <span>FICA compliance</span>
          <strong className="gold">{stats?.ficaCompliantRate ?? 0}%</strong>
          <small>Firm threshold 90%</small>
        </Link>
        <Link href="/tasks" className="ref-kpi">
          <span>Overdue tasks</span>
          <strong className={(stats?.overdueTaskCount ?? 0) > 0 ? "risk" : ""}>{stats?.overdueTaskCount ?? 0}</strong>
          <small>Requires attention</small>
        </Link>
      </section>

      <div className="ref-dashboard-grid">
        <div className="ref-dashboard-column">
          <Panel title="Matters requiring attention" action={{ label: "View all", href: "/actions" }}>
            <div className="ref-attention-list">
               {statsLoading || ficaLoading ? (
                 <div className="ref-empty-state">Loading attention items…</div>
               ) : attention.length ? attention.map(item => (
                <Link key={item.label} href={item.href} className={`ref-attention-row ${item.level}`}>
                  <div><b>{item.label}</b><small>{item.detail}</small></div>
                  <span>{item.level}</span>
                  <ArrowRight size={14} />
                </Link>
              )) : (
                <div className="ref-empty-state"><ShieldCheck size={16} /> No matter requires urgent attention.</div>
              )}
            </div>
          </Panel>

          <Panel title="Active matters" action={{ label: "View all matters", href: "/matters" }}>
            <div className="ref-matter-table">
              <div className="ref-matter-head"><span>Matter</span><span>Type</span><span>Status</span><span>Updated</span></div>
               {mattersLoading ? (
                 <div className="ref-empty-state">Loading active matters…</div>
               ) : activeMatters.length ? activeMatters.map((matter: any) => (
                <Link href={`/matters/${matter.id}`} className="ref-matter-row" key={matter.id}>
                  <b>{matter.title}</b>
                  <span>{matter.practiceArea ?? "General"}</span>
                  <span className={`ref-status ${STATUS_TONES[matter.status] ?? "slate"}`}>{STATUS_LABELS[matter.status] ?? matter.status}</span>
                  <time>{matter.updatedAt ? timeAgo(matter.updatedAt) : "—"}</time>
                </Link>
              )) : <div className="ref-empty-state"><BriefcaseBusiness size={16} /> No active matters yet.</div>}
            </div>
          </Panel>

          <Panel title="Practice overview">
            <div className="ref-practice-grid">
              {practiceOverview.map(item => {
                const Icon = item.icon
                return (
                  <Link href={item.href} key={item.label} className="ref-practice-item">
                    <span><Icon size={14} /> {item.label}</span>
                    <b>{item.value}</b>
                    <small>{item.note}</small>
                    <em>View all <ArrowRight size={11} /></em>
                  </Link>
                )
              })}
            </div>
          </Panel>
        </div>

        <div className="ref-dashboard-column">
          <Panel title="Recent activity" action={{ label: "View all", href: "/audit" }}>
            <div className="ref-activity-list">
               {activityLoading ? (
                 <div className="ref-empty-state">Loading recent activity…</div>
               ) : (activity ?? []).slice(0, 5).map(item => (
                <div className="ref-activity-row" key={item.id}>
                  <ActivityIcon description={item.description ?? ""} />
                  <p><b>{item.description}</b><small>{item.userName ?? "APZ Legal"}</small></p>
                  <time>{timeAgo(item.occurredAt)}</time>
                </div>
              ))}
              {!(activity ?? []).length && <div className="ref-empty-state"><Clock3 size={16} /> No recent activity.</div>}
            </div>
          </Panel>

          <Panel title="Tasks due" action={{ label: "View all tasks", href: "/tasks" }}>
            <div className="ref-tasks-list">
               {tasksLoading ? (
                 <div className="ref-empty-state">Loading tasks…</div>
               ) : actionableTasks.length ? actionableTasks.map(task => (
                <Link href="/tasks" key={task.id} className={`ref-task-row ${task.priority === "urgent" ? "critical" : task.priority ?? "medium"}`}>
                  <div><b>{task.title}</b><small>{task.matterTitle ?? task.matterReference ?? task.assignedToName ?? "Unassigned"}</small></div>
                  <time>{shortDue(task.dueDate)}</time>
                </Link>
              )) : <div className="ref-empty-state"><CheckSquare size={16} /> No upcoming tasks due.</div>}
            </div>
          </Panel>

        </div>
      </div>
    </div>
  )
}