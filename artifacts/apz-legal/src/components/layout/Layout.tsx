import * as React from "react"
import { Link, useLocation, useLocation as wouterUseLocation } from "wouter"
import {
  AlertTriangle, Bell, BookOpen, BookTemplate, Bot, Briefcase, CalendarDays,
  CheckSquare, ChevronDown, Clock, FileText, FlaskConical,
  GitBranch, GitMerge, LayoutDashboard, LogOut, Mail, Menu, Moon, ScrollText, X,
  Search, Settings, ShieldAlert, ShieldCheck, Sun, UserCheck, Users, TrendingUp,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import {
  useGetPendingActions,
  useListNotifications,
  useLogout,
  useMarkNotificationRead,
  getGetPendingActionsQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react"
import type { Notification, User } from "@workspace/api-client-react"
import { getInitials } from "@/lib/format"
import { useTheme } from "next-themes"
import { BrandLockup } from "@/components/brand/BrandLockup"
import "@/styles/paper-petrol.css"

const NAV: Array<{
  group: string
  items: Array<{ name: string; href: string; icon: React.ElementType }>
}> = [
  { group: "CORE", items: [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "My Actions", href: "/actions", icon: CheckSquare },
    { name: "Clients", href: "/clients", icon: Users },
    { name: "Matters", href: "/matters", icon: Briefcase },
  ] },
  { group: "INTELLIGENCE", items: [
    { name: "Legal AI", href: "/ai", icon: Bot },
    { name: "Research", href: "/research", icon: FlaskConical },
    { name: "Knowledge Base", href: "/knowledge", icon: BookOpen },
    { name: "Conflict Check", href: "/conflicts", icon: GitMerge },
  ] },
  { group: "DOCUMENTS", items: [
    { name: "Documents", href: "/documents", icon: FileText },
    { name: "Templates", href: "/templates", icon: BookTemplate },
    { name: "Email", href: "/email", icon: Mail },
  ] },
  { group: "OPERATIONS", items: [
    { name: "Firm Productivity", href: "/productivity", icon: TrendingUp },
    { name: "Workflows", href: "/workflow", icon: GitBranch },
    { name: "Calendar", href: "/calendar", icon: CalendarDays },
    { name: "Appointments", href: "/appointments", icon: UserCheck },
    { name: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Time Tracking", href: "/time", icon: Clock },
  ] },
  { group: "COMPLIANCE", items: [
    { name: "FICA Compliance", href: "/fica", icon: ShieldAlert },
    { name: "Audit Logs", href: "/audit", icon: ScrollText },
    { name: "Admin", href: "/admin", icon: ShieldCheck },
  ] },
]

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard", "/actions": "My Actions", "/clients": "Clients", "/matters": "Matters",
  "/ai": "Legal AI", "/research": "Research", "/knowledge": "Knowledge Base",
  "/conflicts": "Conflict Check", "/documents": "Documents", "/templates": "Templates",
  "/email": "Email", "/workflow": "Workflows", "/calendar": "Calendar",
  "/productivity": "Firm Productivity",
  "/appointments": "Appointments", "/fica": "FICA Compliance", "/tasks": "Tasks",
  "/time": "Time Tracking", "/audit": "Audit Logs",
  "/admin": "Admin", "/settings": "Settings",
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Administrator",
  managing_partner: "Managing Partner",
  partner: "Partner",
  associate_attorney: "Associate Attorney",
  candidate_attorney: "Candidate Attorney",
  paralegal: "Paralegal",
  secretary: "Secretary",
  billing_officer: "Operations Officer",
  compliance_officer: "Compliance Officer",
  client_portal_user: "Client Portal User",
  admin: "Administrator",
  attorney: "Attorney",
}

interface LayoutProps {
  children: React.ReactNode
  user: User
}

function getPageLabel(location: string) {
  if (PAGE_LABELS[location]) return PAGE_LABELS[location]
  const match = Object.entries(PAGE_LABELS).find(([href]) => href !== "/" && location.startsWith(href + "/"))
  return match?.[1] ?? "Workspace"
}

export function Layout({ children, user }: LayoutProps) {
  const [location, setLocation] = useLocation()
  const [mobileNavigationOpen, setMobileNavigationOpen] = React.useState(false)
  const [globalSearch, setGlobalSearch] = React.useState("")
  const [isMobileViewport, setIsMobileViewport] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches
  )
  const mobileMenuButtonRef = React.useRef<HTMLButtonElement>(null)
  const mobileDrawerRef = React.useRef<HTMLElement>(null)
  const mobileDrawerCloseRef = React.useRef<HTMLButtonElement>(null)
  const logout = useLogout()
  const { resolvedTheme, setTheme } = useTheme()
  const { data: actionsData, isError: actionsError } = useGetPendingActions({
    query: { queryKey: getGetPendingActionsQueryKey(), refetchInterval: 30_000 },
  })
  const role = (user as any).role?.toLowerCase() ?? ""
  const roleLabel = ROLE_LABELS[role] ?? (user as any).role ?? "Attorney"
  const actionsCount = actionsData?.counts?.total ?? 0
  const isActive = (href: string) => href === "/" ? location === "/" : location === href || location.startsWith(href + "/")
  const isMobileDrawerOpen = isMobileViewport && mobileNavigationOpen

  React.useEffect(() => {
    setMobileNavigationOpen(false)
  }, [location])

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)")
    const updateViewport = () => {
      setIsMobileViewport(query.matches)
      if (!query.matches) setMobileNavigationOpen(false)
    }
    updateViewport()
    query.addEventListener("change", updateViewport)
    return () => query.removeEventListener("change", updateViewport)
  }, [])

  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false)
    window.setTimeout(() => mobileMenuButtonRef.current?.focus(), 0)
  }

  React.useEffect(() => {
    if (!isMobileDrawerOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeMobileNavigation()
        return
      }
      if (event.key !== "Tab") return

      const drawer = mobileDrawerRef.current
      if (!drawer) return
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(element => !element.hasAttribute("hidden") && element.getClientRects().length > 0)

      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === first || !drawer.contains(activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (activeElement === last || !drawer.contains(activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    const focusTimer = window.setTimeout(() => mobileDrawerCloseRef.current?.focus(), 0)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [isMobileDrawerOpen])

  return (
    <div className="ref-shell workspace-root">
      {isMobileDrawerOpen && (
        <button
          type="button"
          className="ref-mobile-backdrop"
          aria-label="Dismiss navigation overlay"
          onClick={closeMobileNavigation}
        />
      )}
      {(!isMobileViewport || isMobileDrawerOpen) && <aside
        ref={mobileDrawerRef}
        className={`ref-sidebar ${isMobileDrawerOpen ? "is-open" : ""}`}
        role={isMobileDrawerOpen ? "dialog" : undefined}
        aria-label={isMobileDrawerOpen ? undefined : "Workspace navigation"}
        aria-labelledby={isMobileDrawerOpen ? "workspace-navigation-title" : undefined}
        aria-modal={isMobileDrawerOpen || undefined}
      >
        <div className="ref-brand">
          <button ref={mobileDrawerCloseRef} type="button" className="ref-mobile-close" aria-label="Close workspace navigation" onClick={closeMobileNavigation}>
            <X size={15} />
          </button>
          <BrandLockup className="ref-brand-lockup" titleId="workspace-navigation-title" />
        </div>

        <nav className="ref-nav ref-scroll" aria-label="Primary navigation">
          {NAV.map(section => (
            <div key={section.group}>
              <div className="ref-nav-group">{section.group === "CORE" ? "WORKSPACE" : section.group === "COMPLIANCE" ? "COMPLIANCE" : section.group}</div>
              {section.items.map(item => {
                const Icon = item.icon
                const badge = item.href === "/actions" && actionsCount > 0 ? actionsCount : null
                return (
                  <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}>
                    <Icon size={14} />
                    <span>{item.name}</span>
                    {badge !== null && <em>{badge}</em>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="ref-sidebar-footer">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ref-profile" aria-label="Open profile menu" aria-haspopup="menu">
                <div className="ref-avatar">{getInitials(user.name)}</div>
                <div>
                  <b>{user.name}</b>
                  <small>{roleLabel}</small>
                </div>
                <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="ref-profile-menu">
              <div className="ref-profile-menu-heading">
                <strong>{user.name}</strong>
                <span>{roleLabel}</span>
              </div>
              <DropdownMenuItem onClick={() => setLocation("/settings")}>
                <Settings size={13} /> Account settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => logout.mutate(undefined, { onSuccess: () => window.location.reload() })}
              >
                <LogOut size={13} /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ref-footer-actions">
            <Link href="/settings" aria-label="Settings"><Settings size={13} /> <span>Settings</span></Link>
            <button type="button" onClick={() => logout.mutate(undefined, { onSuccess: () => window.location.reload() })} aria-label="Sign out">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>
      }

      <main className="ref-content">
        <header className="ref-topbar">
          <div className="ref-mobile-context">
            <span>APZ Legal</span>
            <strong>{getPageLabel(location)}</strong>
          </div>
          <button
            type="button"
            className="ref-mobile-menu"
            aria-label="Open workspace navigation"
            aria-expanded={mobileNavigationOpen}
            ref={mobileMenuButtonRef}
            onClick={() => isMobileDrawerOpen ? closeMobileNavigation() : setMobileNavigationOpen(true)}
          >
            <Menu size={16} />
          </button>
          <form className="ref-global-search" onSubmit={(event) => {
            event.preventDefault()
            const term = globalSearch.trim()
            if (term) {
              setLocation(`/matters?search=${encodeURIComponent(term)}`)
              window.dispatchEvent(new Event("apz-location-change"))
              setGlobalSearch("")
            }
          }}>
            <Search size={14} />
            <input
              aria-label="Search matters"
              placeholder="Search matters..."
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
          </form>
          <div className="ref-top-actions">
            <NotificationDropdown />
            <Link href="/actions" className={`ref-icon ${actionsError ? "has-error" : ""}`} aria-label={actionsError ? "Attention queue unavailable" : "Open attention queue"}>
              <AlertTriangle size={14} />
              {actionsCount > 0 && <i className="ref-notice" />}
            </Link>
            <button
              type="button"
              className="ref-icon"
              aria-label={resolvedTheme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
            >
              {resolvedTheme === "light" ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <Link href="/matters?create=1" className="ref-new-matter"><Briefcase size={14} /> <span>New matter</span></Link>
          </div>
        </header>
        <div className="ref-page-content ref-scroll">{children}</div>
      </main>
    </div>
  )
}

function NotificationDropdown() {
  const [, setLocation] = wouterUseLocation()
  const queryClient = useQueryClient()
  const { data: notifications, isError: notificationsError } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 30_000 },
  })
  const markRead = useMarkNotificationRead()
  const unreadCount = (notifications ?? []).filter(notification => !notification.readAt).length

  const handleRead = (notification: Notification) => {
    if (!notification.readAt) {
      markRead.mutate({ id: notification.id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
      })
    }
    if (notification.link) setLocation(notification.link)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ref-icon" aria-label="Notifications">
          <Bell size={14} />
          {unreadCount > 0 && <i className="ref-notice" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="ref-notification-menu">
        <div className="ref-notification-head">
          <span>Notifications</span>
          {unreadCount > 0 && <span>{unreadCount} unread</span>}
        </div>
        {notificationsError ? (
          <div className="ref-notification-item ref-notification-error">
            Notifications are temporarily unavailable.
          </div>
        ) : !notifications?.length ? (
          <div className="ref-notification-item">No notifications</div>
        ) : notifications.map(notification => (
          <DropdownMenuItem
            key={notification.id}
            className={`ref-notification-item ${!notification.readAt ? "unread" : ""}`}
            onClick={() => handleRead(notification)}
          >
            <div>
              <strong>{notification.title}</strong>
              <time>{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</time>
            </div>
            {notification.message && <p>{notification.message}</p>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}