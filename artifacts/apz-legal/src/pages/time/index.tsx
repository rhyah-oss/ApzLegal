import { useState, useEffect } from "react"
import { useLocation, useSearch } from "wouter"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { Play, Square, Clock as ClockIcon, Filter, X } from "lucide-react"
import { useListTimeEntries, useCreateTimeEntry, useListMatters, useListClients, getListTimeEntriesQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { PageLoader } from "@/components/ui/loader"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/format"
import { T, cardStyle } from "@/lib/theme"
import { DATE_PRESETS, formatDateRange } from "@/lib/date-presets"

const timeEntrySchema = z.object({
  matterId:    z.coerce.number().positive("Matter is required"),
  description: z.string().min(3, "Description required"),
  hours:       z.coerce.number().positive(),
  rate:        z.coerce.number().positive(),
  date:        z.string().min(1, "Entry date is required"),
})
type TimeEntryFormValues = z.infer<typeof timeEntrySchema>

export default function TimeTrackingPage() {
  const [location, setLocation] = useLocation()
  const search = useSearch()
  const params = new URLSearchParams(search)

  const startDate = params.get("startDate") || undefined
  const endDate = params.get("endDate") || undefined
  const userId = params.get("userId") ? Number(params.get("userId")) : undefined
  const matterIdFilter = params.get("matterId") ? Number(params.get("matterId")) : undefined
  const clientId = params.get("clientId") ? Number(params.get("clientId")) : undefined
  const practiceArea = params.get("practiceArea") || undefined

  const { toast }   = useToast()
  const queryClient = useQueryClient()
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds]     = useState(0)

  const [draftFilters, setDraftFilters] = useState({
    startDate, endDate, userId, matterId: matterIdFilter, clientId, practiceArea, preset: ""
  })

  useEffect(() => {
    setDraftFilters({ startDate, endDate, userId, matterId: matterIdFilter, clientId, practiceArea, preset: "" })
  }, [search])

  const applyFilters = () => {
    const p = new URLSearchParams()
    if (draftFilters.startDate) p.set("startDate", draftFilters.startDate)
    if (draftFilters.endDate) p.set("endDate", draftFilters.endDate)
    if (draftFilters.userId) p.set("userId", String(draftFilters.userId))
    if (draftFilters.matterId) p.set("matterId", String(draftFilters.matterId))
    if (draftFilters.clientId) p.set("clientId", String(draftFilters.clientId))
    if (draftFilters.practiceArea) p.set("practiceArea", draftFilters.practiceArea)
    setLocation(`/time?${p.toString()}`)
  }

  const resetFilters = () => {
    setLocation(`/time`)
  }

  const { data: entries, isLoading: entriesLoading } = useListTimeEntries({
    startDate, endDate, userId, matterId: matterIdFilter, clientId, practiceArea
  })
  const { data: matters } = useListMatters()
  const { data: clients } = useListClients()
  const createEntry        = useCreateTimeEntry()

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: { matterId: 0, description: "", hours: 0, rate: 2500, date: format(new Date(), "yyyy-MM-dd") },
  })

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (isTimerRunning) interval = setInterval(() => setTimerSeconds(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [isTimerRunning])

  useEffect(() => {
    if (isTimerRunning) form.setValue("hours", +(timerSeconds / 3600).toFixed(2))
  }, [timerSeconds, isTimerRunning, form])

  const formatTimer = (s: number) => {
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }

  function onSubmit(data: TimeEntryFormValues) {
    createEntry.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() })
        form.reset({ ...data, description: "", hours: 0 })
        setIsTimerRunning(false)
        setTimerSeconds(0)
        toast({ title: "Time logged", description: "Entry successfully recorded." })
      },
      onError: () => toast({ title: "Error", description: "Failed to save time entry.", variant: "destructive" }),
    })
  }

  const totalHours  = (entries || []).reduce((sum, e) => sum + e.hours, 0)
  const matterCount = new Set((entries || []).map(entry => entry.matterId)).size
  const hasActiveFilters = !!(startDate || endDate || userId || matterIdFilter || clientId || practiceArea)

  // shared input style
  const fieldSx: React.CSSProperties = {
    background: T.surfaceEl,
    border: `1px solid ${T.border}`,
    borderRadius: 7,
    color: T.text,
    height: 36,
    fontSize: 12,
    padding: "0 12px",
    outline: "none",
    width: "100%",
  }

  return (
    <div style={{ flex: 1, minHeight: "100%", background: T.bg, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
            Time Tracking
          </h1>
          <p style={{ fontSize: 16, fontWeight: 600, color: T.text, marginTop: 4 }}>
            Record working hours and manage timesheets
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {[
          { label: "Total Hours", value: `${totalHours.toFixed(1)} hrs`, accent: T.blue },
          { label: "Entries",     value: `${entries?.length ?? 0}`,        accent: T.cyan },
          { label: "Matters",     value: `${matterCount}`,                  accent: T.ok   },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint }}>
              {s.label}
            </span>
            <span style={{ fontSize: 26, fontWeight: 300, color: s.accent, lineHeight: 1 }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Timer + log form */}
      <div style={{ ...cardStyle, padding: "18px 20px" }}>
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, marginBottom: 14 }}>
          Log Time Entry
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Timer row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                type="button"
                onClick={() => setIsTimerRunning(r => !r)}
                style={{
                  height: 38, width: 38, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `2px solid ${isTimerRunning ? T.risk : T.border}`,
                  background: isTimerRunning ? `color-mix(in srgb, ${T.risk} 15%, transparent)` : T.surfaceEl,
                  color: isTimerRunning ? T.risk : T.textDim,
                  cursor: "pointer", flexShrink: 0, transition: "all 0.15s",
                }}
              >
                {isTimerRunning
                  ? <Square style={{ width: 14, height: 14 }} />
                  : <Play  style={{ width: 14, height: 14, marginLeft: 1 }} />}
              </button>
              <span style={{
                fontFamily: "monospace",
                fontSize: 28, fontWeight: 300, letterSpacing: "0.08em",
                color: isTimerRunning ? T.text : T.textFaint,
                minWidth: 148,
              }}>
                {formatTimer(timerSeconds)}
              </span>
            </div>

            {/* Fields grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[2fr_4fr_1.5fr_1.5fr_1.5fr_auto] gap-2.5 items-start">

              {/* Matter */}
              <FormField control={form.control} name="matterId" render={({ field }) => (
                <FormItem>
                  <Select
                    onValueChange={val => field.onChange(Number(val))}
                    value={field.value ? String(field.value) : undefined}
                    disabled={isTimerRunning}
                  >
                    <FormControl>
                      <SelectTrigger style={{ ...fieldSx }}>
                        <SelectValue placeholder="Select Matter" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                      {matters?.map(m => (
                        <SelectItem key={m.id} value={String(m.id)} style={{ color: T.text, fontSize: 12 }}>
                          {m.reference}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )} />

              {/* Description */}
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <input
                      placeholder="What are you working on?"
                      {...field}
                      style={fieldSx}
                    />
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )} />

              {/* Entry date */}
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <input type="date" {...field} style={fieldSx} aria-label="Entry date" data-testid="input-time-entry-date" />
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )} />

              {/* Hours */}
              <FormField control={form.control} name="hours" render={({ field }) => (
                <FormItem>
                  <div style={{ position: "relative" }}>
                    <FormControl>
                      <input
                        type="number"
                        step="0.1"
                        {...field}
                        style={{ ...fieldSx, paddingRight: 32 }}
                      />
                    </FormControl>
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: T.textFaint, pointerEvents: "none" }}>
                      hrs
                    </span>
                  </div>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )} />

              {/* Rate (hidden but kept in form) */}
              <FormField control={form.control} name="rate" render={({ field }) => (
                <FormItem>
                  <div style={{ position: "relative" }}>
                    <FormControl>
                      <input
                        type="number"
                        step="100"
                        {...field}
                        style={{ ...fieldSx, paddingRight: 32 }}
                      />
                    </FormControl>
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: T.textFaint, pointerEvents: "none" }}>
                      R/h
                    </span>
                  </div>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )} />

              {/* Submit */}
              <div>
                <button
                  type="submit"
                  disabled={createEntry.isPending || isTimerRunning}
                  style={{
                    height: 36, padding: "0 20px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
                    color: "#fff", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                    opacity: (createEntry.isPending || isTimerRunning) ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  Log Time
                </button>
              </div>
            </div>
          </form>
        </Form>
      </div>

      {/* Entries table card */}
      <div style={{ ...cardStyle, overflow: "hidden", flex: 1 }}>
        {/* Table subheader */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
          padding: "10px 16px", borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ClockIcon style={{ width: 12, height: 12, color: T.textFaint }} />
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint }}>
              Recent Entries
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {hasActiveFilters && (
              <span style={{ fontSize: 10, color: T.textDim, display: "flex", alignItems: "center", gap: 4 }}>
                Filtered by:
                {startDate || endDate ? formatDateRange(startDate, endDate) : ''}
                {matterIdFilter ? ` Matter #${matterIdFilter}` : ''}
                {clientId ? ` Client #${clientId}` : ''}
                {userId ? ` User #${userId}` : ''}
                {practiceArea ? ` Practice: ${practiceArea}` : ''}
                <button onClick={resetFilters} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.textFaint, padding: 2 }} aria-label="Clear filters" data-testid="button-clear-time-filters">
                  <X size={10} />
                </button>
              </span>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  data-testid="button-time-filters"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 6, fontSize: 10,
                    background: hasActiveFilters ? T.surfaceEl : "transparent",
                    border: `1px solid ${hasActiveFilters ? T.borderSub : T.border}`,
                    color: hasActiveFilters ? T.text : T.textDim, cursor: "pointer",
                  }}
                >
                  <Filter style={{ width: 10, height: 10 }} /> Filter
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" style={{ width: 280, padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>Filter Time Entries</div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, color: T.textDim }}>Date Range</label>
                    <Select
                      value={draftFilters.preset || "custom"}
                      onValueChange={v => {
                        if (v !== "custom") {
                          const preset = DATE_PRESETS.find(p => p.label === v)
                          if (preset) {
                            const r = preset.getRange()
                            setDraftFilters(p => ({ ...p, preset: v, startDate: format(r.start, 'yyyy-MM-dd'), endDate: format(r.end, 'yyyy-MM-dd') }))
                          }
                        } else {
                          setDraftFilters(p => ({ ...p, preset: "custom" }))
                        }
                      }}
                    >
                      <SelectTrigger style={fieldSx} data-testid="select-time-date-preset">
                        <SelectValue placeholder="Custom Range" />
                      </SelectTrigger>
                      <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                        <SelectItem value="custom" style={{ fontSize: 11, color: T.text }}>Custom Range</SelectItem>
                        {DATE_PRESETS.map(p => (
                          <SelectItem key={p.label} value={p.label} style={{ fontSize: 11, color: T.text }}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <input type="date" style={{...fieldSx, fontSize: 10}} value={draftFilters.startDate || ""} onChange={e => setDraftFilters(p => ({...p, startDate: e.target.value, preset: "custom"}))} data-testid="input-time-start-date" />
                      <input type="date" style={{...fieldSx, fontSize: 10}} value={draftFilters.endDate || ""} onChange={e => setDraftFilters(p => ({...p, endDate: e.target.value, preset: "custom"}))} data-testid="input-time-end-date" />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, color: T.textDim }}>Matter</label>
                    <Select
                      value={draftFilters.matterId ? String(draftFilters.matterId) : "all"}
                      onValueChange={v => setDraftFilters(p => ({ ...p, matterId: v === "all" ? undefined : Number(v) }))}
                    >
                      <SelectTrigger style={fieldSx} data-testid="select-time-matter">
                        <SelectValue placeholder="All Matters" />
                      </SelectTrigger>
                      <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                        <SelectItem value="all" style={{ fontSize: 11, color: T.text }}>All Matters</SelectItem>
                        {matters?.map(m => (
                          <SelectItem key={m.id} value={String(m.id)} style={{ fontSize: 11, color: T.text }}>{m.reference} - {m.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, color: T.textDim }}>Client</label>
                    <Select
                      value={draftFilters.clientId ? String(draftFilters.clientId) : "all"}
                      onValueChange={v => setDraftFilters(p => ({ ...p, clientId: v === "all" ? undefined : Number(v) }))}
                    >
                      <SelectTrigger style={fieldSx} data-testid="select-time-client">
                        <SelectValue placeholder="All Clients" />
                      </SelectTrigger>
                      <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                        <SelectItem value="all" style={{ fontSize: 11, color: T.text }}>All Clients</SelectItem>
                        {clients?.map(c => (
                          <SelectItem key={c.id} value={String(c.id)} style={{ fontSize: 11, color: T.text }}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, color: T.textDim }}>Practice Area</label>
                    <Select
                      value={draftFilters.practiceArea || "all"}
                      onValueChange={value => setDraftFilters(current => ({ ...current, practiceArea: value === "all" ? undefined : value }))}
                    >
                      <SelectTrigger style={fieldSx} data-testid="select-time-practice-area">
                        <SelectValue placeholder="All Practice Areas" />
                      </SelectTrigger>
                      <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                        <SelectItem value="all" style={{ fontSize: 11, color: T.text }}>All Practice Areas</SelectItem>
                        {Array.from(new Set((matters ?? []).map(matter => matter.practiceArea).filter((area): area is string => Boolean(area)))).sort().map(area => (
                          <SelectItem key={area} value={area} style={{ fontSize: 11, color: T.text }}>{area}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                    <button onClick={resetFilters} style={{ background: "transparent", border: `1px solid ${T.border}`, padding: "6px 12px", borderRadius: 6, fontSize: 11, color: T.text, cursor: "pointer" }} data-testid="button-time-reset">Reset</button>
                    <button onClick={applyFilters} style={{ background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`, border: "none", padding: "6px 12px", borderRadius: 6, fontSize: 11, color: "#fff", fontWeight: 600, cursor: "pointer" }} data-testid="button-time-apply">Apply</button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
              {["Date", "User", "Matter", "Description", "Hours"].map(h => (
                <TableHead key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint }}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entriesLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center"><PageLoader /></TableCell>
              </TableRow>
            ) : entries?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center" style={{ color: T.textFaint, fontSize: 12 }}>
                  No time entries found.
                </TableCell>
              </TableRow>
            ) : entries?.map(entry => (
              <TableRow
                key={entry.id}
                style={{ borderBottom: `1px solid ${T.borderSub}` }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceB }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                <TableCell style={{ fontSize: 11, color: T.textDim, whiteSpace: "nowrap" }}>
                  {formatDate(entry.createdAt)}
                </TableCell>
                <TableCell style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                  {entry.userName}
                </TableCell>
                <TableCell style={{ fontSize: 11, color: T.textDim }}>
                  {entry.matterTitle}
                </TableCell>
                <TableCell style={{ fontSize: 11, color: T.textDim, maxWidth: "18rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.description}
                </TableCell>
                <TableCell className="text-right font-mono" style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                  {entry.hours.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}