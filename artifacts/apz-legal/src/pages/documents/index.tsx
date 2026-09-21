import { useState } from "react"
import { Search, FileSignature, Bot, ChevronRight } from "lucide-react"
import { Link } from "wouter"
import { useListAllDocuments, getListAllDocumentsQueryKey } from "@workspace/api-client-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { T, cardStyle, pillStyle } from "@/lib/theme"

const TABS = [
  { key: "all",              label: "All Documents"     },
  { key: "draft",            label: "Drafts"            },
  { key: "ai_assist",        label: "AI Assist"         },
  { key: "review",           label: "In Review"         },
  { key: "partner_approval", label: "Partner Approval"  },
  { key: "client_signing",   label: "Client Signing"    },
  { key: "archived",         label: "Archived"          },
]

const APPROVAL_COLOR: Record<string, string> = {
  approved:           T.ok,
  rejected:           T.risk,
  changes_requested:  T.warn,
  pending:            T.blue,
}

export default function DocumentsPage() {
  const [search, setSearch]             = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter]     = useState("all")
  const [aiFilter, setAiFilter]         = useState("all")

  const { data: documents, isLoading } = useListAllDocuments({
    query: { queryKey: getListAllDocumentsQueryKey() }
  })

  const filteredDocs = (documents || []).filter(doc => {
    if (statusFilter !== "all" && doc.status !== statusFilter) return false
    if (typeFilter !== "all" && doc.documentType !== typeFilter) return false
    if (aiFilter !== "all") {
      if (aiFilter === "human" && (doc.contentOrigin === "ai_assisted" || doc.contentOrigin === "ai_generated")) return false
      if (aiFilter !== "human" && doc.contentOrigin !== aiFilter) return false
    }
    if (search) {
      const q = search.toLowerCase()
      const titleMatch = doc.title?.toLowerCase().includes(q)
      const refMatch = doc.matterReference?.toLowerCase().includes(q)
      if (!titleMatch && !refMatch) return false
    }
    return true
  })

  return (
    <div style={{ flex: 1, minHeight: 0, background: T.bg, display: "flex", flexDirection: "column" }}>

      {/* ── Page header ── */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "20px 24px 16px",
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
            Document Centre
          </h1>
          <span style={{ fontSize: 11, color: T.textFaint }}>Firm-wide document registry</span>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 24px",
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: T.textFaint, pointerEvents: "none" }} />
          <input
            type="search"
            placeholder="Search title or matter reference…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%",
              height: 32,
              paddingLeft: 28,
              paddingRight: 10,
              background: T.surfaceEl,
              border: `1px solid ${T.border}`,
              borderRadius: 7,
              color: T.text,
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>

        {/* Type filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Type</span>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger style={{ height: 32, width: 148, fontSize: 12, background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text, borderRadius: 7 }}>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="pleading">Pleading</SelectItem>
              <SelectItem value="opinion">Opinion</SelectItem>
              <SelectItem value="correspondence">Correspondence</SelectItem>
              <SelectItem value="affidavit">Affidavit</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Provenance filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Provenance</span>
          <Select value={aiFilter} onValueChange={setAiFilter}>
            <SelectTrigger style={{ height: 32, width: 148, fontSize: 12, background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text, borderRadius: 7 }}>
              <SelectValue placeholder="All Origins" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Origin</SelectItem>
              <SelectItem value="human">Human Authored</SelectItem>
              <SelectItem value="ai_assisted">AI Assisted</SelectItem>
              <SelectItem value="ai_generated">AI Generated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Status tabs ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        borderBottom: `1px solid ${T.border}`,
        overflowX: "auto",
        flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding: "9px 12px",
              fontSize: 11,
              fontWeight: 500,
              background: "none",
              border: "none",
              borderBottom: statusFilter === tab.key ? `2px solid ${T.blue}` : "2px solid transparent",
              color: statusFilter === tab.key ? T.text : T.textFaint,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Table card ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                {["Document Details", "Matter", "Status", "AI Provenance", "Action"].map(h => (
                  <TableHead
                    key={h}
                    style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: T.textFaint }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow style={{ borderBottom: `1px solid ${T.borderSub}` }}>
                  <TableCell colSpan={5} style={{ height: 128, textAlign: "center", fontSize: 12, color: T.textDim }}>
                    Loading registry…
                  </TableCell>
                </TableRow>
              ) : filteredDocs.length === 0 ? (
                <TableRow style={{ borderBottom: "none" }}>
                  <TableCell colSpan={5} style={{ height: 200, textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: T.surfaceEl,
                        border: `1px solid ${T.border}`,
                      }}>
                        <FileSignature size={18} style={{ color: T.textDim }} />
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: T.textDim, margin: 0 }}>No documents found</p>
                      <p style={{ fontSize: 11, color: T.textFaint, margin: 0 }}>Try adjusting your search or filters.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredDocs.map(doc => (
                  <TableRow
                    key={doc.id}
                    style={{ borderBottom: `1px solid ${T.borderSub}`, transition: "background 0.12s" }}
                  >
                    {/* Document details */}
                    <TableCell style={{ paddingTop: 12, paddingBottom: 12, verticalAlign: "top" }}>
                      <Link href={`/matters/${doc.matterId}/documents/${doc.id}`}>
                        <div style={{ fontWeight: 500, color: T.text, fontSize: 13, marginBottom: 4 }}>
                          {doc.title}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textDim }}>
                          <span style={{ textTransform: "capitalize" }}>{doc.documentType || "General"}</span>
                          <span>•</span>
                          <span>v{doc.version}</span>
                          <span>•</span>
                          <span>{formatDate(doc.updatedAt || doc.createdAt)}</span>
                        </div>
                      </Link>
                    </TableCell>

                    {/* Matter */}
                    <TableCell style={{ paddingTop: 12, paddingBottom: 12, verticalAlign: "top" }}>
                      <Link href={`/matters/${doc.matterId}`}>
                        <div style={{ fontFamily: "monospace", fontSize: 11, color: T.textDim, marginBottom: 3 }}>
                          {doc.matterReference || `MTR-${doc.matterId}`}
                        </div>
                        <div style={{ fontSize: 12, color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.matterTitle || "Unknown Matter"}
                        </div>
                      </Link>
                    </TableCell>

                    {/* Status */}
                    <TableCell style={{ paddingTop: 12, paddingBottom: 12, verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                        <span style={pillStyle(T.textDim)}>
                          {doc.status.replace("_", " ")}
                        </span>
                        {doc.approvalStatus && doc.approvalStatus !== "not_submitted" && (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                            <span style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: APPROVAL_COLOR[doc.approvalStatus] ?? T.textDim,
                              flexShrink: 0,
                            }} />
                            <span style={{ color: T.textDim, textTransform: "capitalize" }}>
                              {doc.approvalStatus.replace("_", " ")}
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* AI Provenance */}
                    <TableCell style={{ paddingTop: 12, paddingBottom: 12, verticalAlign: "top" }}>
                      {doc.contentOrigin === "ai_generated" ? (
                        <span style={pillStyle("#A78BFA")}>
                          <Bot size={9} /> AI Generated
                        </span>
                      ) : doc.contentOrigin === "ai_assisted" ? (
                        <span style={pillStyle(T.blue)}>
                          <Bot size={9} /> AI Assisted
                        </span>
                      ) : (
                        <span style={pillStyle(T.textDim)}>Human</span>
                      )}
                    </TableCell>

                    {/* Action */}
                    <TableCell style={{ paddingTop: 12, paddingBottom: 12, verticalAlign: "middle", textAlign: "right" }}>
                      <Link href={`/matters/${doc.matterId}/documents/${doc.id}`}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          color: T.textDim,
                          background: "transparent",
                          border: `1px solid ${T.border}`,
                          cursor: "pointer",
                        }}>
                          <ChevronRight size={14} />
                        </span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
