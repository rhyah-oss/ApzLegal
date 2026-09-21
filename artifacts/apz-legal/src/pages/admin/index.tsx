import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Users, Shield, Bot, Database, Clock, ChevronRight, Trash2, Plus, Globe } from "lucide-react"
import { T, cardStyle, pillStyle } from "@/lib/theme"
import { useToast } from "@/hooks/use-toast"

type AdminSection = "users" | "roles" | "ai" | "connectors" | "retention"

const SECTIONS: Array<{ key: AdminSection; label: string; icon: any; description: string }> = [
  { key: "users",      icon: Users,    label: "Users & Access",      description: "Manage firm users, invite attorneys and staff"  },
  { key: "roles",      icon: Shield,   label: "Roles & Permissions", description: "Configure role-based access controls"            },
  { key: "ai",         icon: Bot,      label: "AI Settings",         description: "Model selection, citation policy, safety rails"  },
  { key: "connectors", icon: Globe,    label: "Connectors",          description: "Email, document storage, search integrations"    },
  { key: "retention",  icon: Clock,    label: "Retention Policies",  description: "Document and audit log retention rules"          },
]

const AI_SETTINGS = [
  { label: "Primary model",             value: "GPT-4o (via private deployment)"         },
  { label: "Citation policy",           value: "Strict — source not found if unverified" },
  { label: "Human approval for email",  value: "Required (all outbound)"                 },
  { label: "Corpus search",             value: "Qdrant (private vector DB)"              },
  { label: "Legislation source",        value: "SAFLII + OpenSearch index"               },
]

const CONNECTORS = [
  { name: "MinIO Document Storage", status: "connected",     icon: Database },
  { name: "Qdrant Vector Search",   status: "connected",     icon: Database },
  { name: "OpenSearch (SAFLII)",    status: "connected",     icon: Globe    },
  { name: "Microsoft 365 / Email",  status: "not_connected", icon: Globe    },
  { name: "Neo4j (Matter Brain)",   status: "coming_soon",   icon: Database },
]

const gradientCta: React.CSSProperties = {
  background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
  borderRadius: 8,
}

export default function AdminPage() {
  const [section, setSection] = useState<AdminSection>("users")
  const { toast } = useToast()
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""
  const adminAction = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${BASE}/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }
  const inviteUser = async () => {
    const name = window.prompt("Staff member name")
    const email = window.prompt("Staff member email")
    const role = window.prompt("Role", "associate_attorney")
    const temporaryPassword = window.prompt("Temporary password (10+ characters)")
    if (!name || !email || !role || !temporaryPassword) return
    try { await adminAction("/admin/users", { method: "POST", body: JSON.stringify({ name, email, role, temporaryPassword }) }); toast({ title: "User invited", description: "Account created. Email delivery remains unavailable until a provider is connected." }); window.location.reload() }
    catch (error) { toast({ title: "Invite failed", description: error instanceof Error ? error.message : "Could not create user.", variant: "destructive" }) }
  }
  const changeRole = async (user: any) => {
    const role = window.prompt("New role", user.role)
    if (!role || role === user.role) return
    try { await adminAction(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role }) }); toast({ title: "Role updated" }); window.location.reload() }
    catch (error) { toast({ title: "Role update failed", description: error instanceof Error ? error.message : "Could not update role.", variant: "destructive" }) }
  }
  const deactivate = async (user: any) => {
    if (!window.confirm(`Deactivate ${user.name}?`)) return
    try { await adminAction(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ accountStatus: "inactive" }) }); toast({ title: "User deactivated" }); window.location.reload() }
    catch (error) { toast({ title: "Deactivation failed", description: error instanceof Error ? error.message : "Could not deactivate user.", variant: "destructive" }) }
  }
  const { data: users = [], isLoading: usersLoading, error: usersError } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/admin/users`, { credentials: "include" })
      if (!response.ok) throw new Error(response.status === 403 ? "Administrator access required" : "Unable to load users")
      return response.json()
    },
    enabled: section === "users",
  })

  return (
    <div className="flex h-full" style={{ background: T.bg }}>
      {/* Sidebar */}
      <div className="w-56 shrink-0 py-5" style={{ borderRight: `1px solid ${T.border}`, background: T.surface }}>
        <p
          className="mb-3 px-5 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: T.textFaint }}
        >
          Administration
        </p>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className="flex w-full items-center gap-2.5 px-5 py-2.5 text-[12px] transition-colors text-left"
            style={
              section === s.key
                ? { background: T.surfaceEl, color: T.text, fontWeight: 500, borderRight: `2px solid ${T.blue}` }
                : { color: T.textDim, borderRight: "2px solid transparent" }
            }
            onMouseEnter={e => { if (section !== s.key) (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
            onMouseLeave={e => { if (section !== s.key) (e.currentTarget as HTMLElement).style.background = "transparent" }}
          >
            <s.icon
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: section === s.key ? T.blue : T.textFaint }}
            />
            {s.label}
            {section === s.key && <ChevronRight className="ml-auto h-3 w-3" style={{ color: T.textFaint }} />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-7">

        {section === "users" && (
          <div>
            <div className="flex items-baseline justify-between mb-5">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>
                  Users & Access
                </h2>
                 <span className="text-[11px]" style={{ color: T.textDim }}>{users.length} firm members</span>
              </div>
              <button
                onClick={() => void inviteUser()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 transition-opacity"
                style={gradientCta}
              >
                <Plus className="h-3.5 w-3.5" /> Invite User
              </button>
            </div>

            <div style={{ ...cardStyle, overflow: "hidden" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.surfaceEl }}>
                    {["Name", "Email", "Role", "Status", "Last Active", ""].map(h => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: T.textFaint }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                   {usersLoading ? (
                     <tr><td colSpan={6} className="px-4 py-8 text-center text-[12px]" style={{ color: T.textDim }}>Loading users…</td></tr>
                   ) : usersError ? (
                     <tr><td colSpan={6} className="px-4 py-8 text-center text-[12px]" style={{ color: T.risk }}>Unable to load users. Check administrator permissions.</td></tr>
                   ) : users.map(u => (
                    <tr
                      key={u.email}
                      className="group transition-colors"
                      style={{ borderBottom: `1px solid ${T.borderSub}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                    >
                      <td className="px-4 py-3 text-[13px] font-medium" style={{ color: T.text }}>{u.name}</td>
                      <td className="px-4 py-3 text-[12px]" style={{ color: T.textDim }}>{u.email}</td>
                      <td className="px-4 py-3">
                        <span style={pillStyle(T.blue)}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        {/* Status dot — rounded-full intentional */}
                         <span style={pillStyle(u.accountStatus === "inactive" ? T.risk : T.ok)}>
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: T.ok }} />
                           {u.accountStatus ?? "active"}
                        </span>
                      </td>
                       <td className="px-4 py-3 text-[11px]" style={{ color: T.textFaint }}>{new Date(u.createdAt).toLocaleDateString("en-ZA")}</td>
                      <td className="px-4 py-3">
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500"
                          style={{ borderRadius: 6 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.1)" }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                          onClick={() => void deactivate(u)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button className="ml-2 text-[10px]" style={{ color: T.blue }} onClick={() => void changeRole(u)}>Role</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === "ai" && (
          <div>
            <div className="mb-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>
                AI Settings
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: T.textDim }}>
                Model configuration, citation policy, and safety controls
              </p>
            </div>
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              {AI_SETTINGS.map((s, i) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: i < AI_SETTINGS.length - 1 ? `1px solid ${T.borderSub}` : "none" }}
                >
                  <span className="text-[13px]" style={{ color: T.textDim }}>{s.label}</span>
                  <span className="text-[13px] font-medium" style={{ color: T.text }}>{s.value}</span>
                </div>
              ))}
            </div>
            <div
              className="mt-4 p-4"
              style={{
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderLeft: "3px solid #fbbf24",
                borderRadius: 10,
              }}
            >
              <p className="text-[12px] font-semibold text-amber-400">Citation-first policy active</p>
              <p className="mt-1 text-[11px] text-amber-500">
                When the AI cannot find a verifiable source, it must return "Source not found" —
                invented authorities are blocked at the system level.
              </p>
            </div>
          </div>
        )}

        {section === "connectors" && (
          <div>
            <div className="mb-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>
                Connectors
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: T.textDim }}>
                Integrations with storage, search, and communication services
              </p>
            </div>
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              {CONNECTORS.map((c, i) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: i < CONNECTORS.length - 1 ? `1px solid ${T.borderSub}` : "none" }}
                >
                  <div className="flex items-center gap-3">
                    <c.icon className="h-4 w-4" style={{ color: T.blue }} />
                    <span className="text-[13px] font-medium" style={{ color: T.text }}>{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.status === "connected" && (
                      <span style={pillStyle(T.ok)}>
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: T.ok }} />
                        Connected
                      </span>
                    )}
                    {c.status === "not_connected" && (
                      <button
                        onClick={() => toast({ title: "Provider required", description: "Connect the external provider from the workspace integrations before enabling this connector.", variant: "destructive" })}
                        className="px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 transition-opacity"
                        style={gradientCta}
                      >
                        Connect
                      </button>
                    )}
                    {c.status === "coming_soon" && (
                      <span style={pillStyle(T.textFaint)}>Coming in Phase 11</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(section === "roles" || section === "retention") && (
          <div className="flex h-48 items-center justify-center text-center">
            {(() => {
              const s = SECTIONS.find(x => x.key === section)!
              return (
                <div style={{ ...cardStyle, padding: "40px 48px" }}>
                  <s.icon className="h-6 w-6 mx-auto mb-3" style={{ color: T.textFaint }} />
                  <p className="text-[13px]" style={{ color: T.textDim }}>{s.label}</p>
                  <p className="mt-1 text-[11px]" style={{ color: T.textFaint }}>Configuration coming in the next phase</p>
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
