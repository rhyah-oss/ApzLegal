import { useEffect, useState } from "react"
import { useLocation, Link } from "wouter"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Search, Plus, AlertTriangle, Briefcase } from "lucide-react"
import { useListMatters, useCreateMatter, useListClients, getListMattersQueryKey, type ListMattersStatus } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { PageLoader } from "@/components/ui/loader"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/format"
import { T } from "@/lib/theme"

const STATUS_META: Record<string, { color: string; label: string }> = {
  lead:           { color: "#5A7FA8", label: "Lead"          },
  conflict_check: { color: "#B3833A", label: "Conflict Check" },
  approved:       { color: "#4F9A7A", label: "Approved"      },
  active:         { color: T.blue,    label: "Active"        },
  review:         { color: "#7F75B5", label: "Review"        },
  completed:      { color: "#5B9078", label: "Completed"     },
  closed:         { color: "#3A5878", label: "Closed"        },
  archived:       { color: "#2D4A6A", label: "Archived"      },
}

const TABS = [
  { key: "all",            label: "All"            },
  { key: "lead",           label: "Leads"          },
  { key: "conflict_check", label: "Conflict Check" },
  { key: "active",         label: "Active"         },
  { key: "review",         label: "Review"         },
  { key: "completed",      label: "Completed"      },
]

const matterSchema = z.object({
  title:        z.string().min(3),
  clientId:     z.coerce.number().positive(),
  description:  z.string().optional(),
  practiceArea: z.string().optional(),
  value:        z.coerce.number().optional(),
})
type MatterFormValues = z.infer<typeof matterSchema>

function StatusPill({ status }: { status: string }) {
  const { color, label } = STATUS_META[status] ?? { color: T.textFaint, label: status }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 9px 2px 7px", borderRadius: 20,
      background: `${color}18`, border: `1px solid ${color}28`,
      fontSize: 9, fontWeight: 700, color,
      textTransform: "uppercase", letterSpacing: "0.07em",
    }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function FieldInput({ label, placeholder, field, required, type = "text" }: any) {
  return (
    <div>
      <label className="block text-[11px] font-medium mb-1.5" style={{ color: T.textDim }}>
        {label}{required && <span style={{ color: T.risk }} className="ml-0.5">*</span>}
      </label>
      <input placeholder={placeholder} {...field} type={type}
        className="w-full h-8 px-3 text-[12px] outline-none rounded-md"
        style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text }} />
    </div>
  )
}

export default function MattersPage() {
  const [location, setLocation]  = useLocation()
  const { toast }        = useToast()
  const queryClient      = useQueryClient()
  const [browserQuery, setBrowserQuery] = useState(() =>
    typeof window !== "undefined" ? window.location.search : ""
  )
  const query = new URLSearchParams(browserQuery)
  const search = query.get("search") ?? ""
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sheetOpen, setSheetOpen]       = useState(false)

  const clientFilter = query.get("client")
  const createRequested = query.get("create") === "1"
  const { data: matters, isLoading, isError, refetch } = useListMatters({
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as ListMattersStatus) : undefined,
  })
  const { data: clients } = useListClients()
  const createMatter      = useCreateMatter()

  const form = useForm<MatterFormValues>({
    resolver: zodResolver(matterSchema),
    defaultValues: { title: "", clientId: 0, description: "", practiceArea: "" },
  })

  useEffect(() => {
    setBrowserQuery(window.location.search)
  }, [location])

  useEffect(() => {
    const syncQueryFromLocation = () => {
      setBrowserQuery(window.location.search)
    }
    window.addEventListener("popstate", syncQueryFromLocation)
    window.addEventListener("apz-location-change", syncQueryFromLocation)
    return () => {
      window.removeEventListener("popstate", syncQueryFromLocation)
      window.removeEventListener("apz-location-change", syncQueryFromLocation)
    }
  }, [])

  useEffect(() => {
    if (createRequested) setSheetOpen(true)
  }, [createRequested])

  function handleSearchChange(value: string) {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
    if (value.trim()) params.set("search", value)
    else params.delete("search")
    const suffix = params.toString()
    setBrowserQuery(suffix ? `?${suffix}` : "")
    setLocation(`/matters${suffix ? `?${suffix}` : ""}`, { replace: true })
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    if (!open && createRequested) {
      const params = new URLSearchParams(browserQuery)
      params.delete("create")
      const suffix = params.toString()
      setBrowserQuery(suffix ? `?${suffix}` : "")
      setLocation(`/matters${suffix ? `?${suffix}` : ""}`, { replace: true })
    }
  }

  const visibleMatters = clientFilter
    ? matters?.filter(m => String(m.clientId) === clientFilter)
    : matters

  function onSubmit(data: MatterFormValues) {
    createMatter.mutate({ data }, {
      onSuccess: m => {
        queryClient.invalidateQueries({ queryKey: getListMattersQueryKey() })
        setSheetOpen(false); form.reset()
        toast({ title: "Matter created" })
        setLocation(`/matters/${m.id}`)
      },
      onError: () => toast({ title: "Error", description: "Failed to create matter.", variant: "destructive" }),
    })
  }

  const counts = TABS.reduce((acc, t) => {
    if (t.key === "all") acc.all = visibleMatters?.length ?? 0
    else acc[t.key] = visibleMatters?.filter(m => m.status === t.key).length ?? 0
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="matters-page flex flex-col min-h-full" style={{ background: T.bg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div>
          <h1 className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text }}>Matters</h1>
          <p className="text-[10px] mt-0.5" style={{ color: T.textFaint }}>
             {isError ? "Unable to load matters" : `${visibleMatters?.length ?? 0} matters across all lifecycle stages`}
          </p>
        </div>
        <Sheet open={sheetOpen || createRequested} onOpenChange={handleSheetOpenChange}>
          <SheetTrigger asChild>
            <button
              className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #4169E1, #00CFFF)" }}>
              <Plus className="h-3.5 w-3.5" /> New Matter
            </button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto" style={{ background: T.surfaceB, borderLeft: `1px solid ${T.border}` }}>
            <SheetHeader className="pb-4" style={{ borderBottom: `1px solid ${T.border}` }}>
              <SheetTitle className="text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>
                Create New Matter
              </SheetTitle>
              <p className="text-[11px] mt-1" style={{ color: T.textFaint }}>
                Client must be FICA-compliant before a matter can proceed to Active status.
              </p>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-5">
                <FormField control={form.control} name="clientId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px]" style={{ color: T.textDim }}>Client *</FormLabel>
                    <Select onValueChange={v => field.onChange(Number(v))} value={field.value ? String(field.value) : undefined}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-[12px] rounded-md"
                          style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text }}>
                          <SelectValue placeholder="Select client…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients?.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                            {(c as any).ficaStatus && (c as any).ficaStatus !== "compliant" && (
                              <span className="ml-2 text-amber-400 text-[9px]">⚠ {(c as any).ficaStatus}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FieldInput label="Matter Title" placeholder="e.g. M&A Acquisition of TechCorp" field={field} required />
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="practiceArea" render={({ field }) => (
                  <FormItem>
                    <FieldInput label="Practice Area" placeholder="e.g. Corporate Law" field={field} />
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <label className="block text-[11px] font-medium mb-1.5" style={{ color: T.textDim }}>Description</label>
                    <FormControl>
                      <textarea placeholder="Brief summary of the matter…" {...field} rows={3}
                        className="w-full px-3 py-2 text-[12px] outline-none resize-none rounded-md"
                        style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="value" render={({ field }) => (
                  <FormItem>
                    <FieldInput label="Estimated Value (optional)" placeholder="0.00" field={{ ...field, type: "number" }} />
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="px-3 py-2.5 rounded-lg" style={{ background: `color-mix(in srgb, ${T.warn} 8%, transparent)`, borderLeft: `2px solid ${T.warn}` }}>
                  <p className="text-[10px]" style={{ color: T.warn }}>
                    <AlertTriangle className="inline h-3 w-3 mr-1 mb-0.5" />
                    Matter will be created at Lead status. Conflict check and partner approval are required before activation.
                  </p>
                </div>

                <button type="submit" disabled={createMatter.isPending}
                  className="w-full py-2 text-[12px] font-semibold text-white rounded-lg transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #4169E1, #00CFFF)" }}>
                  {createMatter.isPending ? "Creating…" : "Create Matter"}
                </button>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      </div>

      {/* Search bar */}
      <div className="matters-toolbar flex items-center gap-3 px-6 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="relative w-80 matters-search">
          <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5" style={{ color: T.textFaint }} />
          <input type="search" placeholder="Search by reference, title or client…"
            className="w-full h-7 pl-8 pr-3 text-[11px] outline-none rounded-md"
            style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text }}
             value={search} onChange={e => handleSearchChange(e.target.value)} />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center px-6" style={{ borderBottom: `1px solid ${T.border}` }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className="flex items-center gap-1.5 px-3 py-2 text-[11px] transition-colors shrink-0"
            style={{
              color:        statusFilter === tab.key ? T.text : T.textFaint,
              borderBottom: statusFilter === tab.key ? `2px solid ${T.blue}` : "2px solid transparent",
              fontWeight:   statusFilter === tab.key ? 500 : 400,
            }}>
            {tab.label}
            <span className="font-mono text-[9px]" style={{ color: statusFilter === tab.key ? T.textDim : T.textFaint }}>
              {counts[tab.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                {["Reference", "Matter", "Client", "Status", "Assigned To", "Value"].map(h => (
                  <TableHead key={h} className="text-[9px] uppercase tracking-[0.12em] font-semibold py-2.5"
                    style={{ color: T.textFaint }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center"><PageLoader /></TableCell></TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center">
                    <div className="list-state">
                      <AlertTriangle size={16} />
                      <strong>Matters could not be loaded</strong>
                      <span>Check your connection and try again.</span>
                      <button type="button" onClick={() => refetch()}>Retry</button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : !visibleMatters?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center">
                    <div className="list-state">
                      <Briefcase className="h-4 w-4" />
                      <strong>{search || clientFilter ? "No matching matters" : "No matters yet"}</strong>
                      <span>{search || clientFilter ? "Try a different search or clear the filter." : "Create the first matter to begin a governed workflow."}</span>
                      {!search && !clientFilter && <button type="button" onClick={() => setSheetOpen(true)}>Create matter</button>}
                    </div>
                  </TableCell>
                </TableRow>
              ) : visibleMatters.map(m => (
                <TableRow key={m.id} className="cursor-pointer transition-colors"
                  style={{ borderBottom: `1px solid ${T.borderSub}` }}
                  onClick={() => setLocation(`/matters/${m.id}`)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceB }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                  <TableCell className="font-mono text-[10px] py-3 whitespace-nowrap" style={{ color: T.textFaint }}>
                    {m.reference}
                  </TableCell>
                  <TableCell className="py-3">
                    <p className="text-[12px] font-medium" style={{ color: T.text }}>{m.title}</p>
                    <p className="text-[10px]" style={{ color: T.textFaint }}>{m.practiceArea || "General Practice"}</p>
                  </TableCell>
                  <TableCell className="py-3">
                    <Link href={`/clients/${m.clientId}`} onClick={e => e.stopPropagation()}>
                      <span className="text-[11px] transition-colors hover:underline" style={{ color: T.textDim }}>
                        {m.clientName}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="py-3">
                    <StatusPill status={m.status} />
                  </TableCell>
                  <TableCell className="py-3 text-[11px]" style={{ color: T.textDim }}>
                    {m.assignedToName || <span style={{ color: T.textFaint, fontStyle: "italic" }}>Unassigned</span>}
                  </TableCell>
                  <TableCell className="py-3 text-[11px] font-medium" style={{ color: T.text }}>
                    {m.value ? formatCurrency(m.value) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
