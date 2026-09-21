import { useState } from "react"
import { Search, Filter, User, Download } from "lucide-react"
import { getListAuditLogsQueryKey, useGetCurrentUser, useListAuditLogs } from "@workspace/api-client-react"
import { PageLoader } from "@/components/ui/loader"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { T, cardStyle, pillStyle } from "@/lib/theme"

const ACTION_COLOR = (action: string): string => {
  if (action.includes("CREATE") || action.includes("ADD"))    return T.ok
  if (action.includes("UPDATE") || action.includes("EDIT"))   return T.blue
  if (action.includes("DELETE") || action.includes("REMOVE")) return T.risk
  if (action.includes("LOGIN"))                               return "#a78bfa"
  return T.textFaint
}

const gradientCta = {
  background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
}

export default function AuditPage() {
  const [search, setSearch] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [entityType, setEntityType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const { data: currentUser } = useGetCurrentUser()
  const canAudit = ["compliance_officer", "partner", "managing_partner", "admin", "super_admin"].includes(currentUser?.role ?? "")
  const query = {
    entityType: entityType || undefined,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
  }
  const { data: logs, isLoading } = useListAuditLogs(query, {
    query: { enabled: canAudit, queryKey: getListAuditLogsQueryKey(query) },
  })
  const exportAudit = () => {
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""
    const params = new URLSearchParams()
    if (query.entityType) params.set("entityType", query.entityType)
    if (query.from) params.set("from", query.from)
    if (query.to) params.set("to", query.to)
    window.location.assign(`${BASE}/api/audit-logs/export?${params.toString()}`)
  }

  const filtered = search
    ? logs?.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        (l.userName || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.entityType || "").toLowerCase().includes(search.toLowerCase())
      )
    : logs

  const inputStyle: React.CSSProperties = {
    background: T.surfaceEl,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    color: T.text,
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "100%", background: T.bg }}>
      {/* Page header */}
      <div className="flex items-baseline justify-between px-7 py-5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>
            Audit Log
          </h1>
          <span className="text-[11px]" style={{ color: T.textDim }}>
            System-wide immutable activity record
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-7 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5" style={{ color: T.textFaint }} />
          <input
            type="search"
            placeholder="Search by user, action or entity…"
            className="w-full h-8 pl-9 pr-3 text-[12px] outline-none"
            style={inputStyle}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] transition-colors"
          style={{ border: `1px solid ${T.border}`, borderRadius: 8, color: T.textDim, background: "transparent" }}
          onClick={() => setShowFilters(!showFilters)}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
        >
          <Filter className="h-3 w-3" /> Filters
        </button>
        <button
          onClick={exportAudit}
          disabled={!canAudit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ ...gradientCta, borderRadius: 8 }}
        >
          <Download className="h-3 w-3" /> Export CSV
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div
          className="flex flex-wrap items-end gap-4 px-7 py-4"
          style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}
        >
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.textDim }}>
            Entity type
            <input
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              placeholder="e.g. document"
              className="mt-1.5 block h-8 px-3 text-[12px] outline-none"
              style={inputStyle}
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.textDim }}>
            From
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="mt-1.5 block h-8 px-3 text-[12px] outline-none"
              style={inputStyle}
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.textDim }}>
            To
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="mt-1.5 block h-8 px-3 text-[12px] outline-none"
              style={inputStyle}
            />
          </label>
          <button
            onClick={() => { setEntityType(""); setFrom(""); setTo("") }}
            className="h-8 px-3 text-[11px] transition-colors"
            style={{ border: `1px solid ${T.border}`, borderRadius: 8, color: T.textDim, background: "transparent" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-7 py-5">
        {!canAudit && currentUser ? (
          <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
            <p className="text-[13px] font-medium" style={{ color: T.text }}>Audit access is restricted</p>
            <p className="mt-1 text-[11px]" style={{ color: T.textFaint }}>
              Ask a compliance officer or partner to review this record.
            </p>
          </div>
        ) : (
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                  {["Timestamp", "User", "Action", "Entity", "Details", "IP Address"].map(h => (
                    <TableHead
                      key={h}
                      className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: T.textFaint }}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <PageLoader />
                    </TableCell>
                  </TableRow>
                ) : filtered?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-[12px]" style={{ color: T.textFaint }}>
                      No audit logs found.
                    </TableCell>
                  </TableRow>
                ) : filtered?.map(log => (
                  <TableRow
                    key={log.id}
                    style={{ borderBottom: `1px solid ${T.borderSub}` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surface }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                  >
                    <TableCell className="font-mono text-[10px] whitespace-nowrap" style={{ color: T.textDim }}>
                      {new Date(log.createdAt).toLocaleString("en-ZA")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3" style={{ color: T.textFaint }} />
                        <span className="text-[12px] font-medium" style={{ color: T.text }}>
                          {log.userName || "System"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span style={pillStyle(ACTION_COLOR(log.action))}>
                        {log.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-[12px] font-medium capitalize" style={{ color: T.text }}>{log.entityType}</p>
                      {log.entityTitle && (
                        <p className="text-[11px]" style={{ color: T.textFaint }}>{log.entityTitle}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] max-w-xs truncate" style={{ color: T.textDim }}>
                      {log.details || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-right" style={{ color: T.textFaint }}>
                      {log.ipAddress || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
