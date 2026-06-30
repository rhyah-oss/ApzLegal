"use client";

import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  Command,
  Bell,
  Moon,
  Sun,
  PanelRight,
  PanelLeftClose,
} from "lucide-react";
import { useLayoutStore, useUiStore } from "@/stores/layout-store";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

export function Header() {
  const { darkMode, toggleDarkMode, toggleSidebar, toggleContextPanel, contextPanelOpen } =
    useLayoutStore();
  const { setCommandPaletteOpen } = useUiStore();
  const { session, signOut } = useAuthStore();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const segments = pathname.split("/").filter(Boolean);
  const breadcrumb =
    pathname === "/"
      ? "Dashboard"
      : segments.map((s) => s.replace(/-/g, " ")).join(" / ");

  const handleSignOut = useCallback(() => {
    setMenuOpen(false);
    signOut();
    setTimeout(() => {
      window.location.replace("/login");
    }, 0);
  }, [signOut]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.shiftKey && e.key === "Q") {
          e.preventDefault();
          handleSignOut();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSignOut]);

  return (
    <header className="flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-frame)] px-2.5">
      <button
        type="button"
        onClick={toggleSidebar}
        className="lexora-focus flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        aria-label="Toggle sidebar"
      >
        <PanelLeftClose className="h-3.5 w-3.5" />
      </button>

      <div className="flex min-w-0 items-center gap-1.5 pr-2">
        <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] bg-[var(--accent)]">
          <span className="text-[9px] font-bold text-[var(--text-inverse)]">L</span>
        </div>
        <span className="hidden truncate text-[11px] font-semibold text-[var(--text-primary)] sm:inline">
          Lexora
        </span>
        <span className="hidden text-[var(--text-muted)] sm:inline">/</span>
        <span className="hidden truncate text-[11px] capitalize text-[var(--text-secondary)] sm:inline">
          {breadcrumb}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="lexora-focus mx-auto flex h-[24px] w-full max-w-[420px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-app)] px-3 text-left transition-colors hover:border-[var(--border-strong)]"
      >
        <Search className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
        <span className="flex-1 truncate text-[11px] text-[var(--text-muted)]">
          Search matters, documents, citations…
        </span>
        <kbd className="hidden rounded border border-[var(--border)] bg-[var(--bg-panel)] px-1.5 py-px text-[9px] font-medium text-[var(--text-muted)] md:inline">
          ⌘K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton label="Command palette" onClick={() => setCommandPaletteOpen(true)}>
          <Command className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Toggle context panel" onClick={toggleContextPanel} active={contextPanelOpen}>
          <PanelRight className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Toggle theme" onClick={toggleDarkMode}>
          {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </IconButton>
        <IconButton label="Notifications">
          <Bell className="h-3.5 w-3.5" />
        </IconButton>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="lexora-focus ml-1 flex h-[24px] w-[24px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-sidebar)] text-[10px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            {session?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("").padEnd(2, "U").slice(0, 2) ?? "NM"}
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-8 z-50 w-[220px] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-panel)] shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
            >
              <div className="border-b border-[var(--border-subtle)] px-3 py-2">
                <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
                  {session?.name ?? "Workspace user"}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                  {session?.role === "client" ? "Client viewer" : session?.role === "viewer" ? "Demo viewer" : "Workspace member"}
                </p>
                <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">
                  {session?.email ?? "n.mbeki@smithpartners.co.za"}
                </p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="lexora-focus flex h-[30px] w-full items-center justify-between px-3 text-left text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                <span>Sign out</span>
                <span className="text-[var(--text-muted)]">⌘⇧Q</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function IconButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "lexora-focus flex h-[24px] w-[24px] items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        active && "bg-[var(--bg-active)] text-[var(--text-primary)]"
      )}
    >
      {children}
    </button>
  );
}