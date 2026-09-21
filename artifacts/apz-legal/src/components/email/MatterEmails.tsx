import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Link2, Loader2, Mail, MailOpen, RefreshCw, Search, Unlink2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T, cardStyle, pillStyle } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
type EmailRecord = {
  id: number; subject: string | null; senderEmail: string; senderName?: string | null;
  toRecipients: string[]; ccRecipients: string[]; bodyText: string; receivedAt: string;
  isRead: boolean; linkStatus: "unlinked" | "suggested" | "linked"; matchReason?: string | null;
  matchConfidence?: number | null; threadId: number; matterId?: number | null;
};
type EmailDetail = EmailRecord & {
  attachments: { id: number; filename: string; mimeType: string; fileSize: number; fileObjectPath?: string | null; documentId?: number | null }[];
  candidates: { id: number; matterId: number; score: number; reason: string; decision: string }[];
};

function dateLabel(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function MatterEmails({ matterId, canManageLinks }: { matterId: number; canManageLinks: boolean }) {
  const { toast } = useToast();
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [selected, setSelected] = useState<EmailDetail | null>(null);
  const [thread, setThread] = useState<EmailRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "suggested">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matters, setMatters] = useState<{ id: number; reference: string; title: string }[]>([]);
  const [targetMatterId, setTargetMatterId] = useState(String(matterId));
  const [linking, setLinking] = useState(false);

  async function loadEmails() {
    setRefreshing(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (filter === "unread") query.set("unread", "true");
      if (filter === "suggested") query.set("linkStatus", "suggested");
      const response = await fetch(`${BASE}/api/matters/${matterId}/emails?${query}`, { credentials: "include" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load Matter correspondence");
      setEmails(result);
    } catch (error: any) {
      toast({ title: "Correspondence unavailable", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void loadEmails(); }, [matterId, filter]);
  useEffect(() => {
    fetch(`${BASE}/api/matters`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : [])
      .then((result) => setMatters(Array.isArray(result) ? result : []))
      .catch(() => setMatters([]));
  }, []);

  const visibleEmails = useMemo(() => emails, [emails]);

  async function openEmail(email: EmailRecord) {
    const response = await fetch(`${BASE}/api/matters/${matterId}/emails/${email.id}`, { credentials: "include" });
    const result = await response.json();
    if (!response.ok) {
      toast({ title: "Email unavailable", description: result.error || "Unable to open email", variant: "destructive" });
      return;
    }
    setSelected(result);
    const threadResponse = await fetch(`${BASE}/api/matters/${matterId}/emails/${email.id}/thread`, { credentials: "include" });
    const threadResult = await threadResponse.json();
    setThread(threadResponse.ok && Array.isArray(threadResult) ? threadResult : [result]);
    setTargetMatterId(String(matterId));
    if (!email.isRead) {
      await fetch(`${BASE}/api/matters/${matterId}/emails/${email.id}/read`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      setEmails((current) => current.map((item) => item.id === email.id ? { ...item, isRead: true } : item));
    }
  }

  async function updateLink(action: "link" | "change" | "remove" | "leave_unlinked") {
    if (!selected) return;
    setLinking(true);
    try {
      const response = await fetch(`${BASE}/api/matters/${matterId}/emails/${selected.id}/link`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetMatterId: Number(targetMatterId) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update email link");
      setSelected(null);
      await loadEmails();
      toast({ title: action === "leave_unlinked" || action === "remove" ? "Email left unlinked" : "Email Matter link updated" });
    } catch (error: any) {
      toast({ title: "Email link was not updated", description: error.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  }

  async function promoteAttachment(attachmentId: number) {
    if (!selected) return;
    const response = await fetch(`${BASE}/api/matters/${matterId}/emails/${selected.id}/attachments/${attachmentId}/document`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    });
    const result = await response.json();
    if (!response.ok) {
      toast({ title: "Attachment was not added to Documents", description: result.error || "Unable to create governed document", variant: "destructive" });
      return;
    }
    setSelected((current) => current ? { ...current, attachments: current.attachments.map((item) => item.id === attachmentId ? { ...item, documentId: result.document?.id ?? result.documentId } : item) } : current);
    toast({ title: "Attachment added to Matter Documents", description: "The original email attachment remains linked to its governed document." });
  }

  return (
    <div style={{ padding: 20, minHeight: "100%", background: T.bg }}>
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.textFaint }} />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void loadEmails()} placeholder="Search subject, sender or message…" style={{ paddingLeft: 32, height: 34, fontSize: 11 }} />
          </div>
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} style={{ height: 34, padding: "0 9px", background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, fontSize: 11 }}>
            <option value="all">All correspondence</option><option value="unread">Unread</option><option value="suggested">Needs Matter review</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void loadEmails()} disabled={refreshing} style={{ height: 34, fontSize: 11 }}>
            <RefreshCw size={13} className={refreshing ? "animate-spin mr-1.5" : "mr-1.5"} /> Refresh
          </Button>
        </div>
        {loading ? (
          <div style={{ padding: 50, textAlign: "center", color: T.textDim, fontSize: 12 }}><Loader2 size={18} className="animate-spin" style={{ margin: "0 auto 8px", color: T.cyan }} />Loading correspondence…</div>
        ) : visibleEmails.length === 0 ? (
          <div style={{ padding: 50, textAlign: "center" }}>
            <Mail size={22} style={{ color: T.textFaint, margin: "0 auto 10px" }} />
            <p style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>No email records for this Matter</p>
            <p style={{ color: T.textDim, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>Email provider connection is not configured. Once a provider is connected, matched correspondence will appear here.</p>
          </div>
        ) : (
          <div>
            {visibleEmails.map((email) => (
              <button key={email.id} onClick={() => void openEmail(email)} style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start", padding: "15px 16px", border: 0, borderBottom: `1px solid ${T.borderSub}`, background: email.isRead ? "transparent" : `color-mix(in srgb, ${T.blue} 5%, transparent)`, cursor: "pointer" }}>
                {email.isRead ? <MailOpen size={16} style={{ color: T.textFaint, marginTop: 2 }} /> : <Mail size={16} style={{ color: T.cyan, marginTop: 2 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <strong style={{ color: T.text, fontSize: 12, fontWeight: email.isRead ? 600 : 750 }}>{email.subject || "(No subject)"}</strong>
                    <span style={{ color: T.textFaint, fontSize: 10 }}>{dateLabel(email.receivedAt)}</span>
                  </div>
                  <div style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>From {email.senderName || email.senderEmail}</div>
                  <div style={{ color: T.textFaint, fontSize: 11, marginTop: 7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email.bodyText || "No message preview"}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <span style={pillStyle(email.linkStatus === "linked" ? T.ok : email.linkStatus === "suggested" ? T.warn : T.textFaint)}>{email.linkStatus === "suggested" ? "Review link" : email.linkStatus}</span>
                    {email.matchConfidence != null && <span style={{ color: T.textFaint, fontSize: 10 }}>{email.matchConfidence}% match</span>}
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: T.textFaint, marginTop: 2 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(4,9,18,.72)", display: "flex", justifyContent: "flex-end" }} onClick={() => setSelected(null)}>
          <aside onClick={(event) => event.stopPropagation()} style={{ width: "min(620px, 100%)", height: "100%", overflowY: "auto", background: T.surface, borderLeft: `1px solid ${T.border}`, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div><div style={{ color: T.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Matter correspondence</div><h2 style={{ color: T.text, fontSize: 18, margin: "7px 0 0" }}>{selected.subject || "(No subject)"}</h2></div>
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)}><X size={17} /></Button>
            </div>
            <div style={{ ...cardStyle, padding: 14, marginTop: 18 }}>
              <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}><strong style={{ color: T.text }}>From:</strong> {selected.senderName ? `${selected.senderName} <${selected.senderEmail}>` : selected.senderEmail}<br /><strong style={{ color: T.text }}>To:</strong> {selected.toRecipients.join(", ") || "—"}<br /><strong style={{ color: T.text }}>Received:</strong> {dateLabel(selected.receivedAt)}</div>
              <div style={{ marginTop: 16, color: T.text, fontSize: 13, lineHeight: 1.7 }}>
                {thread.length > 1 && <div style={{ color: T.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Thread · {thread.length} messages</div>}
                {(thread.length ? thread : [selected]).map((message) => (
                  <div key={message.id} style={{ padding: "12px 0", borderTop: `1px solid ${T.borderSub}` }}>
                    <div style={{ color: T.textDim, fontSize: 11, marginBottom: 7 }}>{message.senderName || message.senderEmail} · {dateLabel(message.receivedAt)}</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{message.bodyText || "No plain-text body was supplied."}</div>
                  </div>
                ))}
              </div>
            </div>
            {selected.matchReason && <div style={{ marginTop: 14, padding: 12, borderRadius: 6, background: `color-mix(in srgb, ${T.warn} 8%, transparent)`, color: T.warn, fontSize: 11 }}>Matching note: {selected.matchReason}</div>}
            {selected.attachments.length > 0 && <div style={{ marginTop: 18 }}><div style={{ color: T.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Attachments</div>{selected.attachments.map((attachment) => <div key={attachment.id} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}><a href={`${BASE}/api/email-attachments/${attachment.id}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, color: T.cyan, fontSize: 11, flex: 1 }}><FileText size={14} />{attachment.filename}</a>{attachment.documentId ? <span style={{ ...pillStyle(T.ok), fontSize: 8 }}>In Documents</span> : attachment.fileObjectPath && <Button variant="outline" size="sm" onClick={() => void promoteAttachment(attachment.id)} style={{ height: 25, fontSize: 10 }}>Add to Documents</Button>}</div>)}</div>}
            {canManageLinks && <div style={{ ...cardStyle, padding: 14, marginTop: 20 }}>
              <div style={{ color: T.text, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 7 }}><Link2 size={14} style={{ color: T.cyan }} /> Matter association</div>
              <p style={{ color: T.textDim, fontSize: 11, lineHeight: 1.5, margin: "7px 0 12px" }}>Matching is explainable and reviewable. Changing the link records an audit event.</p>
              <select value={targetMatterId} onChange={(event) => setTargetMatterId(event.target.value)} style={{ width: "100%", height: 34, padding: "0 9px", background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, fontSize: 11 }}>
                {matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.reference} — {matter.title}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <Button size="sm" onClick={() => void updateLink(selected.matterId === matterId ? "change" : "link")} disabled={linking} style={{ fontSize: 11, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})` }}><Link2 size={13} className="mr-1.5" />{linking ? "Saving…" : "Save Matter link"}</Button>
                <Button variant="outline" size="sm" onClick={() => void updateLink("leave_unlinked")} disabled={linking} style={{ fontSize: 11 }}><Unlink2 size={13} className="mr-1.5" />Leave unlinked</Button>
              </div>
            </div>}
            {selected.candidates.length > 0 && <div style={{ marginTop: 18, color: T.textDim, fontSize: 11 }}>Candidates recorded: {selected.candidates.length}. The highest-confidence candidate is never silently changed after a manual decision.</div>}
          </aside>
        </div>
      )}
    </div>
  );
}