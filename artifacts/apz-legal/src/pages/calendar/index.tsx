import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { T, cardStyle, pillStyle } from "@/lib/theme"

type EventType = "deadline" | "hearing" | "meeting" | "task"

interface CalEvent {
  id: string; title: string; type: EventType; time?: string; matter?: string; day: number
}

const TYPE_COLOR: Record<EventType, string> = {
  deadline: T.risk,
  hearing:  T.blue,
  meeting:  T.cyan,
  task:     T.textDim,
}

// Status dots — rounded-full kept intentionally (tiny indicators)
const TYPE_DOT_BG: Record<EventType, string> = {
  deadline: "bg-red-500",
  hearing:  "bg-[#4169E1]",
  meeting:  "bg-[#00CFFF]",
  task:     "bg-[#5A80A8]",
}

const DAYS        = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export default function CalendarPage() {
  const now = new Date()
  const [selected, setSelected] = useState<number>(now.getDate())
  const [yearMonth, setYearMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""
  const qc = useQueryClient()
  const addEvent = async () => {
    const title = window.prompt("Event title")
    if (!title?.trim()) return
    const date = `${yearMonth.getFullYear()}-${String(yearMonth.getMonth() + 1).padStart(2, "0")}-${String(selected).padStart(2, "0")}`
    const startTime = window.prompt("Start time (HH:MM)", "09:00") || "09:00"
    const response = await fetch(`${BASE}/api/appointments`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), date, startTime, type: "meeting" }) })
    if (!response.ok) { window.alert("The event could not be saved."); return }
    await qc.invalidateQueries({ queryKey: ["/api/appointments", monthKey] })
  }
  const editEvent = async (event: CalEvent) => {
    const title = window.prompt("Event title", event.title)
    if (!title?.trim()) return
    const startTime = window.prompt("Start time (HH:MM)", event.time || "09:00") || event.time || "09:00"
    const response = await fetch(`${BASE}/api/appointments/${event.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), date: `${yearMonth.getFullYear()}-${String(yearMonth.getMonth() + 1).padStart(2, "0")}-${String(selected).padStart(2, "0")}`, startTime, type: event.type }) })
    if (!response.ok) { window.alert("The event could not be updated."); return }
    await qc.invalidateQueries({ queryKey: ["/api/appointments", monthKey] })
  }
  const deleteEvent = async (event: CalEvent) => {
    if (!window.confirm(`Delete "${event.title}"?`)) return
    const response = await fetch(`${BASE}/api/appointments/${event.id}`, { method: "DELETE", credentials: "include" })
    if (!response.ok) { window.alert("The event could not be deleted."); return }
    await qc.invalidateQueries({ queryKey: ["/api/appointments", monthKey] })
  }
  const monthKey = `${yearMonth.getFullYear()}-${String(yearMonth.getMonth() + 1).padStart(2, "0")}`
  const { data: appointments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/appointments", monthKey],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/appointments`, { credentials: "include" })
      if (!response.ok) throw new Error("Unable to load calendar")
      return response.json()
    },
  })
  const events = appointments.filter(a => a.date?.startsWith(monthKey)).map(a => ({
    id: String(a.id), day: Number(a.date.slice(-2)), type: a.type === "hearing" ? "hearing" : a.type === "meeting" ? "meeting" : "task",
    title: a.title, matter: a.matterReference, time: a.startTime,
  } as CalEvent))
  const MONTH = yearMonth.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
  const MONTH_DAYS = new Date(yearMonth.getFullYear(), yearMonth.getMonth() + 1, 0).getDate()
  const MONTH_OFFSET = new Date(yearMonth.getFullYear(), yearMonth.getMonth(), 1).getDay() === 0 ? 6 : new Date(yearMonth.getFullYear(), yearMonth.getMonth(), 1).getDay() - 1
  const dayEvents = events.filter(e => e.day === selected)

  const cells: (number | null)[] = [
    ...Array(MONTH_OFFSET).fill(null),
    ...Array.from({ length: MONTH_DAYS }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="flex h-full" style={{ background: T.bg }}>
      {/* Calendar grid */}
      <div className="flex flex-1 flex-col" style={{ borderRight: `1px solid ${T.border}` }}>

        {/* Month nav */}
        <div
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}
        >
          <div className="flex items-center gap-4">
            <button
              className="flex h-7 w-7 items-center justify-center rounded transition-colors"
              style={{ color: T.textDim, border: `1px solid ${T.border}` }}
             onClick={() => setYearMonth(new Date(yearMonth.getFullYear(), yearMonth.getMonth() - 1, 1))}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: T.text }}>
                {MONTH}
              </h2>
              <p className="text-[10px]" style={{ color: T.textDim }}>Firm calendar</p>
            </div>
            <button
              className="flex h-7 w-7 items-center justify-center rounded transition-colors"
              style={{ color: T.textDim, border: `1px solid ${T.border}` }}
             onClick={() => setYearMonth(new Date(yearMonth.getFullYear(), yearMonth.getMonth() + 1, 1))}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => void addEvent()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #4169E1, #00CFFF)", borderRadius: 7 }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Event
          </button>
        </div>

        {/* Day-of-week headers */}
        <div
          className="grid grid-cols-7 shrink-0"
          style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}
        >
          {DAYS.map(d => (
            <div
              key={d}
              className="py-2 text-center text-[9px] font-bold uppercase tracking-widest"
              style={{ color: T.textDim }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto">
           {isLoading ? <div className="col-span-7 flex items-center justify-center text-[12px]" style={{ color: T.textDim }}>Loading calendar…</div> : cells.map((day, i) => {
            if (!day) return (
              <div
                key={`empty-${i}`}
                style={{
                  borderBottom: `1px solid ${T.borderSub}`,
                  borderRight:  `1px solid ${T.borderSub}`,
                  background:   T.bg,
                }}
              />
            )
             const evts    = events.filter(e => e.day === day)
             const isToday = day === now.getDate() && yearMonth.getMonth() === now.getMonth() && yearMonth.getFullYear() === now.getFullYear()
            const isSel   = day === selected
            return (
              <button key={day} onClick={() => setSelected(day)}
                className="relative p-2 text-left transition-colors"
                style={{
                  borderBottom: `1px solid ${T.borderSub}`,
                  borderRight:  `1px solid ${T.borderSub}`,
                  background:   isSel ? T.surfaceEl : "transparent",
                  outline:      isSel ? `1px solid color-mix(in srgb, ${T.blue} 30%, transparent)` : "none",
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = T.surface }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                {/* Today circle — rounded-full kept as standard date highlight */}
                <div
                  className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium"
                  style={isToday
                    ? { background: "linear-gradient(135deg, #4169E1, #00CFFF)", color: "#fff" }
                    : { color: T.textDim }}
                >
                  {day}
                </div>
                <div className="space-y-0.5">
                  {evts.slice(0, 2).map(ev => (
                    <div key={ev.id} className="flex items-center gap-1 truncate">
                      {/* Tiny event dot — rounded-full as status indicator */}
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT_BG[ev.type]}`} />
                      <span className="truncate text-[10px]" style={{ color: T.textDim }}>{ev.title}</span>
                    </div>
                  ))}
                  {evts.length > 2 && (
                    <span className="text-[9px]" style={{ color: T.textFaint }}>+{evts.length - 2} more</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Day detail panel */}
      <div className="w-72 shrink-0 flex flex-col" style={{ background: T.bg }}>
        {/* Panel header */}
        <div
          className="px-5 py-3 shrink-0"
          style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}
        >
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: T.text }}>
            {selected ? `${MONTH.split(" ")[0]} ${selected}` : "Select a day"}
          </h3>
          <p className="text-[10px] mt-0.5" style={{ color: T.textDim }}>
            {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {dayEvents.length === 0 ? (
            <p className="py-8 text-center text-[12px]" style={{ color: T.textFaint }}>No events</p>
          ) : (
            dayEvents.map(ev => {
              const typeColor = TYPE_COLOR[ev.type]
              return (
                <div
                  key={ev.id}
                  className="cursor-pointer transition-colors"
                  style={{
                    ...cardStyle,
                    padding: "10px 12px",
                    borderLeft: `3px solid ${typeColor}`,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.surface }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-[12px] font-medium leading-snug" style={{ color: T.text }}>{ev.title}</p>
                    <span style={pillStyle(typeColor)}>{ev.type}</span>
                  </div>
                  {ev.time   && <p className="text-[11px]" style={{ color: T.textDim }}>{ev.time}</p>}
                  {ev.matter && <p className="mt-0.5 font-mono text-[10px]" style={{ color: T.textFaint }}>{ev.matter}</p>}
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => void editEvent(ev)} className="text-[10px]" style={{ color: T.blue }}>Edit</button>
                    <button onClick={() => void deleteEvent(ev)} className="text-[10px]" style={{ color: T.risk }}>Delete</button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
