import { runAsyncAction } from "@/lib/async-action"
import { useEffect, useState } from "react"
import { Mail, Plus, RefreshCw, RotateCcw, Search, Send, PlugZap, Unplug } from "lucide-react"
import { T, cardStyle, pillStyle } from "@/lib/theme"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useListMatters } from "@workspace/api-client-react"
import { ProviderOperationBadge } from "@/components/provider-operation-status"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""
type EmailOperation = {
  id: number
  kind: "email"
  status: "queued" | "provider_confirmed" | "failed"
  providerName: string
  providerRequestId?: string | null
  matterId?: number | null
  documentId?: number | null
  attempt?: number | null
  payload: { to?: string; cc?: string | null; subject?: string; body?: string }
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
}
type Correspondence = {
  id: number
  matterId?: number | null
  subject?: string | null
  senderEmail: string
  bodyText?: string
  receivedAt: string
  linkStatus: string
}
type UnlinkedEmail = Correspondence & {
  candidates?: { matterId: number; score: number; reason: string }[]
}

export default function EmailPage() {
  const { toast } = useToast()
  const [operations, setOperations] = useState<EmailOperation[]>([])
  const [showComposer, setShowComposer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [correspondence, setCorrespondence] = useState<Correspondence[]>([])
  const [readiness, setReadiness] = useState<{ status: string; message: string } | null>(null)
  const [unlinked, setUnlinked] = useState<UnlinkedEmail[]>([])
  const [triageTargets, setTriageTargets] = useState<Record<number, string>>({})
  const [form, setForm] = useState({ to: "", cc: "", subject: "", body: "", matterId: "", reviewed: false })
  const [microsoftConnection, setMicrosoftConnection] = useState<{ status: string; mailboxEmail?: string | null; displayName?: string | null; isExpired?: boolean } | null>(null)
  const [microsoftLoading, setMicrosoftLoading] = useState(true)
  const { data: matters } = useListMatters({})

  async function loadOperations() {
    setLoading(true)
    try {
      const response = await fetch(`${BASE}/api/provider-operations?kind=email`, { credentials: "include" })
      if (!response.ok) throw new Error("Unable to load provider operations")
      setOperations(await response.json())
    } catch (error: any) {
      toast({ title: "Email operations unavailable", description: error.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadOperations() }, [])
  useEffect(() => {
    fetch(`${BASE}/api/email/readiness`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => result && setReadiness(result))
      .catch(() => undefined)
    fetch(`${BASE}/api/emails/unlinked`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : [])
      .then((result) => setUnlinked(Array.isArray(result) ? result : []))
      .catch(() => setUnlinked([]))
    fetch(`${BASE}/api/microsoft/connection`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => result && setMicrosoftConnection(result))
      .catch(() => setMicrosoftConnection(null))
      .finally(() => setMicrosoftLoading(false))
  }, [])

  async function connectMicrosoft() {
    setSaving(true)
    try {
      const response = await fetch(`${BASE}/api/microsoft/oauth/authorize`, { credentials: "include" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to start Microsoft 365 connection")
      window.location.href = result.url
    } catch (error: any) {
      toast({ title: "Connection failed", description: error.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function disconnectMicrosoft() {
    setSaving(true)
    try {
      const response = await fetch(`${BASE}/api/microsoft/disconnect`, { method: "POST", credentials: "include" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to disconnect Microsoft 365")
      setMicrosoftConnection({ status: "disconnected" })
      toast({ title: "Disconnected", description: "Microsoft 365 has been disconnected." })
    } catch (error: any) {
      toast({ title: "Disconnect failed", description: error.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function searchCorrespondence() {
    if (search.trim().length < 2) {
      setCorrespondence([])
      return
    }
    const response = await fetch(`${BASE}/api/emails/search?search=${encodeURIComponent(search.trim())}`, { credentials: "include" })
    const result = await response.json()
    if (response.ok) setCorrespondence(result)
  }

  async function triageEmail(emailId: number, action: "link" | "leave_unlinked") {
    const targetMatterId = Number(triageTargets[emailId])
    const response = await fetch(`${BASE}/api/emails/${emailId}/link`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, targetMatterId }),
    })
    const result = await response.json()
    if (!response.ok) {
      toast({ title: "Triage decision was not saved", description: result.error || "Unable to update email", variant: "destructive" })
      return
    }
    setUnlinked((current) => current.filter((email) => email.id !== emailId))
    toast({ title: action === "link" ? "Email linked to Matter" : "Email left unlinked", description: "The decision is recorded in the audit trail." })
  }

  async function queueEmail(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch(`${BASE}/api/provider-operations/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: form.to,
          cc: form.cc || undefined,
          subject: form.subject,
          body: form.body,
          matterId: Number(form.matterId),
          reviewed: form.reviewed,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to queue email")
      setForm({ to: "", cc: "", subject: "", body: "", matterId: "", reviewed: false })
      setShowComposer(false)
      await loadOperations()
      toast({ title: "Email queued", description: "No provider is connected, so delivery has not been claimed." })
    } catch (error: any) {
      toast({ title: "Email was not queued", description: error.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function retryOperation(id: number) {
    try {
      const response = await fetch(`${BASE}/api/provider-operations/${id}/retry`, { method: "POST", credentials: "include" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to retry provider operation")
      await loadOperations()
      toast({ title: "Email requeued", description: "A new provider attempt is pending; delivery is not confirmed." })
    } catch (error: any) {
      toast({ title: "Email was not requeued", description: error.message, variant: "destructive" })
    }
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, background: T.bg, flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: `1px solid ${T.border}` }}>
        <div>
          <h1 style={{ fontSize: 12, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Outbound Email</h1>
          <p style={{ marginTop: 5, fontSize: 11, color: T.textDim }}>Persisted provider handoffs — delivery is only confirmed by a connected provider.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => void loadOperations()} disabled={loading} style={{ height: 30, fontSize: 11 }}>
            <RefreshCw size={13} className={loading ? "animate-spin mr-1.5" : "mr-1.5"} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowComposer((value) => !value)} style={{ height: 30, fontSize: 11, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
            <Plus size={13} className="mr-1.5" /> Queue Email
          </Button>
        </div>
      </div>

      <div style={{ padding: "16px 20px 0", maxWidth: 980 }}>
        <div style={{ ...cardStyle, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <p style={{ color: T.text, fontSize: 12, fontWeight: 700, margin: 0 }}>Matter correspondence search</p>
              <p style={{ color: T.textDim, fontSize: 11, margin: "5px 0 0" }}>Search only returns email linked to Matters you are authorised to access.</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {readiness && <span style={pillStyle(readiness.status === "connected" ? T.ok : T.warn)}>{readiness.status === "connected" ? "Provider connected" : "Provider not connected"}</span>}
              {!microsoftLoading && microsoftConnection?.status === "connected" && (
                <span style={pillStyle(T.ok)}>Microsoft 365: {microsoftConnection.mailboxEmail}</span>
              )}
              {!microsoftLoading && microsoftConnection?.status === "authentication_expired" && (
                <span style={pillStyle(T.risk)}>Microsoft 365: expired</span>
              )}
              {!microsoftLoading && microsoftConnection?.status !== "connected" && microsoftConnection?.status !== "authentication_expired" && (
                <Button variant="outline" size="sm" onClick={() => void connectMicrosoft()} disabled={saving} style={{ height: 30, fontSize: 11 }}>
                  <PlugZap size={13} className="mr-1.5" /> Connect Microsoft 365
                </Button>
              )}
              {!microsoftLoading && microsoftConnection?.status === "connected" && (
                <Button variant="outline" size="sm" onClick={() => void disconnectMicrosoft()} disabled={saving} style={{ height: 30, fontSize: 11 }}>
                  <Unplug size={13} className="mr-1.5" /> Disconnect
                </Button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.textFaint }} />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runAsyncAction(() => searchCorrespondence())} placeholder="Search all authorised correspondence…" style={{ height: 34, paddingLeft: 32, fontSize: 11 }} />
            </div>
            <Button variant="outline" size="sm" onClick={() => void runAsyncAction(() => searchCorrespondence())} style={{ height: 34, fontSize: 11 }}>Search</Button>
          </div>
          {readiness?.status !== "connected" && <p style={{ color: T.warn, fontSize: 10, margin: "10px 0 0" }}>{readiness?.message || "No provider is connected; this workspace is ready for provider configuration but will not claim live sync."}</p>}
          {correspondence.length > 0 && <div style={{ marginTop: 12, borderTop: `1px solid ${T.borderSub}` }}>{correspondence.map((email) => <div key={email.id} style={{ padding: "11px 0", borderBottom: `1px solid ${T.borderSub}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong style={{ color: T.text, fontSize: 11 }}>{email.subject || "(No subject)"}</strong><span style={{ color: T.textFaint, fontSize: 10 }}>{new Date(email.receivedAt).toLocaleString()}</span></div><div style={{ color: T.textDim, fontSize: 10, marginTop: 4 }}>From {email.senderEmail} · Matter #{email.matterId ?? "unlinked"}</div><div style={{ color: T.textFaint, fontSize: 10, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email.bodyText || "No message preview"}</div></div>)}</div>}
        </div>
      </div>

      {unlinked.length > 0 && <div style={{ padding: "16px 20px 0", maxWidth: 980 }}>
        <div style={{ ...cardStyle, padding: 16, borderColor: `color-mix(in srgb, ${T.warn} 35%, ${T.border})` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div><p style={{ color: T.text, fontSize: 12, fontWeight: 700, margin: 0 }}>Matter-link review</p><p style={{ color: T.textDim, fontSize: 11, margin: "5px 0 0" }}>Messages without a confident deterministic match require a partner decision.</p></div>
            <span style={pillStyle(T.warn)}>{unlinked.length} to review</span>
          </div>
          <div style={{ marginTop: 12 }}>
            {unlinked.map((email) => {
              const suggestedMatter = email.candidates?.[0]?.matterId
              const target = triageTargets[email.id] ?? (suggestedMatter ? String(suggestedMatter) : "")
              return <div key={email.id} style={{ padding: "12px 0", borderTop: `1px solid ${T.borderSub}` }}>
                <strong style={{ color: T.text, fontSize: 11 }}>{email.subject || "(No subject)"}</strong>
                <div style={{ color: T.textDim, fontSize: 10, marginTop: 4 }}>From {email.senderEmail}{email.candidates?.[0] ? ` · ${email.candidates[0].score}% candidate: ${email.candidates[0].reason}` : ""}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                  <select value={target} onChange={(event) => setTriageTargets((current) => ({ ...current, [email.id]: event.target.value }))} style={{ height: 30, minWidth: 260, padding: "0 8px", background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, fontSize: 10 }}>
                    <option value="">Select Matter</option>
                    {matters?.map((matter) => <option key={matter.id} value={matter.id}>{matter.reference} — {matter.title}</option>)}
                  </select>
                  <Button size="sm" disabled={!target} onClick={() => void runAsyncAction(() => triageEmail(email.id, "link"))} style={{ height: 30, fontSize: 10 }}>Link to Matter</Button>
                  <Button variant="outline" size="sm" onClick={() => void runAsyncAction(() => triageEmail(email.id, "leave_unlinked"))} style={{ height: 30, fontSize: 10 }}>Leave unlinked</Button>
                </div>
              </div>
            })}
          </div>
        </div>
      </div>}

      {showComposer && (
        <form onSubmit={queueEmail} style={{ ...cardStyle, margin: 20, padding: 18, maxWidth: 720 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ fontSize: 11, color: T.textDim }}>Matter
              <select required value={form.matterId} onChange={(e) => setForm({ ...form, matterId: e.target.value })} style={{ display: "block", width: "100%", height: 36, marginTop: 5, padding: "0 10px", background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12 }}>
                <option value="">Select matter</option>
                {matters?.map((matter) => <option key={matter.id} value={matter.id}>{matter.reference} — {matter.title}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, color: T.textDim }}>To<Input required type="email" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} style={{ marginTop: 5 }} /></label>
            <label style={{ fontSize: 11, color: T.textDim }}>CC (optional)<Input type="email" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} style={{ marginTop: 5 }} /></label>
          </div>
          <label style={{ display: "block", marginTop: 12, fontSize: 11, color: T.textDim }}>Subject<Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} style={{ marginTop: 5 }} /></label>
          <label style={{ display: "block", marginTop: 12, fontSize: 11, color: T.textDim }}>Message<Textarea required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ marginTop: 5, minHeight: 130 }} /></label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, fontSize: 11, color: T.textDim, lineHeight: 1.4 }}>
            <input type="checkbox" required checked={form.reviewed} onChange={(e) => setForm({ ...form, reviewed: e.target.checked })} style={{ marginTop: 2, accentColor: T.cyan }} />
            I have reviewed and approved this message for provider handoff. Queueing does not confirm delivery.
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowComposer(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}>
              <Send size={13} className="mr-1.5" /> {saving ? "Queueing…" : "Queue for Provider"}
            </Button>
          </div>
        </form>
      )}

      <div style={{ padding: 20, overflow: "auto" }}>
        {loading ? <p style={{ color: T.textDim, fontSize: 12 }}>Loading persisted email operations…</p> : operations.length === 0 ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
            <Mail size={22} style={{ color: T.textFaint, margin: "0 auto 10px" }} />
            <p style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>No outbound email operations</p>
            <p style={{ color: T.textDim, fontSize: 11, marginTop: 5 }}>Queue an approved email here. It will remain visibly pending until a provider is connected.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 980 }}>
            {operations.map((operation) => {
              return (
                <div key={operation.id} style={{ ...cardStyle, padding: 16, display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <Mail size={17} style={{ color: T.cyan, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div>
                        <p style={{ color: T.text, fontSize: 13, fontWeight: 600, margin: 0 }}>{operation.payload.subject || "Untitled email"}</p>
                        <p style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>To {operation.payload.to} · Matter #{operation.matterId ?? "—"} · {new Date(operation.createdAt).toLocaleString()}</p>
                      </div>
                      <ProviderOperationBadge operation={operation} />
                    </div>
                    <p style={{ color: T.textDim, fontSize: 11, marginTop: 10, whiteSpace: "pre-wrap" }}>{operation.payload.body}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, fontSize: 10, color: T.textFaint }}>
                      {operation.providerRequestId && <span>Provider request: <code style={{ color: T.textDim }}>{operation.providerRequestId}</code></span>}
                      <span>Attempt {operation.attempt ?? 1}</span>
                      {operation.status === "failed" && (
                        <Button variant="outline" size="sm" onClick={() => void retryOperation(operation.id)} style={{ height: 26, fontSize: 10 }}>
                          <RotateCcw size={11} className="mr-1" /> Retry
                        </Button>
                      )}
                    </div>
                    {operation.errorMessage && <p style={{ color: T.risk, fontSize: 11, marginTop: 8 }}>{operation.errorMessage}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}