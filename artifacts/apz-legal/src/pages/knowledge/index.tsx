import { useState } from "react"
import { Search, Plus, BookOpen, Library, Filter } from "lucide-react"
import {
  useListKnowledgeItems,
  KnowledgeItemType,
  KnowledgeItemStatus,
  useGetKnowledgeItem,
  getGetKnowledgeItemQueryKey,
} from "@workspace/api-client-react"
import { PageLoader } from "@/components/ui/loader"
import { StatusBadge, TypeBadge, AiIndexBadge } from "@/components/knowledge/KnowledgeBadges"
import { KnowledgeDetail } from "@/components/knowledge/KnowledgeDetail"
import { KnowledgeForm } from "@/components/knowledge/KnowledgeForm"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { T, cardStyle } from "@/lib/theme"

const TYPE_TABS: Array<{ key: KnowledgeItemType | "all"; label: string }> = [
  { key: "all",       label: "All"       },
  { key: "template",  label: "Templates" },
  { key: "precedent", label: "Precedents"},
  { key: "opinion",   label: "Opinions"  },
  { key: "guidance",  label: "Guidance"  },
]

export default function KnowledgePage() {
  const [search, setSearch]             = useState("")
  const [typeFilter, setTypeFilter]     = useState<KnowledgeItemType | "all">("all")
  const [statusFilter, setStatusFilter] = useState<KnowledgeItemStatus | "all">("all")

  // UI State: "list" | "detail" | "create" | "edit"
  const [viewState, setViewState]         = useState<"list" | "detail" | "create" | "edit">("list")
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)

  const { data: items, isLoading } = useListKnowledgeItems({
    search: search || undefined,
    type:   typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  })

  const { data: selectedItem, isLoading: isLoadingDetail } = useGetKnowledgeItem(
    selectedItemId as number,
    { query: { enabled: !!selectedItemId, queryKey: getGetKnowledgeItemQueryKey(selectedItemId as number) } }
  )

  const handleCreateNew = () => {
    setSelectedItemId(null)
    setViewState("create")
  }

  const handleItemClick = (id: number) => {
    setSelectedItemId(id)
    setViewState("detail")
  }

  const handleEdit = () => {
    setViewState("edit")
  }

  const handleCancelForm = () => {
    if (viewState === "create") {
      setViewState("list")
    } else {
      setViewState("detail")
    }
  }

  const handleFormSuccess = (id: number) => {
    setSelectedItemId(id)
    setViewState("detail")
  }

  if (isLoading) return <PageLoader />

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: T.bg }}>
      {/* ── LEFT PANE: List ─────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col h-full transition-all duration-300",
          viewState === "list" ? "w-full" : "w-1/3 min-w-[400px] max-w-[500px]"
        )}
        style={{
          background: T.bg,
          borderRight: viewState !== "list" ? `1px solid ${T.border}` : undefined,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}
        >
          <div className="flex items-center gap-3">
            <Library className="h-4 w-4 shrink-0" style={{ color: T.blue }} />
            <div>
              <h1 className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text }}>
                Knowledge Base
              </h1>
              <p className="text-[10px]" style={{ color: T.textFaint }}>Firm Institutional Memory</p>
            </div>
          </div>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`, borderRadius: 8 }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Document
          </button>
        </div>

        {/* Filters */}
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
          <div className="p-4 pb-0 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5" style={{ color: T.textFaint }} />
              <input
                type="search"
                placeholder="Search knowledge…"
                className="w-full h-9 pl-9 pr-3 text-[12px] outline-none transition-colors"
                style={{
                  background: T.surfaceEl,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  color: T.text,
                }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger
                className="w-[140px] h-9 text-[12px]"
                style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8 }}
              >
                <Filter className="h-3.5 w-3.5 mr-2 shrink-0" style={{ color: T.textFaint }} />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="uploaded">Uploaded</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type tabs */}
          <div className="flex items-center gap-1 overflow-x-auto px-4 py-3">
            {TYPE_TABS.map((tab) => {
              const active = typeFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setTypeFilter(tab.key)}
                  className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold transition-all whitespace-nowrap"
                  style={{
                    borderRadius: 20,
                    background: active ? `linear-gradient(135deg, ${T.blue}, ${T.cyan})` : T.surfaceEl,
                    color: active ? "#fff" : T.textFaint,
                    border: `1px solid ${active ? "transparent" : T.border}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) { e.currentTarget.style.color = T.textDim; e.currentTarget.style.borderColor = T.blue }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) { e.currentTarget.style.color = T.textFaint; e.currentTarget.style.borderColor = T.border }
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {(!items || items.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 text-center h-full">
              <div
                className="h-11 w-11 flex items-center justify-center mb-4"
                style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10 }}
              >
                <BookOpen className="h-5 w-5" style={{ color: T.textFaint }} />
              </div>
              <p className="text-[13px] font-medium" style={{ color: T.text }}>No records found</p>
              <p className="mt-1 text-[11px] max-w-[200px]" style={{ color: T.textFaint }}>
                {search
                  ? "Adjust your search terms to find what you're looking for."
                  : "Upload the first piece of knowledge to the repository."}
              </p>
            </div>
          ) : (
            items.map((item) => {
              const isSelected = selectedItemId === item.id && viewState !== "list"
              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className="p-4 cursor-pointer transition-all"
                  style={{
                    ...cardStyle,
                    background: isSelected ? T.surfaceEl : T.surface,
                    borderColor: isSelected ? T.blue : T.border,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${T.blue} 60%, transparent)`
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = T.border
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-[12px] font-semibold leading-tight line-clamp-2 pr-2" style={{ color: T.text }}>
                      {item.title}
                    </h3>
                    <span
                      className="shrink-0 text-[10px] font-mono px-1.5 py-0.5"
                      style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 4, color: T.textFaint }}
                    >
                      v{item.version}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <TypeBadge type={item.type} />
                    {item.category && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 uppercase tracking-wider"
                        style={{ border: `1px solid ${T.border}`, borderRadius: 4, color: T.textFaint }}
                      >
                        {item.category}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
                    <StatusBadge status={item.status} className="!bg-transparent !px-0 !border-0" />
                    <AiIndexBadge status={item.aiIndexStatus} available={item.availableToAi} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── RIGHT PANE: Detail / Form ─────────────────────────── */}
      {viewState !== "list" && (
        <div className="flex-1 h-full overflow-hidden relative" style={{ background: T.bg }}>
          {viewState === "create" && (
            <div className="flex flex-col h-full" style={{ background: T.bg }}>
              <div
                className="px-6 py-4"
                style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}
              >
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text }}>
                  Add Knowledge
                </h2>
                <p className="text-[10px] mt-0.5" style={{ color: T.textFaint }}>
                  Upload a new document or precedent to the library.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <KnowledgeForm onSuccess={handleFormSuccess} onCancel={handleCancelForm} />
              </div>
            </div>
          )}

          {viewState === "edit" && selectedItem && (
            <div className="flex flex-col h-full" style={{ background: T.bg }}>
              <div
                className="px-6 py-4"
                style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}
              >
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text }}>
                  Edit Knowledge
                </h2>
                <p className="text-[10px] mt-0.5 font-mono" style={{ color: T.textFaint }}>
                  ID: {selectedItem.id} · v{selectedItem.version}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <KnowledgeForm item={selectedItem} onSuccess={handleFormSuccess} onCancel={handleCancelForm} />
              </div>
            </div>
          )}

          {viewState === "detail" && (
            <>
              {isLoadingDetail || !selectedItem ? (
                <div className="flex items-center justify-center h-full w-full">
                  <div
                    className="h-6 w-6 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: `${T.blue} transparent transparent transparent` }}
                  />
                </div>
              ) : (
                <KnowledgeDetail
                  item={selectedItem}
                  onEdit={handleEdit}
                  onClose={() => { setViewState("list"); setSelectedItemId(null) }}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
