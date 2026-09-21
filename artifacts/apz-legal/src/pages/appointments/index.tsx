import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import {
  CalendarDays, Plus, UserCheck, Clock, Building2, Link2,
  CheckCircle2, XCircle, AlertTriangle, ChevronRight, Users,
  Video, MapPin, FileText, ArrowRight, RefreshCw,
} from "lucide-react"
import { useListClients, useListMatters } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { PageLoader } from "@/components/ui/loader"
import { T, cardStyle, pillStyle } from "@/lib/theme"

// ── Status meta ───────────────────────────────────────────────────────────────
const APPT_STATUS: Record<string, { color: string; label: string }> = {
  scheduled:    { color: T.blue,     label: "Scheduled"    },
  confirmed:    { color: T.ok,       label: "Confirmed"    },
  rescheduled:  { color: T.warn,     label: "Rescheduled"  },
  cancelled:    { color: T.risk,     label: "Cancelled"    },
  completed:    { color: T.textDim,  label: "Completed"    },
  no_show:      { color: "#A78BFA",  label: "No Show"      },
}

const VISITOR_STATUS: Record<string, { color: string; label: string }> = {
  expected:      { color: T.blue,    label: "Expected"      },
  checked_in:    { color: T.ok,      label: "Checked In"    },
  with_attorney: { color: T.cyan,    label: "With Attorney" },
  checked_out:   { color: T.textDim, label: "Checked Out"   },
  cancelled:     { color: T.risk,    label: "Cancelled"     },
  no_show:       { color: "#A78BFA", label: "No Show"       },
}

const APPT_TYPES = ["consultation", "meeting", "hearing", "other"]

// ── API helpers ───────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return undefined as T
  return res.json()
}

type EnrichedAppointment = {
  id: number; title: string; type: string; status: string
  date: string; startTime: string; endTime?: string; durationMinutes?: number
  location?: string; virtualMeetingUrl?: string; notes?: string
  clientId?: number; matterId?: number; assignedToId?: number; createdById?: number
  externalAttendees?: string[]
  assignedToName?: string; clientName?: string; matterTitle?: string; matterReference?: string
}

type EnrichedVisitor = {
  id: number; name: string; company?: string; contactInfo?: string; purpose?: string
  status: string; hostId?: number; hostName?: string
  clientId?: number; clientName?: string; matterId?: number; matterReference?: string
  appointmentId?: number
  expectedArrival?: string; expectedDeparture?: string
  checkedInAt?: string; checkedOutAt?: string
}

// ── Shared action button ──────────────────────────────────────────────────────
function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10, fontWeight: 600, padding: "3px 12px",
        background: `${color}18`, color, border: `1px solid ${color}35`,
        borderRadius: 6, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em",
      }}>
      {label}
    </button>
  )
}

// ── Appointment card ──────────────────────────────────────────────────────────
function AppointmentCard({ a, onStatusChange }: { a: EnrichedAppointment; onStatusChange: (id: number, status: string) => void }) {
  const sm = APPT_STATUS[a.status] ?? APPT_STATUS.scheduled
  return (
    <div style={{ ...cardStyle, borderLeft: `3px solid ${sm.color}`, padding: "12px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>{a.title}</p>
          <p style={{ fontSize: 10, color: T.textFaint, margin: "2px 0 0", textTransform: "capitalize" }}>{a.type}</p>
        </div>
        <span style={pillStyle(sm.color)}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: sm.color }} />
          {sm.label}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 11, color: T.textDim }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={10} style={{ color: T.textFaint }} />
          {a.startTime}{a.endTime ? ` – ${a.endTime}` : ""}
        </span>
        {a.assignedToName && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Users size={10} style={{ color: T.textFaint }} /> {a.assignedToName}
          </span>
        )}
        {a.clientName && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Building2 size={10} style={{ color: T.textFaint }} /> {a.clientName}
          </span>
        )}
        {a.matterReference && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "monospace" }}>
            <Link2 size={10} style={{ color: T.textFaint }} /> {a.matterReference}
          </span>
        )}
        {a.location && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={10} style={{ color: T.textFaint }} /> {a.location}
          </span>
        )}
        {a.virtualMeetingUrl && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Video size={10} style={{ color: T.blue }} /> Virtual
          </span>
        )}
      </div>

      {["scheduled", "rescheduled"].includes(a.status) && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <ActionBtn label="Confirm"  color={T.ok}   onClick={() => onStatusChange(a.id, "confirmed")} />
          <ActionBtn label="Cancel"   color={T.risk}  onClick={() => onStatusChange(a.id, "cancelled")} />
        </div>
      )}
      {a.status === "confirmed" && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <ActionBtn label="Mark Completed" color={T.textDim} onClick={() => onStatusChange(a.id, "completed")} />
          <ActionBtn label="No Show"        color={T.warn}    onClick={() => onStatusChange(a.id, "no_show")} />
        </div>
      )}
    </div>
  )
}

// ── Visitor card ──────────────────────────────────────────────────────────────
function VisitorCard({ v, onStatusChange }: { v: EnrichedVisitor; onStatusChange: (id: number, status: string) => void }) {
  const sm = VISITOR_STATUS[v.status] ?? VISITOR_STATUS.expected
  const arrivalTime = v.expectedArrival ? new Date(v.expectedArrival).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"
  return (
    <div style={{ ...cardStyle, borderLeft: `3px solid ${sm.color}`, padding: "12px 14px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>{v.name}</p>
          {v.company && <p style={{ fontSize: 11, color: T.textDim, margin: "2px 0 0" }}>{v.company}</p>}
        </div>
        <span style={pillStyle(sm.color)}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: sm.color }} />
          {sm.label}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 11, color: T.textDim }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={10} style={{ color: T.textFaint }} /> Expected {arrivalTime}
        </span>
        {v.hostName && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Users size={10} style={{ color: T.textFaint }} /> Visiting {v.hostName}
          </span>
        )}
        {v.matterReference && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "monospace" }}>
            <Link2 size={10} style={{ color: T.textFaint }} /> {v.matterReference}
          </span>
        )}
        {v.purpose && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <FileText size={10} style={{ color: T.textFaint }} /> {v.purpose}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {v.status === "expected" && (
          <ActionBtn label="Check In"    color={T.ok}      onClick={() => onStatusChange(v.id, "checked_in")} />
        )}
        {v.status === "checked_in" && (
          <ActionBtn label="With Attorney" color={T.cyan}  onClick={() => onStatusChange(v.id, "with_attorney")} />
        )}
        {["checked_in", "with_attorney"].includes(v.status) && (
          <ActionBtn label="Check Out"   color={T.textDim} onClick={() => onStatusChange(v.id, "checked_out")} />
        )}
        {v.status === "expected" && (
          <ActionBtn label="No Show"     color={T.warn}    onClick={() => onStatusChange(v.id, "no_show")} />
        )}
      </div>
    </div>
  )
}

// ── Shared form select ────────────────────────────────────────────────────────
const formSelectStyle = {
  width: "100%", background: T.surfaceEl, border: `1px solid ${T.border}`,
  color: T.text, padding: "6px 10px", fontSize: 12, borderRadius: 8, outline: "none",
}

const formLabelStyle = { fontSize: 11, color: T.textDim, display: "block" as const, marginBottom: 4 }

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AppointmentsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [apptSheetOpen, setApptSheetOpen]       = useState(false)
  const [visitorSheetOpen, setVisitorSheetOpen] = useState(false)
  const [viewMode, setViewMode]                 = useState<"today" | "upcoming">("today")

  const today = new Date().toISOString().split("T")[0]

  // ── Queries ──
  const { data: todayAppts,    isLoading: taL } = useQuery<EnrichedAppointment[]>({
    queryKey: ["appointments", "today"],
    queryFn: () => apiFetch("/appointments/today"),
  })
  const { data: upcomingAppts, isLoading: uaL } = useQuery<EnrichedAppointment[]>({
    queryKey: ["appointments", "upcoming"],
    queryFn: () => apiFetch("/appointments/upcoming"),
    enabled: viewMode === "upcoming",
  })
  const { data: todayVisitors, isLoading: tvL } = useQuery<EnrichedVisitor[]>({
    queryKey: ["visitors", "today"],
    queryFn: () => apiFetch("/visitors/today"),
  })

  const { data: clients } = useListClients({})
  const { data: matters } = useListMatters({})

  // ── Mutations ──
  const createAppt = useMutation({
    mutationFn: (data: Record<string, any>) => apiFetch<EnrichedAppointment>("/appointments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] })
      setApptSheetOpen(false)
      apptForm.reset()
      toast({ title: "Appointment created" })
    },
    onError: () => toast({ title: "Error", description: "Could not create appointment.", variant: "destructive" }),
  })

  const createVisitor = useMutation({
    mutationFn: (data: Record<string, any>) => apiFetch<EnrichedVisitor>("/visitors", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitors"] })
      setVisitorSheetOpen(false)
      visitorForm.reset()
      toast({ title: "Visitor registered" })
    },
    onError: () => toast({ title: "Error", description: "Could not register visitor.", variant: "destructive" }),
  })

  const updateApptStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/appointments/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  })

  const updateVisitorStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/visitors/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitors"] }),
  })

  // ── Forms ──
  const apptForm    = useForm<Record<string, any>>({ defaultValues: { type: "consultation", status: "scheduled" } })
  const visitorForm = useForm<Record<string, any>>({ defaultValues: { status: "expected" } })

  const displayAppts   = viewMode === "today" ? (todayAppts ?? []) : (upcomingAppts ?? [])
  const isLoadingAppts = viewMode === "today" ? taL : uaL

  const awaitingConfirmation = (todayAppts ?? []).filter(a => a.status === "scheduled" || a.status === "rescheduled")
  const activeVisitors       = (todayVisitors ?? []).filter(v => ["expected", "checked_in", "with_attorney"].includes(v.status))

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", borderBottom: `1px solid ${T.border}` }}>
        <div>
          <h1 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.text, margin: 0 }}>
            Appointments &amp; Visitors
          </h1>
          <p style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>
            {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setVisitorSheetOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 11, fontWeight: 500, color: T.textDim, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", height: 32 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl; (e.currentTarget as HTMLElement).style.color = T.text }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = T.textDim }}>
            <UserCheck size={12} /> Register Visitor
          </button>
          <button
            onClick={() => setApptSheetOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 11, fontWeight: 500, color: "#fff", background: "linear-gradient(135deg, #00CFFF, #4169E1)", border: "none", borderRadius: 8, cursor: "pointer", height: 32 }}>
            <Plus size={12} /> New Appointment
          </button>
        </div>
      </div>

      {/* ── Attention strip ── */}
      {awaitingConfirmation.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 24px", background: `color-mix(in srgb, ${T.warn} 10%, transparent)`, borderBottom: `1px solid color-mix(in srgb, ${T.warn} 28%, transparent)` }}>
          <AlertTriangle size={12} style={{ color: T.warn, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: T.warn }}>
            {awaitingConfirmation.length} appointment{awaitingConfirmation.length > 1 ? "s" : ""} awaiting confirmation
          </span>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT: Appointments ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${T.border}`, overflow: "hidden" }}>

          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, background: T.surfaceEl }}>
            {(["today", "upcoming"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  flex: 1, padding: "9px 0", fontSize: 11, fontWeight: 500,
                  textTransform: "capitalize", color: viewMode === mode ? T.text : T.textFaint,
                  borderBottom: viewMode === mode ? `2px solid ${T.blue}` : "2px solid transparent",
                  background: "transparent", border: "none", cursor: "pointer",
                }}
              >
                {mode === "today" ? `Today (${todayAppts?.length ?? 0})` : "Upcoming"}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {isLoadingAppts ? <PageLoader /> : displayAppts.length === 0 ? (
              <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", paddingTop: 32 }}>
                No appointments {viewMode === "today" ? "today" : "upcoming"}
              </p>
            ) : (
              displayAppts.map(a => (
                <AppointmentCard key={a.id} a={a} onStatusChange={(id, status) => updateApptStatus.mutate({ id, status })} />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: Visitors ── */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Panel header */}
          <div style={{ padding: "9px 16px", borderBottom: `1px solid ${T.border}`, background: T.surfaceEl, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint }}>
              Visitors Today ({todayVisitors?.length ?? 0})
            </span>
            <span style={{ fontSize: 10, color: activeVisitors.length > 0 ? T.ok : T.textFaint }}>
              {activeVisitors.length} active
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {tvL ? <PageLoader /> : (todayVisitors ?? []).length === 0 ? (
              <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", paddingTop: 32 }}>
                No visitors expected today
              </p>
            ) : (
              (todayVisitors ?? []).map(v => (
                <VisitorCard key={v.id} v={v} onStatusChange={(id, status) => updateVisitorStatus.mutate({ id, status })} />
              ))
            )}
          </div>

          {/* Quick actions footer */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint, margin: 0 }}>Quick Actions</p>
            {[
              { label: "New Appointment",    action: () => setApptSheetOpen(true),    icon: CalendarDays },
              { label: "Register Visitor",   action: () => setVisitorSheetOpen(true), icon: UserCheck    },
            ].map(({ label, action, icon: Icon }) => (
              <button
                key={label}
                onClick={action}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                  background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8,
                  color: T.textDim, fontSize: 11, cursor: "pointer", width: "100%", textAlign: "left",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                <Icon size={12} style={{ color: T.blue }} /> {label}
                <ArrowRight size={10} style={{ marginLeft: "auto", color: T.textFaint }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Create Appointment Sheet ── */}
      <Sheet open={apptSheetOpen} onOpenChange={setApptSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Appointment</SheetTitle>
            <SheetDescription>Schedule an appointment and assign it to a staff member.</SheetDescription>
          </SheetHeader>
          <form
            className="space-y-3 py-4"
            onSubmit={apptForm.handleSubmit(data => createAppt.mutate(data))}
          >
            <div>
              <label style={formLabelStyle}>Title *</label>
              <Input {...apptForm.register("title", { required: true })} placeholder="Client Consultation" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={formLabelStyle}>Type</label>
                <select {...apptForm.register("type")} style={formSelectStyle}>
                  {APPT_TYPES.map(t => <option key={t} value={t} style={{ textTransform: "capitalize" }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={formLabelStyle}>Status</label>
                <select {...apptForm.register("status")} style={formSelectStyle}>
                  {Object.entries(APPT_STATUS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={formLabelStyle}>Date *</label>
              <Input type="date" {...apptForm.register("date", { required: true })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={formLabelStyle}>Start Time *</label>
                <Input type="time" {...apptForm.register("startTime", { required: true })} />
              </div>
              <div>
                <label style={formLabelStyle}>End Time</label>
                <Input type="time" {...apptForm.register("endTime")} />
              </div>
            </div>
            <div>
              <label style={formLabelStyle}>Location</label>
              <Input {...apptForm.register("location")} placeholder="Boardroom 1 / Virtual" />
            </div>
            <div>
              <label style={formLabelStyle}>Virtual Meeting URL</label>
              <Input {...apptForm.register("virtualMeetingUrl")} placeholder="https://meet.google.com/..." />
            </div>
            <div>
              <label style={formLabelStyle}>Assign to Attorney / Staff</label>
              <Input {...apptForm.register("assignedToName")} placeholder="Attorney name" />
            </div>
            <div>
              <label style={formLabelStyle}>Client</label>
              <select {...apptForm.register("clientId")} style={formSelectStyle}>
                <option value="">— Select client —</option>
                {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={formLabelStyle}>Matter</label>
              <select {...apptForm.register("matterId")} style={formSelectStyle}>
                <option value="">— Select matter —</option>
                {(matters ?? []).map(m => <option key={m.id} value={m.id}>{m.reference} — {m.title}</option>)}
              </select>
            </div>
            <div>
              <label style={formLabelStyle}>Notes</label>
              <textarea
                {...apptForm.register("notes")}
                placeholder="Additional notes…"
                rows={3}
                style={{ ...formSelectStyle, resize: "vertical" }}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createAppt.isPending}>
              {createAppt.isPending ? "Creating…" : "Create Appointment"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Register Visitor Sheet ── */}
      <Sheet open={visitorSheetOpen} onOpenChange={setVisitorSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Register Visitor</SheetTitle>
            <SheetDescription>Register an expected visitor for today.</SheetDescription>
          </SheetHeader>
          <form
            className="space-y-3 py-4"
            onSubmit={visitorForm.handleSubmit(data => {
              const payload = {
                ...data,
                expectedArrival: data.expectedArrivalDate && data.expectedArrivalTime
                  ? new Date(`${data.expectedArrivalDate}T${data.expectedArrivalTime}`).toISOString()
                  : undefined,
              }
              createVisitor.mutate(payload)
            })}
          >
            <div>
              <label style={formLabelStyle}>Visitor Name *</label>
              <Input {...visitorForm.register("name", { required: true })} placeholder="John Smith" />
            </div>
            <div>
              <label style={formLabelStyle}>Company / Organisation</label>
              <Input {...visitorForm.register("company")} placeholder="ABC Holdings" />
            </div>
            <div>
              <label style={formLabelStyle}>Contact Information</label>
              <Input {...visitorForm.register("contactInfo")} placeholder="Email or phone" />
            </div>
            <div>
              <label style={formLabelStyle}>Purpose of Visit</label>
              <Input {...visitorForm.register("purpose")} placeholder="Client consultation / Document signing" />
            </div>
            <div>
              <label style={formLabelStyle}>Visiting (Attorney / Staff)</label>
              <Input {...visitorForm.register("hostName")} placeholder="Partner / Staff name" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={formLabelStyle}>Expected Date</label>
                <Input type="date" defaultValue={today} {...visitorForm.register("expectedArrivalDate")} />
              </div>
              <div>
                <label style={formLabelStyle}>Expected Time</label>
                <Input type="time" {...visitorForm.register("expectedArrivalTime")} />
              </div>
            </div>
            <div>
              <label style={formLabelStyle}>Client</label>
              <select {...visitorForm.register("clientId")} style={formSelectStyle}>
                <option value="">— Select client (optional) —</option>
                {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={formLabelStyle}>Matter</label>
              <select {...visitorForm.register("matterId")} style={formSelectStyle}>
                <option value="">— Select matter (optional) —</option>
                {(matters ?? []).map(m => <option key={m.id} value={m.id}>{m.reference} — {m.title}</option>)}
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={createVisitor.isPending}>
              {createVisitor.isPending ? "Registering…" : "Register Visitor"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
