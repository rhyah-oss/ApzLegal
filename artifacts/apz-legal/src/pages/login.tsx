import * as React from "react"
import { useLocation } from "wouter"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowUpRight, ChevronDown, LockKeyhole, Zap, Sun, Moon, Scale, Gavel, Eye } from "lucide-react"

import { useLogin, getGetCurrentUserQueryKey, customFetch } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { T as DARK_T } from "@/lib/theme"
import { useTheme } from "next-themes"
import "@/styles/paper-petrol.css"

const DEV_ROLES = [
  { label: "Managing Partner", role: "managing_partner", name: "Sarah van der Merwe", email: "sarah@apzlegal.co.za" },
  { label: "Partner", role: "partner", name: "James Nkosi", email: "james@apzlegal.co.za" },
  { label: "Associate Attorney", role: "associate_attorney", name: "Priya Pillay", email: "priya@apzlegal.co.za" },
  { label: "Candidate Attorney", role: "candidate_attorney", name: "Alex Botha", email: "candidate@apzlegal.co.za" },
  { label: "Paralegal", role: "paralegal", name: "Lindiwe Khumalo", email: "lindiwe@apzlegal.co.za" },
  { label: "Compliance Officer", role: "compliance_officer", name: "Fatima Moosa", email: "fatima@apzlegal.co.za" },
  { label: "Legal Secretary", role: "secretary", name: "Legal Secretary", email: "secretary@apzlegal.co.za" },
  { label: "Super Admin", role: "super_admin", name: "Super Admin", email: "superadmin@apzlegal.co.za" },
]

const ROLE_COLOR: Record<string, string> = {
  managing_partner: DARK_T.blue, super_admin: DARK_T.blue, partner: DARK_T.cyan, associate_attorney: DARK_T.ok,
  candidate_attorney: DARK_T.ok, paralegal: "#8B5CF6", compliance_officer: DARK_T.warn,
  secretary: "#EC4899",
}

const loginSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
})
type LoginFormValues = z.infer<typeof loginSchema>

const ProofItems = [
  { label: "One workspace", value: "Everything in context.", note: "" },
  { label: "Governance", value: "Decisions with clarity.", note: "" },
  { label: "Visibility", value: "Know what needs attention.", note: "" },
]

const getProofIcon = (label: string) => {
  switch (label) {
    case "One workspace": return <Scale size={14} />;
    case "Governance": return <Gavel size={14} />;
    case "Visibility": return <Eye size={14} />;
    default: return null;
  }
}

export default function LoginPage() {
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const loginMutation = useLogin()
  const [devSigningIn, setDevSigningIn] = React.useState(false)
  const [devError, setDevError] = React.useState<string | null>(null)
  const [devOpen, setDevOpen] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const T = isLight
    ? {
        bg: "#F2F0EA", surface: "#FBFAF7", surfaceB: "#F7F5F0", surfaceEl: "#EEECE6",
        border: "#D8D5CD", text: "#2B2F2D", textDim: "#68706D", textFaint: "#8B8F8B",
        blue: "#3B596B", cyan: "#6E8B8D", risk: "#9B5148",
      }
    : DARK_T
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "admin@apzlegal.co.za", password: "password123" },
  })

  function onSubmit(data: LoginFormValues) {
    loginMutation.mutate({ data }, {
      onSuccess: (res) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), res.user)
        setLocation("/")
      },
    })
  }

  async function quickSignIn(account: { role: string; email: string; name: string }) {
    setDevError(null)
    setDevSigningIn(true)
    try {
      const res = await customFetch<{ user: { id: number; name: string; email: string; role: string; avatarUrl?: string | null; createdAt?: Date } }>(
        "/api/auth/dev-login",
        {
          method: "POST",
          body: JSON.stringify({ role: account.role, email: account.email, name: account.name }),
        },
      )
      queryClient.setQueryData(getGetCurrentUserQueryKey(), res.user)
      setLocation("/")
    } catch (err) {
      const data = (err as { data?: { error?: string } }).data
      setDevError(data?.error ?? (err as Error)?.message ?? "Quick sign-in failed.")
      setDevSigningIn(false)
    }
  }

  return (
    <main className="landing-shell" data-testid="page-login">
      <div className="landing-frame">
        <section className="landing-story" aria-label="APZ Legal overview">
          <div className="landing-topline landing-stagger">
            <div className="landing-brand">
              <img src="/apz-legal-mark-charcoal-gold.png" alt="APZ Legal mark" className="landing-brand-mark" data-testid="img-apz-mark" />
              <div className="landing-brand-copy">
                <span className="landing-brand-name">APZ</span>
                <span className="landing-brand-descriptor">LEGAL</span>
              </div>
            </div>
            <div className="landing-jurisdiction">South Africa</div>
          </div>

          <div className="landing-hero">
            <p className="landing-kicker landing-stagger landing-stagger-2">The legal operating system</p>
            <h1 className="landing-title landing-stagger landing-stagger-2">
              <span className="block">Keep the</span>
              <span className="block"><em>matter</em> in view.</span>
            </h1>
            <p className="landing-deck landing-stagger landing-stagger-3">
              APZ Legal brings matters, people, documents, compliance and time into one controlled workspace for firms that work with consequence.
            </p>
            <div className="landing-rule landing-stagger landing-stagger-3" />
          </div>

          <div className="landing-proof landing-stagger landing-stagger-4">
            {ProofItems.map((item, idx) => (
              <div key={item.label} className="landing-proof-item">
                <div className="landing-proof-icon">
                  {getProofIcon(item.label)}
                </div>
                <span className="landing-proof-label">{item.label}</span>
                <span className="landing-proof-value">{item.value}</span>
                {item.note && <span className="landing-proof-note">{item.note}</span>}
              </div>
            ))}
          </div>
        </section>

        <section className="landing-access" aria-label="Sign in">
          <div className="landing-access-top">
            <span className="landing-access-context">Firm workspace / access</span>
            <button
              type="button"
              className="landing-theme-toggle"
              aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
              data-testid="button-toggle-theme"
              onClick={() => setTheme(isLight ? "dark" : "light")}
            >
              {isLight ? <Moon size={14} /> : <Sun size={14} />}
            </button>
          </div>

          <div className="landing-form-wrap landing-stagger landing-stagger-2">
            <div className="landing-form-eyebrow"><span /> Secure workspace access</div>
            <h2 className="landing-form-title">Welcome back.</h2>
            <p className="landing-form-subtitle">Sign in to continue to your firm's workspace.</p>

            <div className="landing-form-fields">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                  <div className="landing-form-card">
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email address</FormLabel>
                        <FormControl>
                          <Input data-testid="input-email" autoComplete="email" inputMode="email" placeholder="name@firm.co.za" {...field} />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input data-testid="input-password" type="password" autoComplete="current-password" placeholder="Enter your password" {...field} />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )} />
                  </div>
                  <button type="submit" disabled={loginMutation.isPending} className="landing-submit" data-testid="button-submit-login">
                    {loginMutation.isPending ? "Signing in…" : "Sign in"}
                    {!loginMutation.isPending && <ArrowUpRight size={15} />}
                  </button>
                  {loginMutation.isError && <p role="alert" className="landing-form-error" data-testid="status-login-error">Invalid credentials. Please try again.</p>}
                </form>
              </Form>
            </div>

            <div className="landing-or" role="separator" aria-label="Or sign in directly"><span>OR</span></div>

            <div className="landing-dev">
              <button type="button" className="landing-dev-toggle" aria-expanded={devOpen} data-testid="button-toggle-dev-mode" onClick={() => setDevOpen((value) => !value)}>
                <span className="flex items-center gap-2"><Zap size={11} /> Dev mode · quick sign-in</span>
                <ChevronDown size={13} style={{ transform: devOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .15s ease" }} />
              </button>
              {devOpen && (
                <div className="landing-dev-list">
                  {DEV_ROLES.map((role) => {
                    const color = ROLE_COLOR[role.role] ?? T.textDim
                    return (
                      <button key={role.email} type="button" disabled={loginMutation.isPending || devSigningIn} onClick={() => quickSignIn(role)} className="landing-dev-item" style={{ "--role-color": color } as React.CSSProperties} data-testid={`button-quick-signin-${role.role}`}>
                        <span />
                        <span className="landing-dev-copy"><span className="landing-dev-name">{role.name}</span><span className="landing-dev-role">{role.label}</span></span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </button>
                    )
                  })}
                  <p className="landing-dev-hint">All accounts · password: <span style={{ fontFamily: "monospace" }}>password123</span></p>
                  {devError && <p role="alert" className="landing-form-error" data-testid="status-dev-signin-error">{devError}</p>}
                </div>
              )}
            </div>
            <p className="landing-protection"><LockKeyhole size={11} /> Encrypted sessions · valid for 7 days</p>
          </div>
          <footer className="landing-access-footer"><span>APZ Legal · Legal operating system</span><span>© {new Date().getFullYear()}</span></footer>
        </section>
      </div>
    </main>
  )
}