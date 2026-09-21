import { useState, useMemo } from "react"
import { useLocation, Link } from "wouter"
import { formatDistanceToNow } from "date-fns"
import {
  GitBranch,
  GitCommit,
  Settings2,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  ChevronDown,
} from "lucide-react"

import { useGetWorkflows } from "@workspace/api-client-react"
import { PageLoader } from "@/components/ui/loader"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { T, cardStyle, pillStyle } from "@/lib/theme"

export default function WorkflowPage() {
  const { data, isLoading } = useGetWorkflows()
  const [, setLocation] = useLocation()

  const [activeTab, setActiveTab] = useState("instances")
  const [search, setSearch] = useState("")
  const [filterWorkflow, setFilterWorkflow] = useState<string>("all")

  if (isLoading) {
    return <PageLoader />
  }

  const { definitions = [], instances = [] } = data || {}

  const filteredInstances = instances.filter(i => {
    if (filterWorkflow !== "all" && i.workflowKey !== filterWorkflow) return false
    if (search && !i.title.toLowerCase().includes(search.toLowerCase()) &&
        !(i.subtitle && i.subtitle.toLowerCase().includes(search.toLowerCase()))) {
      return false
    }
    return true
  })

  const blockedInstances = instances.filter(i => !!i.blockedBy)

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: T.bg }}>

      {/* ── Page header ── */}
      <div
        className="shrink-0"
        style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5" style={{ color: T.textDim }}>
              Workflow Engine
            </p>
            <p className="text-[12px]" style={{ color: T.textFaint }}>
              Governed operational processes and state machines across the firm.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: T.textDim }}>Active</p>
              <p className="text-lg font-mono font-bold leading-none" style={{ color: T.text }}>{instances.length}</p>
            </div>
            <div style={{ width: 1, height: 32, background: T.border }} />
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: T.risk }}>Blocked</p>
              <p className="text-lg font-mono font-bold leading-none" style={{ color: T.risk }}>{blockedInstances.length}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent h-auto p-0 border-b-0 space-x-6">
              <TabsTrigger
                value="instances"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4169E1] data-[state=active]:bg-transparent data-[state=active]:text-white px-0 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#5A80A8] shadow-none"
              >
                Live Instances
              </TabsTrigger>
              <TabsTrigger
                value="definitions"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4169E1] data-[state=active]:bg-transparent data-[state=active]:text-white px-0 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#5A80A8] shadow-none"
              >
                Governance Rules
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "instances" ? (
          <div>
            {/* Search / filter row */}
            <div className="flex items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: T.textDim }} />
                <input
                  type="search"
                  placeholder="Search instances…"
                  className="w-full pl-9 pr-3 py-2 text-[12px] outline-none transition-colors"
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    color: T.text,
                  }}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <select
                className="text-[11px] px-3 py-2 outline-none"
                style={{
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  color: T.text,
                }}
                value={filterWorkflow}
                onChange={e => setFilterWorkflow(e.target.value)}
              >
                <option value="all">All Workflows</option>
                {definitions.map(def => (
                  <option key={def.key} value={def.key}>{def.name}</option>
                ))}
              </select>
            </div>

            {/* Instances list */}
            <div className="grid gap-3">
              {filteredInstances.length === 0 ? (
                <div
                  className="text-center py-12 text-[12px]"
                  style={{
                    ...cardStyle,
                    border: `1px dashed ${T.border}`,
                    color: T.textDim,
                    padding: 48,
                  }}
                >
                  No workflow instances match your search.
                </div>
              ) : (
                filteredInstances.map(instance => {
                  const def = definitions.find(d => d.key === instance.workflowKey)
                  const isBlocked = !!instance.blockedBy

                  return (
                    <div
                      key={`${instance.workflowKey}-${instance.entityId}`}
                      className="group flex flex-col sm:flex-row overflow-hidden cursor-pointer transition-colors"
                      style={{
                        ...cardStyle,
                        outline: "1px solid transparent",
                      }}
                      onClick={() => setLocation(instance.link)}
                       onMouseEnter={e => { (e.currentTarget as HTMLElement).style.outline = `1px solid color-mix(in srgb, ${T.blue} 50%, transparent)` }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.outline = "1px solid transparent" }}
                    >
                      {/* Left: Entity Info */}
                      <div
                        className="flex-1 p-4 flex flex-col justify-center relative"
                        style={{ borderRight: `1px solid ${T.border}` }}
                      >
                        {isBlocked && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[10px]" style={{ background: T.risk }} />
                        )}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span style={pillStyle(T.textDim)}>
                            {def?.name || instance.workflowKey}
                          </span>
                          {instance.requiresApproval && (
                            <span style={pillStyle(T.warn)} className="flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" /> Approval Gate
                            </span>
                          )}
                          {isBlocked && (
                            <span style={pillStyle(T.risk)} className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Blocked
                            </span>
                          )}
                        </div>
                        <h3 className="text-[13px] font-medium line-clamp-1" style={{ color: T.text }}>{instance.title}</h3>
                        {instance.subtitle && (
                          <p className="text-[11px] line-clamp-1 mt-0.5" style={{ color: T.textDim }}>{instance.subtitle}</p>
                        )}
                      </div>

                      {/* Middle: Progress */}
                      <div
                        className="flex-1 p-4 flex flex-col justify-center"
                        style={{ borderRight: `1px solid ${T.border}` }}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.blue }}>
                            {instance.currentStepLabel}
                          </span>
                          <span className="text-[10px] font-mono" style={{ color: T.textDim }}>
                            Step {instance.stepIndex + 1}/{instance.totalSteps}
                          </span>
                        </div>

                        <div className="flex gap-1 h-1.5">
                          {Array.from({ length: instance.totalSteps }).map((_, i) => (
                            <div
                              key={i}
                              className="flex-1 rounded-full"
                              style={{
                                background:
                                  i < instance.stepIndex ? T.blue :
                                  i === instance.stepIndex ? (isBlocked ? T.risk : T.cyan) :
                                  T.border,
                              }}
                            />
                          ))}
                        </div>

                        {isBlocked ? (
                          <p className="text-[10px] mt-2 flex items-center gap-1" style={{ color: T.risk }}>
                            <AlertTriangle className="h-3 w-3" /> Blocked: {instance.blockedBy}
                          </p>
                        ) : (
                          <div className="flex justify-between items-center mt-2 text-[10px]" style={{ color: T.textDim }}>
                            <span className="truncate">Role: {instance.responsibleRoles.join(', ')}</span>
                            {instance.nextStep && (
                              <span className="shrink-0 flex items-center gap-1">
                                Next: {instance.nextStep} <ChevronRight className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Meta */}
                      <div className="w-full sm:w-40 p-4 flex flex-row sm:flex-col items-center sm:items-end justify-between"
                        style={{ background: T.surfaceEl }}
                      >
                        <div className="text-left sm:text-right">
                          <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: T.textDim }}>Due Date</div>
                          <div className="text-[11px] font-medium" style={{
                            color: !instance.dueDate ? T.textDim :
                              new Date(instance.dueDate) < new Date() ? T.risk : T.text,
                          }}>
                            {instance.dueDate ? new Date(instance.dueDate).toLocaleDateString() : 'None'}
                          </div>
                        </div>
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded transition-colors group-hover:text-white"
                          style={{
                            border: `1px solid ${T.border}`,
                            color: T.blue,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.blue }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ) : (
          /* ── Definitions tab ── */
          <div className="grid gap-6">
            {definitions.map(def => (
              <div key={def.key} style={{ ...cardStyle, overflow: "hidden" }}>
                {/* Card header */}
                <div
                  className="px-5 py-4 flex items-center justify-between"
                  style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded"
                      style={{ background: T.surface, border: `1px solid ${T.border}` }}
                    >
                      <Settings2 className="h-4 w-4" style={{ color: T.blue }} />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold" style={{ color: T.text }}>{def.name}</h3>
                      <p className="text-[11px] mt-0.5" style={{ color: T.textDim }}>{def.description}</p>
                    </div>
                  </div>
                  <span style={pillStyle(T.textDim)}>{def.entityType}</span>
                </div>

                {/* Steps */}
                <div className="p-4 flex flex-col gap-3">
                  {def.steps.map((step, idx) => (
                    <div
                      key={step.key}
                      className="flex items-start gap-3"
                    >
                      {/* Step number */}
                      <div
                        className="shrink-0 flex h-7 w-7 items-center justify-center rounded font-mono text-[11px] font-bold"
                        style={{
                          background: T.surfaceEl,
                          border: `1px solid ${T.border}`,
                          color: T.textDim,
                        }}
                      >
                        {idx + 1}
                      </div>

                      {/* Step card */}
                      <div
                        className="flex-1 p-3 rounded-lg"
                        style={{ background: T.surfaceEl, border: `1px solid ${T.border}` }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[12px] font-semibold" style={{ color: T.text }}>{step.label}</h4>
                          {step.requiresApproval && (
                            <ShieldCheck className="h-3.5 w-3.5" style={{ color: T.warn }} />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {step.responsibleRoles.map(r => (
                            <span
                              key={r}
                              className="text-[10px] px-2 py-0.5 rounded"
                              style={{
                                background: T.surface,
                                border: `1px solid ${T.border}`,
                                color: T.textDim,
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                        {step.blockingCondition !== 'none' && (
                          <div
                            className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded text-[10px]"
                             style={{ background: `color-mix(in srgb, ${T.risk} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${T.risk} 25%, transparent)`, color: T.risk }}
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span>Blocks on: {step.blockingCondition}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
