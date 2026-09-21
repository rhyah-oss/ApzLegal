import { useMemo, useRef, useState } from "react"
import { Archive, CheckCircle2, Copy, Download, FileText, History, Plus, Search, ShieldCheck, UploadCloud, X } from "lucide-react"
import {
  getListTemplatesQueryKey,
  getGetKnowledgeItemQueryKey,
  getListKnowledgeItemVersionsQueryKey,
  useArchiveKnowledgeItem,
  useDecideKnowledgeItem,
  useGetCurrentUser,
  useGetKnowledgeItem,
  useInstantiateTemplate,
  useListKnowledgeItemVersions,
  useListMatters,
  useListTemplates,
  useSubmitKnowledgeForReview,
  useRequestStorageUploadUrl,
  type KnowledgeItem,
  type ListTemplatesParams,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { T, cardStyle, pillStyle } from "@/lib/theme"
import { useToast } from "@/hooks/use-toast"
import { resolveUploadContentType } from "@/lib/storageUpload"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""
const CATEGORIES = ["contracts", "litigation", "corporate", "property", "compliance", "correspondence"]
const MIME_TYPES = ".pdf,.doc,.docx,.odt,.rtf,.txt"
const REVIEWERS = ["partner", "managing_partner", "admin", "super_admin"]
const AUTHORS = ["associate_attorney", "candidate_attorney", ...REVIEWERS]

function errorMessage(error: unknown) {
  const typed = error as { response?: { data?: { error?: string } }; message?: string }
  return typed.response?.data?.error || typed.message || "The request could not be completed."
}

async function checksum(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export default function TemplatesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: user } = useGetCurrentUser()
  const [params, setParams] = useState<ListTemplatesParams>({ sort: "updated" })
  const [searchInput, setSearchInput] = useState("")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [reviewNote, setReviewNote] = useState("")
  const [reviewOpen, setReviewOpen] = useState<"approve" | "reject" | null>(null)
  const [matterId, setMatterId] = useState("")
  const [title, setTitle] = useState("")
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ title: "", category: "contracts", practiceArea: "", documentType: "contract", description: "" })

  const queryParams = useMemo(() => ({ ...params, search: searchInput.trim() || undefined }), [params, searchInput])
  const templatesQuery = useListTemplates(queryParams)
  const templates = templatesQuery.data?.items ?? []
  const selectedFromList = templates.find((item) => item.id === selectedId)
  const detailQuery = useGetKnowledgeItem(selectedId ?? 0, { query: { enabled: !!selectedId, queryKey: getGetKnowledgeItemQueryKey(selectedId ?? 0) } })
  const selected = detailQuery.data ?? selectedFromList
  const versionsQuery = useListKnowledgeItemVersions(selectedId ?? 0, { query: { enabled: !!selectedId, queryKey: getListKnowledgeItemVersionsQueryKey(selectedId ?? 0) } })
  const mattersQuery = useListMatters({})
  const submit = useSubmitKnowledgeForReview()
  const decide = useDecideKnowledgeItem()
  const archive = useArchiveKnowledgeItem()
  const instantiate = useInstantiateTemplate()
  const requestUploadUrl = useRequestStorageUploadUrl()
  const canReview = REVIEWERS.includes(user?.role ?? "")
  const canUpload = AUTHORS.includes(user?.role ?? "")
  const canSubmit = !!selected && (selected.status === "uploaded" || selected.status === "rejected") &&
    (selected.authorName === user?.name || canReview)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() })
    if (selectedId) {
      await queryClient.invalidateQueries({ queryKey: ["/api/knowledge", selectedId] })
      await queryClient.invalidateQueries({ queryKey: ["/api/knowledge", selectedId, "versions"] })
    }
  }

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !form.title.trim()) {
      toast({ title: "Missing details", description: "Choose a file and provide a title.", variant: "destructive" })
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Templates are limited to 25 MB.", variant: "destructive" })
      return
    }
    setUploading(true)
    try {
      const contentType = resolveUploadContentType(file, "text/plain")
      const upload = await requestUploadUrl.mutateAsync({ data: { name: file.name, size: file.size, contentType } })
      const signedContentType = upload.metadata.contentType
      const put = await fetch(upload.uploadURL, { method: "PUT", headers: { "Content-Type": signedContentType }, body: file })
      if (!put.ok) throw new Error("Storage upload failed.")
      const createResponse = await fetch(`${BASE}/api/knowledge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          type: "template",
          content: form.description.trim() || undefined,
          practiceArea: form.practiceArea.trim() || undefined,
          documentType: form.documentType,
          fileObjectPath: upload.objectPath,
          originalFilename: file.name,
          mimeType: signedContentType,
          fileSize: file.size,
          fileChecksum: await checksum(file),
        }),
      })
      if (!createResponse.ok) throw new Error(await createResponse.text())
      setUploadOpen(false)
      setForm({ title: "", category: "contracts", practiceArea: "", documentType: "contract", description: "" })
      if (fileRef.current) fileRef.current.value = ""
      await invalidate()
      toast({ title: "Template uploaded", description: "Submit it for partner review when ready." })
    } catch (error) {
      toast({ title: "Upload failed", description: errorMessage(error), variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  function runAction(action: { mutate: (data: any, options: any) => void }, data: any, message: string) {
    action.mutate(data, {
      onSuccess: async () => { await invalidate(); setReviewOpen(null); setReviewNote(""); toast({ title: message }) },
      onError: (error: unknown) => toast({ title: "Action failed", description: errorMessage(error), variant: "destructive" }),
    })
  }

  function openReview(decision: "approve" | "reject") {
    setReviewNote("")
    setReviewOpen(decision)
  }

  async function createMatterDocument() {
    if (!selected || !matterId) {
      toast({ title: "Choose a matter", description: "Select the matter that should receive this document.", variant: "destructive" })
      return
    }
    instantiate.mutate({ id: selected.id, data: { matterId: Number(matterId), title: title.trim() || undefined } }, {
      onSuccess: (document) => toast({ title: "Matter document created", description: `Draft v${document.version} is ready in the matter workspace.` }),
      onError: (error) => toast({ title: "Could not create document", description: errorMessage(error), variant: "destructive" }),
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: T.bg, color: T.text }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 md:px-6" style={{ borderColor: T.border, background: T.surface }}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: T.cyan }}>Governed library</p>
          <h1 className="mt-1 text-[18px] font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-[11px]" style={{ color: T.textDim }}>Approved firm language, versioned and ready for matters.</p>
        </div>
        {canUpload && <button onClick={() => setUploadOpen(true)} className="flex items-center gap-2 rounded px-3 py-2 text-[11px] font-semibold text-white" style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}><Plus size={14} /> Upload template</button>}
      </header>

      <div className="border-b px-5 py-3 md:px-6" style={{ borderColor: T.border, background: T.surface }}>
        <div className="flex flex-wrap gap-2">
          {[
            ["total", "All"], ["approved", "Approved"], ["pending_approval", "In review"], ["rejected", "Changes requested"], ["archived", "Archived"],
          ].map(([value, label]) => {
            const active = (params.status ?? "all") === value
            const count = value === "total" ? templatesQuery.data?.counts.total : templatesQuery.data?.counts[value as keyof typeof templatesQuery.data.counts]
            return <button key={value} onClick={() => setParams((current) => ({ ...current, status: value === "total" ? undefined : value as ListTemplatesParams["status"] }))} className="rounded-full px-3 py-1.5 text-[10px] font-semibold" style={{ ...pillStyle(active ? T.cyan : T.textDim), background: active ? `color-mix(in srgb, ${T.cyan} 12%, transparent)` : "transparent" }}>{label} <span className="ml-1 opacity-70">{count ?? 0}</span></button>
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5" size={14} style={{ color: T.textFaint }} />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search title, practice area, tags or content…" className="h-9 w-full rounded px-9 text-[11px] outline-none" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }} />
          </div>
          <select value={params.category ?? "all"} onChange={(event) => setParams((current) => ({ ...current, category: event.target.value === "all" ? undefined : event.target.value }))} className="h-9 rounded px-3 text-[11px]" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }}>
            <option value="all">All categories</option>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={params.sort ?? "updated"} onChange={(event) => setParams((current) => ({ ...current, sort: event.target.value as ListTemplatesParams["sort"] }))} className="h-9 rounded px-3 text-[11px]" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }}>
            <option value="updated">Recently updated</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="version">Highest version</option>
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className={`min-h-0 overflow-y-auto p-4 md:p-5 ${selected ? "md:w-[42%] md:border-r" : "w-full"}`} style={{ borderColor: T.border }}>
          {templatesQuery.isLoading ? <div className="flex h-48 items-center justify-center text-[11px]" style={{ color: T.textFaint }}>Loading governed templates…</div>
            : templatesQuery.isError ? <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-[11px]" style={{ color: T.risk }}><p>Templates could not be loaded.</p><button onClick={() => void templatesQuery.refetch()} className="underline">Try again</button></div>
              : templates.length === 0 ? <div className="flex h-48 flex-col items-center justify-center text-center"><FileText size={22} style={{ color: T.textFaint }} /><p className="mt-3 text-[12px]">No templates match this view.</p><p className="mt-1 text-[10px]" style={{ color: T.textFaint }}>Try another filter or upload a governed template.</p></div>
                : <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{templates.map((item) => <TemplateCard key={item.id} item={item} selected={item.id === selectedId} onClick={() => setSelectedId(item.id)} />)}</div>}
        </section>

        {selected && <aside className="min-h-0 flex-1 overflow-y-auto border-t p-5 md:border-t-0 md:p-6" style={{ borderColor: T.border, background: T.surface }}>
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex flex-wrap items-center gap-2"><Status status={selected.status} /><span className="font-mono text-[10px]" style={{ color: T.textFaint }}>v{selected.version}</span>{selected.availableToAi && <span className="flex items-center gap-1 text-[10px]" style={{ color: T.ok }}><ShieldCheck size={12} /> AI indexed</span>}</div><h2 className="mt-3 text-[18px] font-semibold">{selected.title}</h2><p className="mt-1 text-[11px]" style={{ color: T.textDim }}>{selected.content || "No description supplied."}</p></div>
            <button onClick={() => setSelectedId(null)} className="rounded p-1" style={{ color: T.textDim }}><X size={16} /></button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {canSubmit && <button onClick={() => runAction(submit, { id: selected.id }, "Submitted for partner review")} className="rounded px-3 py-2 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${T.warn} 14%, transparent)`, color: T.warn }}>Submit for review</button>}
            {canReview && selected.status === "pending_approval" && <><button onClick={() => openReview("reject")} className="rounded px-3 py-2 text-[10px]" style={{ color: T.risk, background: `color-mix(in srgb, ${T.risk} 12%, transparent)` }}>Request changes</button><button onClick={() => openReview("approve")} className="rounded px-3 py-2 text-[10px]" style={{ color: T.ok, background: `color-mix(in srgb, ${T.ok} 12%, transparent)` }}>Approve</button></>}
            {canReview && selected.status !== "archived" && <button onClick={() => window.confirm("Archive this template? It will no longer be available for AI retrieval.") && runAction(archive, { id: selected.id }, "Template archived")} className="rounded p-2" title="Archive" style={{ color: T.textDim }}><Archive size={14} /></button>}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Meta label="Category" value={selected.category} /><Meta label="Practice area" value={selected.practiceArea || "—"} /><Meta label="Document type" value={selected.documentType || "—"} /><Meta label="Uploaded by" value={selected.authorName || "—"} /><Meta label="File" value={selected.originalFilename || "Content only"} /><Meta label="Created" value={new Date(selected.createdAt).toLocaleDateString("en-ZA")} />
          </div>

          {selected.fileObjectPath && <div className="mt-5 flex flex-wrap gap-2"><a href={`${BASE}/api/storage${selected.fileObjectPath}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: T.border, color: T.cyan }}><Download size={13} /> Preview / download</a><button onClick={() => navigator.clipboard.writeText(selected.content || selected.title).then(() => toast({ title: "Copied to clipboard" })).catch(() => toast({ title: "Copy unavailable", variant: "destructive" }))} className="flex items-center gap-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: T.border, color: T.textDim }}><Copy size={13} /> Copy text</button></div>}

          {selected.status === "approved" && <div className="mt-6 rounded-lg border p-4" style={{ borderColor: T.border, background: T.surfaceEl }}><div className="flex items-center gap-2"><CheckCircle2 size={15} style={{ color: T.ok }} /><p className="text-[11px] font-semibold">Create a matter document</p></div><p className="mt-1 text-[10px]" style={{ color: T.textDim }}>Creates a draft with this exact approved template version as provenance.</p><div className="mt-3 flex flex-wrap gap-2"><select value={matterId} onChange={(event) => setMatterId(event.target.value)} className="h-9 min-w-[180px] flex-1 rounded px-2 text-[10px]" style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}` }}><option value="">Choose matter…</option>{(mattersQuery.data ?? []).map((matter) => <option key={matter.id} value={matter.id}>{matter.reference} · {matter.title}</option>)}</select><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional document title" className="h-9 min-w-[180px] flex-1 rounded px-2 text-[10px]" style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}` }} /><button disabled={instantiate.isPending} onClick={() => void createMatterDocument()} className="rounded px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50" style={{ background: T.blue }}>{instantiate.isPending ? "Creating…" : "Create draft"}</button></div></div>}

          <div className="mt-6"><div className="mb-3 flex items-center gap-2"><History size={14} style={{ color: T.cyan }} /><p className="text-[11px] font-semibold uppercase tracking-[0.1em]">Immutable history</p></div>{versionsQuery.isLoading ? <p className="text-[10px]" style={{ color: T.textFaint }}>Loading versions…</p> : versionsQuery.data?.length ? <div className="space-y-2">{versionsQuery.data.map((version) => <div key={version.id} className="rounded border p-3" style={{ borderColor: T.border, background: T.surfaceEl }}><div className="flex justify-between text-[10px]"><span className="font-semibold">v{version.version} · {version.editedByName || "System"}</span><span style={{ color: T.textFaint }}>{new Date(version.createdAt).toLocaleDateString("en-ZA")}</span></div><p className="mt-1 text-[10px]" style={{ color: T.textDim }}>{version.changeSummary || "Preserved version snapshot"}</p>{version.originalFilename && <p className="mt-1 text-[10px]" style={{ color: T.textFaint }}>{version.originalFilename}</p>}</div>)}</div> : <p className="text-[10px]" style={{ color: T.textFaint }}>No prior versions. The first snapshot is created when the template is uploaded.</p>}</div>
        </aside>}
      </div>

      {uploadOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-lg border p-5" style={{ ...cardStyle, background: T.surface }}><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.cyan }}>New governed record</p><h2 className="mt-1 text-[15px] font-semibold">Upload template</h2></div><button onClick={() => setUploadOpen(false)}><X size={16} /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><input ref={fileRef} type="file" accept={MIME_TYPES} className="sm:col-span-2 text-[11px]" /><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Template title *" className="h-9 rounded px-3 text-[11px] outline-none sm:col-span-2" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }} /><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="h-9 rounded px-3 text-[11px]" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select><input value={form.practiceArea} onChange={(event) => setForm({ ...form, practiceArea: event.target.value })} placeholder="Practice area" className="h-9 rounded px-3 text-[11px] outline-none" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }} /><select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })} className="h-9 rounded px-3 text-[11px]" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }}><option value="contract">Contract</option><option value="pleading">Pleading</option><option value="opinion">Opinion</option><option value="correspondence">Correspondence</option><option value="affidavit">Affidavit</option><option value="general">General</option></select><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Purpose or usage notes" rows={3} className="rounded p-3 text-[11px] outline-none sm:col-span-2" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }} /></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setUploadOpen(false)} className="rounded px-3 py-2 text-[11px]" style={{ color: T.textDim }}>Cancel</button><button disabled={uploading} onClick={() => void upload()} className="flex items-center gap-2 rounded px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}><UploadCloud size={14} />{uploading ? "Uploading…" : "Upload template"}</button></div></div></div>}

      {reviewOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-lg border p-5" style={{ ...cardStyle, background: T.surface }}><div className="flex items-center justify-between"><h2 className="text-[14px] font-semibold">{reviewOpen === "approve" ? "Approve template" : "Request changes"}</h2><button onClick={() => setReviewOpen(null)}><X size={16} /></button></div><p className="mt-2 text-[11px]" style={{ color: T.textDim }}>{selected.title}</p><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={reviewOpen === "reject" ? "Reason is required…" : "Optional review note"} rows={4} className="mt-4 w-full rounded p-3 text-[11px] outline-none" style={{ ...cardStyle, background: T.surfaceEl, color: T.text }} /><div className="mt-4 flex justify-end gap-2"><button onClick={() => setReviewOpen(null)} className="rounded px-3 py-2 text-[11px]" style={{ color: T.textDim }}>Cancel</button><button disabled={decide.isPending || (reviewOpen === "reject" && !reviewNote.trim())} onClick={() => runAction(decide, { id: selected.id, data: { decision: reviewOpen === "approve" ? "approve" : "reject", note: reviewNote.trim() || undefined } }, reviewOpen === "approve" ? "Template approved" : "Changes requested")} className="rounded px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50" style={{ background: reviewOpen === "approve" ? T.ok : T.risk }}>{decide.isPending ? "Saving…" : "Confirm"}</button></div></div></div>}
    </div>
  )
}

function TemplateCard({ item, selected, onClick }: { item: KnowledgeItem; selected: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="w-full rounded-lg border p-4 text-left transition-colors" style={{ borderColor: selected ? T.cyan : T.border, background: selected ? T.surfaceEl : T.surface }}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><FileText size={15} style={{ color: T.cyan }} /><span className="truncate text-[12px] font-semibold">{item.title}</span></div><span className="shrink-0 font-mono text-[10px]" style={{ color: T.textFaint }}>v{item.version}</span></div><div className="mt-3 flex flex-wrap items-center gap-2"><Status status={item.status} /><span className="text-[10px]" style={{ color: T.textFaint }}>{item.category}</span>{item.practiceArea && <span className="text-[10px]" style={{ color: T.textFaint }}>· {item.practiceArea}</span>}</div><p className="mt-3 line-clamp-2 text-[10px]" style={{ color: T.textDim }}>{item.content || "No description supplied."}</p><div className="mt-3 flex items-center justify-between border-t pt-3 text-[10px]" style={{ borderColor: T.borderSub, color: T.textFaint }}><span>{item.originalFilename || "Content record"}</span>{item.availableToAi && <span className="flex items-center gap-1" style={{ color: T.ok }}><ShieldCheck size={11} /> AI ready</span>}</div></button>
}

function Status({ status }: { status: string }) {
  const color = status === "approved" ? T.ok : status === "pending_approval" ? T.warn : status === "rejected" ? T.risk : T.textDim
  return <span style={pillStyle(color)}>{status.replaceAll("_", " ")}</span>
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="rounded border p-3" style={{ borderColor: T.border, background: T.surfaceEl }}><p className="text-[9px] uppercase tracking-[0.1em]" style={{ color: T.textFaint }}>{label}</p><p className="mt-1 truncate text-[11px] font-medium">{value}</p></div>
}