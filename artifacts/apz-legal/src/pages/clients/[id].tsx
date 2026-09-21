import { useState } from "react"
import { useRoute, Link } from "wouter"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import {
  ArrowLeft, Building2, User, Landmark, ShieldCheck, ShieldAlert,
  ShieldX, AlertTriangle, Plus, Trash2, ExternalLink, FileText,
  Phone, Mail, MapPin, Hash, Briefcase, Clock,
  Activity, Users, ChevronRight, CheckCircle2, XCircle,
  RefreshCw, Edit2, Save, X,
} from "lucide-react"
import { useGetClient, useListMatters } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { PageLoader } from "@/components/ui/loader"
import { T, cardStyle, pillStyle } from "@/lib/theme"
import { resolveUploadContentType } from "@/lib/storageUpload"

// ── Helpers ───────────────────────────────────────────────────────────────────
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

async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("")
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n)
}

// ── Compliance status config ──────────────────────────────────────────────────
const COMPLIANCE_META = {
  compliant:       { color: T.ok,   icon: ShieldCheck,  label: "Compliant",       bg: `color-mix(in srgb, ${T.ok} 12%, transparent)` },
  review_required: { color: T.warn, icon: ShieldAlert,  label: "Review Required", bg: `color-mix(in srgb, ${T.warn} 12%, transparent)` },
  blocked:         { color: T.risk, icon: ShieldX,      label: "Blocked",         bg: `color-mix(in srgb, ${T.risk} 12%, transparent)` },
} as const

const RISK_META = {
  low:    { color: T.ok,   label: "Low",    bar: 25 },
  medium: { color: T.warn, label: "Medium", bar: 60 },
  high:   { color: T.risk, label: "High",   bar: 90 },
} as const

const CLIENT_TYPE_ICON: Record<string, typeof User> = {
  individual: User,
  corporate:  Building2,
  trust:      Landmark,
  government: Landmark,
}

const PARTY_ROLES = [
  { value: "director",         label: "Director" },
  { value: "beneficial_owner", label: "Beneficial Owner" },
  { value: "beneficiary",      label: "Beneficiary" },
  { value: "trustee",          label: "Trustee" },
  { value: "shareholder",      label: "Shareholder" },
  { value: "opposing_party",   label: "Opposing Party" },
  { value: "other",            label: "Other" },
]
const PARTY_ROLE_COLOR: Record<string, string> = {
  director:         T.blue,
  beneficial_owner: T.cyan,
  beneficiary:      T.ok,
  trustee:          "#8B5CF6",
  shareholder:      T.warn,
  opposing_party:   T.risk,
  other:            T.textDim,
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: T.surfaceEl, borderRadius: 6, padding: "5px 10px", marginBottom: 10 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textDim }}>
        {children}
      </span>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.borderSub}` }}>
      <Icon size={12} style={{ color: T.textFaint, marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: T.textFaint, width: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: T.text }}>{value}</span>
    </div>
  )
}

// ── Compliance Banner ─────────────────────────────────────────────────────────
function ComplianceBanner({ status, blockReason }: { status: string; blockReason?: string | null }) {
  const meta = COMPLIANCE_META[status as keyof typeof COMPLIANCE_META] ?? COMPLIANCE_META.review_required
  const Icon = meta.icon
  if (status === "compliant") return null
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 20px",
      background: `${meta.color}10`, borderBottom: `1px solid ${meta.color}40`,
    }}>
      <Icon size={14} style={{ color: meta.color, flexShrink: 0, marginTop: 1 }} />
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: meta.color, margin: 0 }}>
          COMPLIANCE STATUS: {meta.label.toUpperCase()}
        </p>
        {blockReason && <p style={{ fontSize: 11, color: meta.color, opacity: 0.8, margin: "2px 0 0" }}>Reason: {blockReason}</p>}
        {status === "blocked" && (
          <p style={{ fontSize: 11, color: meta.color, opacity: 0.7, margin: "2px 0 0" }}>
            Matter creation is blocked until compliance is resolved.
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const [, params] = useRoute("/clients/:id")
  const id = parseInt(params?.id ?? "0", 10)
  const qc = useQueryClient()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<
    "overview" | "compliance" | "related" | "matters" | "documents" | "activity"
  >("overview")
  const [partySheetOpen, setPartySheetOpen]   = useState(false)
  const [editingParty, setEditingParty]       = useState<any>(null)
  const [editMode, setEditMode]               = useState(false)
  const [docFormOpen, setDocFormOpen]         = useState(false)
  const [docFormType, setDocFormType]         = useState("")
  const [rejectingDoc, setRejectingDoc]       = useState<any>(null)
  const [rejectReason, setRejectReason]       = useState("")

  // ── Core queries ──
  const { data: client, isLoading: cL } = useGetClient(id)
  const { data: allMatters }             = useListMatters({})

  // ── Tab-specific queries ──
  const { data: ficaReqs, isLoading: frL } = useQuery<any>({
    queryKey: ["clients", id, "fica-requirements"],
    queryFn:  () => apiFetch(`/clients/${id}/fica/requirements`),
    enabled:  activeTab === "compliance",
  })
  const { data: ficaTimeline } = useQuery<any[]>({
    queryKey: ["clients", id, "fica-timeline"],
    queryFn:  () => apiFetch(`/clients/${id}/fica/timeline`),
    enabled:  activeTab === "compliance",
  })
  const { data: relatedParties, isLoading: rpL } = useQuery<any[]>({
    queryKey: ["clients", id, "related-parties"],
    queryFn:  () => apiFetch(`/clients/${id}/related-parties`),
    enabled:  activeTab === "related",
  })
  const { data: documents } = useQuery<any[]>({
    queryKey: ["clients", id, "documents"],
    queryFn:  () => apiFetch(`/clients/${id}/documents`),
    enabled:  activeTab === "documents",
  })
  const { data: activity } = useQuery<any[]>({
    queryKey: ["clients", id, "activity"],
    queryFn:  () => apiFetch(`/clients/${id}/activity`),
    enabled:  activeTab === "activity",
  })

  const clientMatters = (allMatters ?? []).filter(m => m.clientId === id)

  // ── Edit client mutation ──
  const updateClient = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiFetch(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", id] })
      qc.invalidateQueries({ queryKey: ["clients"] })
      setEditMode(false)
      toast({ title: "Client updated" })
    },
    onError: () => toast({ title: "Error", description: "Could not update client.", variant: "destructive" }),
  })

  const updateCompliance = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiFetch(`/clients/${id}/compliance`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", id] })
      qc.invalidateQueries({ queryKey: ["clients", id, "fica-requirements"] })
      toast({ title: "Compliance updated" })
    },
  })

  const recomputeComp = useMutation({
    mutationFn: () => apiFetch(`/clients/${id}/fica/recompute`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", id] })
      qc.invalidateQueries({ queryKey: ["clients", id, "fica-requirements"] })
      qc.invalidateQueries({ queryKey: ["clients", id, "fica-timeline"] })
    },
  })

  const registerDoc = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiFetch(`/clients/${id}/fica/documents`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", id] })
      qc.invalidateQueries({ queryKey: ["clients", id, "fica-requirements"] })
      qc.invalidateQueries({ queryKey: ["clients", id, "fica-timeline"] })
      setDocFormOpen(false)
      docRegForm.reset()
      toast({ title: "Document registered" })
    },
    onError: () => toast({ title: "Error", description: "Could not register document.", variant: "destructive" }),
  })

  const updateDocStatus = useMutation({
    mutationFn: ({ docId, ...data }: { docId: number; [k: string]: any }) =>
      apiFetch(`/clients/${id}/fica/documents/${docId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", id] })
      qc.invalidateQueries({ queryKey: ["clients", id, "fica-requirements"] })
      qc.invalidateQueries({ queryKey: ["clients", id, "fica-timeline"] })
      setRejectingDoc(null)
      setRejectReason("")
      toast({ title: "Document updated" })
    },
    onError: () => toast({ title: "Error", description: "Could not update document.", variant: "destructive" }),
  })

  const docRegForm = useForm<Record<string, any>>({ defaultValues: {} })

  // ── Related party mutations ──
  const createParty = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiFetch(`/clients/${id}/related-parties`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", id, "related-parties"] })
      setPartySheetOpen(false)
      partyForm.reset()
      toast({ title: "Related party added" })
    },
  })

  const updateParty = useMutation({
    mutationFn: ({ partyId, data }: { partyId: number; data: Record<string, any> }) =>
      apiFetch(`/clients/${id}/related-parties/${partyId}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", id, "related-parties"] })
      setPartySheetOpen(false)
      setEditingParty(null)
      partyForm.reset()
      toast({ title: "Party updated" })
    },
  })

  const deleteParty = useMutation({
    mutationFn: (partyId: number) =>
      apiFetch(`/clients/${id}/related-parties/${partyId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", id, "related-parties"] })
      toast({ title: "Party removed" })
    },
  })

  const partyForm = useForm<Record<string, any>>({ defaultValues: { role: "director" } })
  const editForm  = useForm<Record<string, any>>()

  if (cL) return <div style={{ flex: 1, background: T.bg }}><PageLoader /></div>
  if (!client) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <p style={{ color: T.textFaint }}>Client not found.</p>
    </div>
  )

  const TypeIcon         = CLIENT_TYPE_ICON[(client as any).type] ?? User
  const complianceStatus = (client as any).complianceStatus ?? "review_required"
  const riskLevel        = (client as any).riskLevel ?? "low"
  const compMeta         = COMPLIANCE_META[complianceStatus as keyof typeof COMPLIANCE_META] ?? COMPLIANCE_META.review_required
  const riskMeta         = RISK_META[riskLevel as keyof typeof RISK_META] ?? RISK_META.low
  const CompIcon         = compMeta.icon
  const canCreateMatter  = complianceStatus !== "blocked"

  const TABS = [
    { key: "overview",   label: "Overview"         },
    { key: "compliance", label: "Compliance"       },
    { key: "related",    label: "Related Parties"  },
    { key: "matters",    label: `Matters (${clientMatters.length})` },
    { key: "documents",  label: "Documents"        },
    { key: "activity",   label: "Activity / Audit" },
  ]

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>
        <Link href="/clients">
          <button style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textFaint, background: "transparent", cursor: "pointer", padding: "4px 0" }}>
            <ArrowLeft size={12} /> Clients
          </button>
        </Link>
        <span style={{ color: T.textFaint }}>·</span>

        <TypeIcon size={14} style={{ color: T.textDim }} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>{client.name}</h1>
          <span style={{ fontSize: 10, color: T.textFaint, textTransform: "capitalize" }}>
            {(client as any).type} Client
          </span>
        </div>

        {/* Compliance pill */}
        <span style={{ ...pillStyle(compMeta.color), display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 20 }}>
          <CompIcon size={10} />
          {compMeta.label}
        </span>

        {/* Risk pill */}
        <span style={pillStyle(riskMeta.color)}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: riskMeta.color }} />
          {riskMeta.label} Risk
        </span>

        {/* Matter creation gate */}
        <Link href="/matters">
          <Button
            variant="brand" size="sm"
            disabled={!canCreateMatter}
            style={{
              fontSize: 11, height: 30,
              background: canCreateMatter ? `linear-gradient(135deg, ${T.blue}, ${T.cyan})` : undefined,
              opacity: canCreateMatter ? 1 : 0.4,
              cursor: canCreateMatter ? "pointer" : "not-allowed",
            }}
            title={!canCreateMatter ? `Matter creation blocked: ${(client as any).complianceBlockReason ?? "Compliance incomplete"}` : undefined}
          >
            <Plus size={11} className="mr-1" /> New Matter
          </Button>
        </Link>
      </div>

      {/* ── Compliance banner (if not compliant) ── */}
      <ComplianceBanner status={complianceStatus} blockReason={(client as any).complianceBlockReason} />

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflowX: "auto", background: T.surface }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: "10px 16px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
              color: activeTab === tab.key ? T.text : T.textFaint,
              borderBottom: activeTab === tab.key ? `2px solid ${T.cyan}` : "2px solid transparent",
              background: "transparent", cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ════════════ OVERVIEW ════════════ */}
        {activeTab === "overview" && (
          <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

            {/* Identity */}
            <div style={{ ...cardStyle, padding: 18 }}>
              <SectionHeader>Identity</SectionHeader>
              <InfoRow icon={User}      label="Full Name"    value={client.name} />
              <InfoRow icon={Hash}      label="ID Number"    value={(client as any).idNumber} />
              <InfoRow icon={Hash}      label="Passport"     value={(client as any).passportNumber} />
              <InfoRow icon={Hash}      label="Company Reg." value={client.companyRegistration} />
              <InfoRow icon={Hash}      label="VAT Number"   value={(client as any).vatNumber} />
              <InfoRow icon={Hash}      label="Trust No."    value={(client as any).trustNumber} />
              {!editMode && (
                <button onClick={() => { setEditMode(true); editForm.reset(client as any) }}
                  style={{ marginTop: 10, fontSize: 10, color: T.cyan, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <Edit2 size={10} /> Edit Identity
                </button>
              )}
              {editMode && (
                <form onSubmit={editForm.handleSubmit(data => updateClient.mutate(data))} className="space-y-2 mt-3">
                  {[
                    { name: "idNumber", label: "ID Number" }, { name: "passportNumber", label: "Passport" },
                    { name: "companyRegistration", label: "Company Reg" }, { name: "vatNumber", label: "VAT Number" },
                    { name: "trustNumber", label: "Trust No." },
                  ].map(f => (
                    <div key={f.name}>
                      <label style={{ fontSize: 10, color: T.textDim, display: "block", marginBottom: 2 }}>{f.label}</label>
                      <Input {...editForm.register(f.name)} className="h-7 text-[11px]" />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <Button type="submit" size="sm" disabled={updateClient.isPending} style={{ fontSize: 10, height: 26, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                      <Save size={10} className="mr-1" /> Save
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditMode(false)} style={{ fontSize: 10, height: 26 }}>
                      <X size={10} className="mr-1" /> Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Contact */}
            <div style={{ ...cardStyle, padding: 18 }}>
              <SectionHeader>Contact</SectionHeader>
              <InfoRow icon={Mail}   label="Email"    value={client.email} />
              <InfoRow icon={Phone}  label="Phone"    value={client.phone} />
              <InfoRow icon={MapPin} label="Address"  value={client.address} />
              <InfoRow icon={MapPin} label="City"     value={(client as any).city} />
              <InfoRow icon={MapPin} label="Province" value={(client as any).province} />
              <InfoRow icon={MapPin} label="Country"  value={(client as any).country} />
            </div>

            {/* Snapshot */}
            <div style={{ ...cardStyle, padding: 18 }}>
              <SectionHeader>Snapshot</SectionHeader>
              {[
                { label: "Active Matters",  value: clientMatters.filter(m => m.status !== "closed").length, href: "matters" },
                { label: "Closed Matters",  value: clientMatters.filter(m => m.status === "closed").length,  href: "matters" },
                { label: "Documents",       value: "—",   href: "documents" },
                { label: "Risk Score",      value: `${(client as any).riskScore ?? 0} / 100`, href: "compliance" },
              ].map(row => (
                <div key={row.label}
                  onClick={() => setActiveTab(row.href as any)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.borderSub}`, cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                  <span style={{ fontSize: 11, color: T.textDim }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Matter eligibility */}
            <div style={{ ...cardStyle, padding: 18 }}>
              <SectionHeader>Matter Eligibility</SectionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: `${compMeta.color}10`, border: `1px solid ${compMeta.color}40`, borderRadius: 8, marginBottom: 12 }}>
                <CompIcon size={18} style={{ color: compMeta.color, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: compMeta.color, margin: 0 }}>
                    {canCreateMatter ? "Eligible for Matter Creation" : "Matter Creation Blocked"}
                  </p>
                  {(client as any).complianceBlockReason && (
                    <p style={{ fontSize: 10, color: compMeta.color, opacity: 0.8, margin: "2px 0 0" }}>
                      {(client as any).complianceBlockReason}
                    </p>
                  )}
                </div>
              </div>
              {!canCreateMatter && (
                <button onClick={() => setActiveTab("compliance")}
                  style={{ fontSize: 11, color: T.cyan, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
                  Resolve compliance → <ChevronRight size={11} />
                </button>
              )}
              {canCreateMatter && (
                <Link href="/matters">
                  <Button variant="brand" size="sm" style={{ fontSize: 11, height: 30, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                    <Plus size={11} className="mr-1" /> Create Matter
                  </Button>
                </Link>
              )}
              {client.notes && (
                <div style={{ marginTop: 12, padding: 10, background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 6 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint, marginBottom: 4 }}>NOTES</p>
                  <p style={{ fontSize: 11, color: T.textDim }}>{client.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════ COMPLIANCE ════════════ */}
        {activeTab === "compliance" && (
          <div style={{ padding: 20, maxWidth: 820 }}>

            {/* Status + risk header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>

              {/* Compliance status card */}
              <div style={{ ...cardStyle, padding: 18, background: `${compMeta.color}0D`, border: `1px solid ${compMeta.color}40` }}>
                <SectionHeader>Compliance Status</SectionHeader>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <CompIcon size={24} style={{ color: compMeta.color }} />
                  <span style={{ fontSize: 20, fontWeight: 700, color: compMeta.color }}>{compMeta.label}</span>
                </div>
                {(client as any).complianceBlockReason && (
                  <p style={{ fontSize: 11, color: compMeta.color, opacity: 0.8, margin: "0 0 10px" }}>
                    {(client as any).complianceBlockReason}
                  </p>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["compliant", "review_required", "blocked"] as const).map(s => {
                    const m = COMPLIANCE_META[s]
                    return (
                      <button key={s}
                        onClick={() => updateCompliance.mutate({ complianceStatus: s })}
                        disabled={complianceStatus === s}
                        style={{
                          fontSize: 9, padding: "3px 10px", fontWeight: 700, textTransform: "uppercase",
                          color: m.color, border: `1px solid ${m.color}50`, borderRadius: 20,
                          background: complianceStatus === s ? `${m.color}20` : "transparent",
                          cursor: complianceStatus === s ? "default" : "pointer",
                          opacity: complianceStatus === s ? 1 : 0.7,
                        }}>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Risk card */}
              <div style={{ ...cardStyle, padding: 18 }}>
                <SectionHeader>Client Risk Score</SectionHeader>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, color: riskMeta.color }}>{(client as any).riskScore ?? 0}</span>
                  <span style={{ fontSize: 11, color: T.textFaint }}>/100</span>
                  <span style={pillStyle(riskMeta.color)}>{riskMeta.label}</span>
                </div>
                <div style={{ height: 4, background: T.border, borderRadius: 2, marginBottom: 12 }}>
                  <div style={{ height: "100%", width: `${(client as any).riskScore ?? 0}%`, background: riskMeta.color, borderRadius: 2, transition: "width 0.4s ease" }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["low", "medium", "high"] as const).map(l => {
                    const m = RISK_META[l]
                    return (
                      <button key={l}
                        onClick={() => updateCompliance.mutate({ riskLevel: l, riskScore: m.bar })}
                        disabled={riskLevel === l}
                        style={{
                          fontSize: 9, padding: "3px 10px", fontWeight: 700, textTransform: "uppercase",
                          color: m.color, border: `1px solid ${m.color}50`, borderRadius: 20,
                          background: riskLevel === l ? `${m.color}20` : "transparent",
                          cursor: riskLevel === l ? "default" : "pointer",
                        }}>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Block reason editor */}
            {complianceStatus === "blocked" && (
              <BlockReasonEditor
                current={(client as any).complianceBlockReason ?? ""}
                onSave={reason => updateCompliance.mutate({ complianceStatus: "blocked", complianceBlockReason: reason })}
              />
            )}

            {/* FICA Requirements Table */}
            <div style={{ ...cardStyle, padding: 18, marginTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <SectionHeader>FICA Requirements</SectionHeader>
                <button onClick={() => recomputeComp.mutate()}
                  style={{ fontSize: 10, padding: "4px 10px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, color: T.textDim, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <RefreshCw size={9} /> Recompute
                </button>
              </div>

              {frL ? <PageLoader /> : (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1.2fr", background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                    {["Requirement", "Status", "Expiry", "Verified", "Verified By", "Action"].map(h => (
                      <div key={h} style={{ padding: "6px 10px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint }}>{h}</div>
                    ))}
                  </div>
                  {(ficaReqs?.requirements ?? []).map((req: any, i: number) => {
                    const DOC_STATUS_COLOR: Record<string, string> = {
                      missing:              T.risk,
                      uploaded:             T.warn,
                      pending_verification: T.warn,
                      verified:             T.ok,
                      rejected:             T.risk,
                      expired:              "#F97316",
                    }
                    const DOC_STATUS_LABEL: Record<string, string> = {
                      missing:              "Missing",
                      uploaded:             "Uploaded",
                      pending_verification: "Pending Verify",
                      verified:             "Verified",
                      rejected:             "Rejected",
                      expired:              "Expired",
                    }
                    const color       = DOC_STATUS_COLOR[req.status] ?? T.textFaint
                    const label       = DOC_STATUS_LABEL[req.status] ?? req.status
                    const isLast      = i === (ficaReqs?.requirements ?? []).length - 1
                    const isExpired   = req.expiryDate && new Date(req.expiryDate) < new Date()

                    return (
                      <div key={req.type} style={{
                        display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1.2fr",
                        borderBottom: isLast ? "none" : `1px solid ${T.borderSub}`,
                        borderLeft: `2px solid ${color}`,
                        background: req.status === "missing" || req.status === "rejected" ? `${color}06` : "transparent",
                        alignItems: "center",
                      }}>
                        <div style={{ padding: "8px 10px" }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: T.text, margin: 0 }}>{req.label}</p>
                          {req.critical && <p style={{ fontSize: 9, color: T.risk, margin: "1px 0 0", letterSpacing: "0.06em" }}>CRITICAL</p>}
                          {req.rejectedReason && <p style={{ fontSize: 9, color: T.risk, margin: "2px 0 0" }}>↳ {req.rejectedReason}</p>}
                        </div>
                        <div style={{ padding: "8px 10px" }}>
                          <span style={pillStyle(color)}>{label}</span>
                        </div>
                        <div style={{ padding: "8px 10px", fontSize: 10, color: isExpired ? T.risk : T.textFaint }}>
                          {req.expiryDate ? new Date(req.expiryDate).toLocaleDateString("en-ZA") : "—"}
                        </div>
                        <div style={{ padding: "8px 10px", fontSize: 10, color: T.textFaint }}>
                          {req.verifiedAt ? new Date(req.verifiedAt).toLocaleDateString("en-ZA") : "—"}
                        </div>
                        <div style={{ padding: "8px 10px", fontSize: 10, color: T.textFaint }}>
                          {req.verifiedByName ?? "—"}
                        </div>
                        <div style={{ padding: "8px 10px", display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(req.status === "missing" || req.status === "rejected" || req.status === "expired") && (
                            <button
                              onClick={() => { setDocFormType(req.type); setDocFormOpen(true) }}
                              style={{ fontSize: 9, padding: "2px 8px", background: `color-mix(in srgb, ${T.cyan} 15%, transparent)`, color: T.cyan, border: `1px solid color-mix(in srgb, ${T.cyan} 40%, transparent)`, borderRadius: 20, cursor: "pointer", fontWeight: 700 }}>
                              + Upload
                            </button>
                          )}
                          {req.status === "uploaded" && (
                            <button
                              onClick={() => updateDocStatus.mutate({ docId: req.ficaDocumentId, status: "pending_verification" })}
                              style={{ fontSize: 9, padding: "2px 8px", background: `color-mix(in srgb, ${T.warn} 15%, transparent)`, color: T.warn, border: `1px solid color-mix(in srgb, ${T.warn} 40%, transparent)`, borderRadius: 20, cursor: "pointer" }}>
                              Submit
                            </button>
                          )}
                          {(req.status === "uploaded" || req.status === "pending_verification") && (
                            <>
                              <button
                                onClick={() => updateDocStatus.mutate({ docId: req.ficaDocumentId, status: "verified" })}
                                style={{ fontSize: 9, padding: "2px 8px", background: `color-mix(in srgb, ${T.ok} 15%, transparent)`, color: T.ok, border: `1px solid color-mix(in srgb, ${T.ok} 40%, transparent)`, borderRadius: 20, cursor: "pointer" }}>
                                Verify
                              </button>
                              <button
                                onClick={() => { setRejectingDoc(req); setRejectReason("") }}
                                style={{ fontSize: 9, padding: "2px 8px", background: `color-mix(in srgb, ${T.risk} 10%, transparent)`, color: T.risk, border: `1px solid color-mix(in srgb, ${T.risk} 40%, transparent)`, borderRadius: 20, cursor: "pointer" }}>
                                Reject
                              </button>
                            </>
                          )}
                          {req.status === "verified" && (
                            <button
                              onClick={() => updateDocStatus.mutate({ docId: req.ficaDocumentId, status: "expired" })}
                              style={{ fontSize: 9, padding: "2px 8px", background: "transparent", color: T.textFaint, border: `1px solid ${T.border}`, borderRadius: 20, cursor: "pointer" }}>
                              Expire
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Reject modal */}
              {rejectingDoc && (
                <div style={{ marginTop: 12, padding: 14, border: `1px solid color-mix(in srgb, ${T.risk} 40%, transparent)`, background: `color-mix(in srgb, ${T.risk} 8%, transparent)`, borderRadius: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: T.risk, marginBottom: 8 }}>
                    Reject {rejectingDoc.label}
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection…"
                      style={{ flex: 1, background: T.surface, border: `1px solid color-mix(in srgb, ${T.risk} 60%, transparent)`, borderRadius: 6, color: T.text, padding: "6px 10px", fontSize: 11 }}
                    />
                    <button
                      onClick={() => updateDocStatus.mutate({ docId: rejectingDoc.ficaDocumentId, status: "rejected", rejectedReason: rejectReason })}
                      disabled={!rejectReason.trim()}
                      style={{ fontSize: 10, padding: "6px 14px", background: T.risk, color: "#fff", border: "none", borderRadius: 6, cursor: rejectReason.trim() ? "pointer" : "not-allowed", opacity: rejectReason.trim() ? 1 : 0.5 }}>
                      Confirm
                    </button>
                    <button onClick={() => setRejectingDoc(null)}
                      style={{ fontSize: 10, padding: "6px 10px", background: "transparent", color: T.textFaint, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Compliance Timeline */}
            <div style={{ ...cardStyle, padding: 18, marginTop: 16 }}>
              <SectionHeader>Compliance Timeline</SectionHeader>
              {(ficaTimeline ?? []).length === 0 ? (
                <p style={{ fontSize: 11, color: T.textFaint }}>No compliance events recorded yet.</p>
              ) : (
                <div style={{ position: "relative", paddingLeft: 18 }}>
                  <div style={{ position: "absolute", left: 5, top: 6, bottom: 0, width: 1, background: T.border }} />
                  {(ficaTimeline ?? []).map((ev: any) => {
                    const evColor = ev.eventType === "document_verified"          ? T.ok
                                  : ev.eventType === "document_rejected"          ? T.risk
                                  : ev.eventType === "document_expired"           ? "#F97316"
                                  : ev.eventType === "compliance_status_changed"  ? T.blue
                                  : ev.eventType === "manual_override"            ? T.warn
                                  : T.textDim
                    return (
                      <div key={ev.id} style={{ marginBottom: 10, position: "relative" }}>
                        <span style={{ position: "absolute", left: -14, top: 3, width: 7, height: 7, borderRadius: "50%", background: evColor, border: `2px solid ${T.bg}` }} />
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{ev.description}</span>
                          {ev.userName && <span style={{ fontSize: 9, color: T.textFaint }}>by {ev.userName}</span>}
                        </div>
                        <span style={{ fontSize: 9, color: T.textFaint }}>
                          {new Date(ev.createdAt).toLocaleString("en-ZA")}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Register Document Modal */}
        {docFormOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ ...cardStyle, padding: 24, width: 400, maxWidth: "90vw" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>Register Document</p>
                <button onClick={() => setDocFormOpen(false)} style={{ background: "transparent", color: T.textFaint, cursor: "pointer", padding: 0 }}>
                  <X size={14} />
                </button>
              </div>
              <form onSubmit={docRegForm.handleSubmit(async data => {
                try {
                   const file = data.file as File | undefined
                   if (!file || file.size === 0) throw new Error("Choose a FICA document before registering it.")
                   const contentType = resolveUploadContentType(file, "application/pdf")
                   const uploadResponse = await fetch(`${BASE}/api/storage/uploads/request-url`, {
                     method: "POST",
                     credentials: "include",
                     headers: { "Content-Type": "application/json" },
                     body: JSON.stringify({ name: file.name, size: file.size, contentType }),
                   })
                   const uploadDetails = await uploadResponse.json()
                   if (!uploadResponse.ok) throw new Error(uploadDetails.error || "Unable to prepare upload")
                   const signedContentType = uploadDetails.metadata.contentType
                   const putResponse = await fetch(uploadDetails.uploadURL, {
                     method: "PUT",
                     headers: { "Content-Type": signedContentType },
                     body: file,
                   })
                   if (!putResponse.ok) throw new Error("The FICA file could not be stored")
                   registerDoc.mutate({
                     ...data,
                     file: undefined,
                     type: docFormType,
                     fileObjectPath: uploadDetails.objectPath,
                     originalFilename: file.name,
                     mimeType: signedContentType,
                     fileSize: file.size,
                     fileChecksum: await sha256File(file),
                   })
                } catch (error) {
                  toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Could not upload FICA document.", variant: "destructive" })
                }
              })}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: T.textDim, display: "block", marginBottom: 4 }}>Document Type</label>
                  <p style={{ fontSize: 12, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{docFormType.replace(/_/g, " ")}</p>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: T.textDim, display: "block", marginBottom: 4 }}>FICA File</label>
                  <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" {...docRegForm.register("file", { required: true })} className="h-8 text-[11px]" />
                  <p style={{ fontSize: 9, color: T.textFaint, marginTop: 4 }}>Private upload. PDF, PNG, JPG or WEBP up to 25 MB.</p>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: T.textDim, display: "block", marginBottom: 4 }}>Expiry Date (if applicable)</label>
                  <Input type="date" {...docRegForm.register("expiryDate")} className="h-8 text-[11px]" />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 10, color: T.textDim, display: "block", marginBottom: 4 }}>Notes</label>
                  <textarea {...docRegForm.register("notes")} rows={2}
                    style={{ width: "100%", background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, padding: "6px 8px", fontSize: 11, resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button type="submit" size="sm" disabled={registerDoc.isPending} style={{ flex: 1, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                    {registerDoc.isPending ? "Registering…" : "Register Document"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDocFormOpen(false)}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════════ RELATED PARTIES ════════════ */}
        {activeTab === "related" && (
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>Related Parties</p>
                <p style={{ fontSize: 10, color: T.textFaint, margin: "3px 0 0" }}>Directors, beneficial owners, beneficiaries, trustees and opposing parties</p>
              </div>
              <Button variant="brand" size="sm" onClick={() => { setEditingParty(null); partyForm.reset({ role: "director" }); setPartySheetOpen(true) }}
                style={{ fontSize: 11, height: 30, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                <Plus size={11} className="mr-1" /> Add Party
              </Button>
            </div>

            {rpL ? <PageLoader /> : (relatedParties ?? []).length === 0 ? (
              <div style={{ ...cardStyle, padding: 24, textAlign: "center", border: `1px solid color-mix(in srgb, ${T.warn} 40%, transparent)`, background: `color-mix(in srgb, ${T.warn} 8%, transparent)` }}>
                <AlertTriangle size={16} style={{ color: T.warn, margin: "0 auto 8px" }} />
                <p style={{ fontSize: 12, color: T.warn, fontWeight: 600 }}>No related parties on file</p>
                <p style={{ fontSize: 11, color: T.warn, opacity: 0.8, marginTop: 4 }}>
                  Beneficial ownership documentation is required for FICA compliance.
                </p>
              </div>
            ) : (
              (() => {
                const byRole: Record<string, any[]> = {}
                for (const p of relatedParties ?? []) {
                  byRole[p.role] = [...(byRole[p.role] ?? []), p]
                }
                return Object.entries(byRole).map(([role, parties]) => {
                  const color = PARTY_ROLE_COLOR[role] ?? T.textDim
                  const roleLabel = PARTY_ROLES.find(r => r.value === role)?.label ?? role
                  return (
                    <div key={role} style={{ marginBottom: 18 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color, marginBottom: 8, borderLeft: `2px solid ${color}`, paddingLeft: 8 }}>
                        {roleLabel}s ({parties.length})
                      </p>
                      {parties.map((p: any) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", ...cardStyle, borderLeft: `3px solid ${color}`, marginBottom: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: 0 }}>{p.name}</p>
                            <p style={{ fontSize: 10, color: T.textFaint, margin: "2px 0 0" }}>
                              {[p.idNumber && `ID: ${p.idNumber}`, p.passportNo && `Passport: ${p.passportNo}`, p.ownershipPct && `${p.ownershipPct}% ownership`, p.email, p.phone].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <button onClick={() => { setEditingParty(p); partyForm.reset(p); setPartySheetOpen(true) }}
                            style={{ color: T.textFaint, background: "transparent", cursor: "pointer", padding: 4 }}>
                            <Edit2 size={11} />
                          </button>
                          <button onClick={() => deleteParty.mutate(p.id)}
                            style={{ color: T.risk, background: "transparent", cursor: "pointer", padding: 4 }}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })
              })()
            )}
          </div>
        )}

        {/* ════════════ MATTERS ════════════ */}
        {activeTab === "matters" && (
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>
                Matters for {client.name}
              </p>
              {canCreateMatter ? (
                <Link href="/matters">
                  <Button variant="brand" size="sm" style={{ fontSize: 11, height: 30, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
                    <Plus size={11} className="mr-1" /> New Matter
                  </Button>
                </Link>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.risk }}>
                  <ShieldX size={12} /> Matter creation blocked
                </div>
              )}
            </div>

            {clientMatters.length === 0 ? (
              <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", paddingTop: 32 }}>No matters for this client yet.</p>
            ) : (
              clientMatters.map(m => {
                const statusColor = m.status === "active" ? T.ok : m.status === "closed" ? T.textDim : T.warn
                return (
                  <Link key={m.id} href={`/matters/${m.id}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", ...cardStyle, borderLeft: `3px solid ${statusColor}`, marginBottom: 6, cursor: "pointer" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceB }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.surface }}>
                      <Briefcase size={12} style={{ color: T.textFaint, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</p>
                        <p style={{ fontSize: 10, color: T.textFaint, margin: "2px 0 0", fontFamily: "monospace" }}>{m.reference}</p>
                      </div>
                      <span style={pillStyle(statusColor)}>{m.status}</span>
                      {m.value && <span style={{ fontSize: 11, color: T.textDim, fontFamily: "monospace" }}>{fmt(Number(m.value))}</span>}
                      <ChevronRight size={12} style={{ color: T.textFaint }} />
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        )}

        {/* ════════════ DOCUMENTS ════════════ */}
        {activeTab === "documents" && (
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 16 }}>Client Documents</p>
            {(documents ?? []).length === 0 ? (
              <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", paddingTop: 32 }}>No documents linked to this client.</p>
            ) : (
              (documents ?? []).map((doc: any) => (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", ...cardStyle, marginBottom: 6 }}>
                  <FileText size={12} style={{ color: T.textFaint, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: T.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</p>
                    <p style={{ fontSize: 10, color: T.textFaint, margin: "2px 0 0" }}>{new Date(doc.createdAt).toLocaleDateString("en-ZA")}</p>
                  </div>
                  <span style={pillStyle(doc.status === "approved" ? T.ok : doc.status === "rejected" ? T.risk : T.warn)}>{doc.status}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* ════════════ ACTIVITY / AUDIT ════════════ */}
        {activeTab === "activity" && (
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 16 }}>Activity & Audit Log</p>
            {(activity ?? []).length === 0 ? (
              <p style={{ fontSize: 12, color: T.textFaint, textAlign: "center", paddingTop: 32 }}>No audit events for this client.</p>
            ) : (
              <div style={{ ...cardStyle, padding: "4px 0 4px 20px", position: "relative" }}>
                <div style={{ position: "absolute", left: 20, top: 12, bottom: 12, width: 1, background: T.border }} />
                {(activity ?? []).map((log: any) => (
                  <div key={log.id} style={{ marginBottom: 14, paddingLeft: 16, position: "relative" }}>
                    <span style={{ position: "absolute", left: -3, top: 4, width: 7, height: 7, borderRadius: "50%", background: T.cyan, border: `2px solid ${T.bg}` }} />
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{log.action?.replace(/_/g, " ")}</span>
                      <span style={{ fontSize: 10, color: T.textFaint }}>{new Date(log.createdAt).toLocaleString("en-ZA")}</span>
                    </div>
                    {log.description && <p style={{ fontSize: 11, color: T.textDim, margin: 0 }}>{log.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Related Party Sheet ── */}
      <Sheet open={partySheetOpen} onOpenChange={v => { setPartySheetOpen(v); if (!v) setEditingParty(null) }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingParty ? "Edit Related Party" : "Add Related Party"}</SheetTitle>
            <SheetDescription>Directors, beneficial owners, beneficiaries, trustees and opposing parties.</SheetDescription>
          </SheetHeader>
          <form
            className="space-y-3 py-4"
            onSubmit={partyForm.handleSubmit(data => {
              if (editingParty) updateParty.mutate({ partyId: editingParty.id, data })
              else createParty.mutate(data)
            })}
          >
            <div>
              <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Role *</label>
              <select {...partyForm.register("role")} style={{ width: "100%", background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, padding: "6px 8px", fontSize: 12 }}>
                {PARTY_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Full Name *</label>
              <Input {...partyForm.register("name", { required: true })} placeholder="Full legal name" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>ID Number</label>
                <Input {...partyForm.register("idNumber")} placeholder="SA ID" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Passport No.</label>
                <Input {...partyForm.register("passportNo")} placeholder="Passport" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Email</label>
                <Input type="email" {...partyForm.register("email")} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Phone</label>
                <Input {...partyForm.register("phone")} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Ownership %</label>
              <Input {...partyForm.register("ownershipPct")} placeholder="e.g. 25" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Notes</label>
              <textarea {...partyForm.register("notes")} rows={2}
                style={{ width: "100%", background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, padding: "6px 8px", fontSize: 12, resize: "vertical" }} />
            </div>
            <Button type="submit" className="w-full" disabled={createParty.isPending || updateParty.isPending}
              style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
              {editingParty ? "Update Party" : "Add Party"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ── Block reason editor ───────────────────────────────────────────────────────
function BlockReasonEditor({ current, onSave }: { current: string; onSave: (reason: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(current)
  return (
    <div style={{ padding: 14, border: `1px solid color-mix(in srgb, ${T.risk} 40%, transparent)`, background: `color-mix(in srgb, ${T.risk} 8%, transparent)`, borderRadius: 8, marginBottom: 14 }}>
      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.risk, marginBottom: 6 }}>Block Reason</p>
      {!editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <p style={{ flex: 1, fontSize: 11, color: T.text }}>{current || "No reason specified"}</p>
          <button onClick={() => setEditing(true)} style={{ fontSize: 10, color: T.textDim, background: "transparent", cursor: "pointer" }}>
            <Edit2 size={11} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={value} onChange={e => setValue(e.target.value)}
            style={{ flex: 1, background: T.surfaceEl, border: `1px solid color-mix(in srgb, ${T.risk} 60%, transparent)`, borderRadius: 6, color: T.text, padding: "5px 8px", fontSize: 12 }} />
          <button onClick={() => { onSave(value); setEditing(false) }}
            style={{ fontSize: 11, padding: "5px 12px", background: `color-mix(in srgb, ${T.risk} 20%, transparent)`, color: T.risk, border: `1px solid color-mix(in srgb, ${T.risk} 60%, transparent)`, borderRadius: 6, cursor: "pointer" }}>
            Save
          </button>
          <button onClick={() => setEditing(false)}
            style={{ fontSize: 11, padding: "5px 8px", background: "transparent", color: T.textFaint, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer" }}>
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  )
}
