import {
  LayoutDashboard,
  Briefcase,
  Bot,
  Search,
  FileText,
  Mail,
  GitBranch,
  Clock,
  Calendar,
  CheckSquare,
  FileStack,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  shortcut?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    id: "core",
    label: "Core",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard, shortcut: "1" },
      { id: "matters", label: "Matters", href: "/matters", icon: Briefcase, shortcut: "2" },
      { id: "ai", label: "Legal AI", href: "/ai", icon: Bot, shortcut: "3" },
      { id: "research", label: "Research", href: "/research", icon: Search, shortcut: "4" },
    ],
  },
  {
    id: "work",
    label: "Work",
    items: [
      { id: "documents", label: "Documents", href: "/documents", icon: FileText, shortcut: "5" },
      { id: "email", label: "Email Discovery", href: "/email", icon: Mail, shortcut: "6" },
      { id: "workflows", label: "Workflows", href: "/workflows", icon: GitBranch, shortcut: "7" },
      { id: "billing", label: "Time & Billing", href: "/billing", icon: Clock, shortcut: "8" },
      { id: "calendar", label: "Calendar", href: "/calendar", icon: Calendar },
      { id: "tasks", label: "Tasks", href: "/tasks", icon: CheckSquare },
      { id: "templates", label: "Templates", href: "/templates", icon: FileStack },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "admin", label: "Admin", href: "/admin", icon: Settings, shortcut: "9" },
      { id: "audit", label: "Audit Logs", href: "/audit", icon: Shield },
    ],
  },
];

export const mainNav = navGroups.flatMap((g) => g.items);

export const adminSections = [
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "roles", label: "Roles & Permissions", href: "/admin/roles" },
  { id: "ai", label: "AI Settings", href: "/admin/ai" },
  { id: "email", label: "Email Connectors", href: "/admin/email" },
  { id: "retention", label: "Retention", href: "/admin/retention" },
  { id: "backups", label: "Backups", href: "/admin/backups" },
  { id: "health", label: "Deployment Health", href: "/admin/health" },
];
