import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useGetCurrentUser } from "@workspace/api-client-react"
import { PageLoader } from "@/components/ui/loader"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { T, cardStyle } from "@/lib/theme"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

const profileSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName:  z.string().min(1, "Required"),
  email:     z.string().email("Invalid email"),
  phone:     z.string().optional(),
  title:     z.string().optional(),
})
type ProfileFormValues = z.infer<typeof profileSchema>

type Section = "profile" | "security" | "notifications" | "appearance"

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: "profile",       label: "Profile"        },
  { key: "security",      label: "Security"       },
  { key: "notifications", label: "Notifications"  },
  { key: "appearance",    label: "Appearance"     },
]

const gradientCta: React.CSSProperties = {
  background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
  borderRadius: 8,
}

const inputStyle: React.CSSProperties = {
  background: T.surfaceEl,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.text,
}

export default function SettingsPage() {
  const { toast }     = useToast()
  const qc = useQueryClient()
  const [section, setSection] = useState<Section>("profile")
  const [preferences, setPreferences] = useState<Record<string, boolean>>({})
  const { resolvedTheme, setTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const { data: user, isLoading } = useGetCurrentUser()
  useEffect(() => {
    if (section !== "notifications") return
    fetch(`${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api/notification-preferences`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Unable to load notification preferences")))
      .then(setPreferences)
      .catch(error => toast({ title: "Could not load preferences", description: error.message, variant: "destructive" }))
  }, [section])
  const updatePreference = async (key: string, value: boolean) => {
    setPreferences(p => ({ ...p, [key]: value }))
    const response = await fetch(`${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api/notification-preferences`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) })
    if (!response.ok) toast({ title: "Could not save preference", variant: "destructive" })
  }

  const [firstName = "", ...restName] = (user?.name ?? "").split(" ")
  const lastName = restName.join(" ")

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: user ? {
      firstName, lastName,
      email: user.email || "", phone: "", title: "",
    } : undefined,
  })

  const profileMutation = useMutation({
    mutationFn: (data: ProfileFormValues) => fetch(`${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api/auth/profile`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${data.firstName} ${data.lastName}`.trim(), email: data.email }),
    }).then(async response => { if (!response.ok) throw new Error(await response.text()); return response.json() }),
    onSuccess: data => { qc.setQueryData(["/api/auth/me"], data); toast({ title: "Profile updated", description: "Your profile has been saved." }) },
    onError: error => toast({ title: "Could not save profile", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }),
  })
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" })
  const passwordMutation = useMutation({
    mutationFn: () => fetch(`${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api/auth/password`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }),
    }).then(async response => { if (!response.ok) throw new Error(await response.text()); return response.json() }),
    onSuccess: () => { setPasswords({ currentPassword: "", newPassword: "", confirm: "" }); toast({ title: "Password updated" }) },
    onError: error => toast({ title: "Could not update password", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }),
  })

  if (isLoading) return <PageLoader />

  return (
    <div className="flex h-full" style={{ background: T.bg }}>
      {/* Sidebar */}
      <div className="w-52 shrink-0 py-5" style={{ borderRight: `1px solid ${T.border}`, background: T.surface }}>
        <p
          className="mb-3 px-5 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: T.textFaint }}
        >
          Settings
        </p>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className="flex w-full items-center px-5 py-2.5 text-[12px] transition-colors text-left"
            style={
              section === s.key
                ? { background: T.surfaceEl, color: T.text, fontWeight: 500, borderRight: `2px solid ${T.blue}` }
                : { color: T.textDim, borderRight: "2px solid transparent" }
            }
            onMouseEnter={e => { if (section !== s.key) (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
            onMouseLeave={e => { if (section !== s.key) (e.currentTarget as HTMLElement).style.background = "transparent" }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {section === "profile" && (
          <div className="max-w-lg">
            <h2 className="mb-0.5 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>
              Profile
            </h2>
            <p className="mb-6 text-[11px]" style={{ color: T.textDim }}>
              Manage your personal details and contact information
            </p>

            {/* Avatar — rounded-sm square, no icon bubble */}
            <div className="mb-6 flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center text-[17px] font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`, borderRadius: 10 }}
              >
                {user?.name?.[0] || "U"}
              </div>
              <div>
                <p className="text-[13px] font-medium" style={{ color: T.text }}>{user?.name}</p>
                <p className="text-[12px]" style={{ color: T.textFaint }}>{user?.role || "Attorney"}</p>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: "20px 20px 24px" }}>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(data => profileMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { name: "firstName" as const, label: "First Name", placeholder: "First name" },
                      { name: "lastName"  as const, label: "Last Name",  placeholder: "Last name"  },
                    ].map(f => (
                      <FormField key={f.name} control={form.control} name={f.name} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.textDim }}>
                            {f.label}
                          </FormLabel>
                          <FormControl>
                            <input
                              placeholder={f.placeholder}
                              {...field}
                              className="w-full h-9 px-3 text-[13px] outline-none"
                              style={inputStyle}
                            />
                          </FormControl>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )} />
                    ))}
                  </div>
                  {[
                    { name: "email" as const, label: "Email Address", placeholder: "your@apzlegal.co.za", type: "email"  },
                    { name: "phone" as const, label: "Phone Number",  placeholder: "+27 11 000 0000",      type: "tel"    },
                    { name: "title" as const, label: "Job Title",     placeholder: "e.g. Senior Associate", type: "text"  },
                  ].map(f => (
                    <FormField key={f.name} control={form.control} name={f.name} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.textDim }}>
                          {f.label}
                        </FormLabel>
                        <FormControl>
                          <input
                            type={f.type}
                            placeholder={f.placeholder}
                            {...field}
                            className="w-full h-9 px-3 text-[13px] outline-none"
                            style={inputStyle}
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )} />
                  ))}
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={profileMutation.isPending}
                      className="px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                      style={gradientCta}
                    >
                      {profileMutation.isPending ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
        )}

        {section === "security" && (
          <div className="max-w-lg">
            <h2 className="mb-0.5 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>
              Security
            </h2>
            <p className="mb-6 text-[11px]" style={{ color: T.textDim }}>
              Manage password, 2FA, and active sessions
            </p>
            <div style={{ ...cardStyle, padding: "20px 20px 24px" }}>
              <div className="space-y-4">
                {["Current Password", "New Password", "Confirm New Password"].map(label => (
                  <div key={label}>
                    <label
                      className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: T.textDim }}
                    >
                      {label}
                    </label>
                    <input
                      type="password"
                      value={label === "Current Password" ? passwords.currentPassword : label === "New Password" ? passwords.newPassword : passwords.confirm}
                      onChange={e => setPasswords(p => ({ ...p, [label === "Current Password" ? "currentPassword" : label === "New Password" ? "newPassword" : "confirm"]: e.target.value }))}
                      className="w-full h-9 px-3 text-[13px] outline-none"
                      style={inputStyle}
                    />
                  </div>
                ))}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={passwordMutation.isPending || passwords.newPassword.length < 10 || passwords.newPassword !== passwords.confirm}
                    onClick={() => passwordMutation.mutate()}
                    className="px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
                    style={gradientCta}
                  >
                    {passwordMutation.isPending ? "Updating…" : "Update Password"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {section === "notifications" && (
          <div className="max-w-lg">
            <h2 className="mb-0.5 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>Notifications</h2>
            <p className="mb-6 text-[11px]" style={{ color: T.textDim }}>Choose which durable in-app alerts you receive.</p>
            <div style={{ ...cardStyle, padding: 20 }}>
              {[
                ["inAppEnabled", "In-app notifications"], ["emailEnabled", "Email notifications (provider required)"],
                ["conflictAlerts", "Conflict review alerts"], ["approvalAlerts", "Document and knowledge approvals"],
              ].map(([key, label]) => <label key={key} className="flex items-center justify-between border-b py-3 text-[12px]" style={{ borderColor: T.borderSub, color: T.text }}>
                <span>{label}</span><input type="checkbox" checked={preferences[key] ?? true} onChange={e => void updatePreference(key, e.target.checked)} />
              </label>)}
            </div>
          </div>
        )}
        {section === "appearance" && (
          <div className="max-w-lg">
            <h2 className="mb-0.5 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text }}>Appearance</h2>
            <p className="mb-6 text-[11px]" style={{ color: T.textDim }}>Choose how APZ Legal looks on this device.</p>
            <div style={{ ...cardStyle, padding: 20 }}>
              <div className="flex items-center justify-between gap-6">
                <div>
                  <p className="text-[13px] font-medium" style={{ color: T.text }}>Workspace theme</p>
                  <p className="mt-1 text-[11px]" style={{ color: T.textFaint }}>
                    Your preference is saved automatically for future visits.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={isLight ? "Use dark theme" : "Use light theme"}
                  onClick={() => setTheme(isLight ? "dark" : "light")}
                  className="flex shrink-0 items-center gap-2 px-3 py-2 text-[11px] font-medium transition-opacity hover:opacity-80"
                  style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text }}
                >
                  {isLight ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                  {isLight ? "Dark mode" : "Light mode"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
