"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { GroupImperativeHandle, Layout } from "react-resizable-panels";
import {
  PanelGroup,
  ResizablePanel,
  PanelResizeHandle,
} from "@/components/ui/resizable";
import { Header } from "@/components/shell/header";
import { Footer } from "@/components/shell/footer";
import { Sidebar } from "@/components/shell/sidebar";
import { ContextPanel } from "@/components/shell/context-panel";
import { CommandPalette } from "@/components/shell/command-palette";
import { useLayoutStore, useUiStore } from "@/stores/layout-store";
import { buildPanelLayout, type PanelLayout } from "@/lib/panel-layout";
import { cn } from "@/lib/utils";

function ShellPane({
  children,
  variant,
  hidden,
}: {
  children: React.ReactNode;
  variant: "sidebar" | "main" | "context";
  hidden?: boolean;
}) {
  const bg =
    variant === "sidebar"
      ? "var(--bg-sidebar)"
      : variant === "context"
        ? "var(--bg-context)"
        : "var(--bg-main)";

  return (
    <div
      className={cn(
        "lexora-pane flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden",
        variant === "sidebar" && "border-r border-[var(--border)]",
        variant === "context" && "border-l border-[var(--border)]",
        hidden && "pointer-events-none opacity-0"
      )}
      style={{ background: bg }}
      aria-hidden={hidden}
    >
      {!hidden ? children : null}
    </div>
  );
}

function KeyboardShortcuts() {
  const { toggleSidebar, toggleContextPanel } = useLayoutStore();
  const { setCommandPaletteOpen } = useUiStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (mod && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        toggleContextPanel();
      } else if (mod && e.key >= "1" && e.key <= "9") {
        const routes = ["/", "/matters", "/ai", "/research", "/documents", "/email", "/workflows", "/billing", "/admin"];
        const idx = parseInt(e.key, 10) - 1;
        if (routes[idx]) {
          e.preventDefault();
          window.location.href = routes[idx];
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar, toggleContextPanel, setCommandPaletteOpen]);

  return null;
}

function ThemeInit() {
  const { darkMode } = useLayoutStore();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    sidebarCollapsed,
    contextPanelOpen,
    sidebarSize,
    contextSize,
    setSidebarSize,
    setContextSize,
  } = useLayoutStore();

  const groupRef = useRef<GroupImperativeHandle>(null);
  const applyingLayoutRef = useRef(false);
  const sizesRef = useRef({ sidebarSize, contextSize });

  useEffect(() => {
    sizesRef.current = { sidebarSize, contextSize };
  }, [sidebarSize, contextSize]);

  const panelLayout = useMemo(
    () =>
      buildPanelLayout({
        sidebarCollapsed,
        contextPanelOpen,
        sidebarSize,
        contextSize,
      }),
    [sidebarCollapsed, contextPanelOpen, sidebarSize, contextSize]
  );

  const applyLayout = useCallback((layout: PanelLayout) => {
    applyingLayoutRef.current = true;
    groupRef.current?.setLayout(layout);
    window.requestAnimationFrame(() => {
      applyingLayoutRef.current = false;
    });
  }, []);

  // Re-apply only when panels are toggled — not on every drag resize
  useEffect(() => {
    applyLayout(
      buildPanelLayout({
        sidebarCollapsed,
        contextPanelOpen,
        ...sizesRef.current,
      })
    );
  }, [sidebarCollapsed, contextPanelOpen, applyLayout]);

  const handleLayoutChanged = useCallback(
    (layout: Layout) => {
      if (applyingLayoutRef.current) return;

      const sidebar = layout.sidebar ?? 0;
      const context = layout.context ?? 0;

      if (!sidebarCollapsed && sidebar >= 14) {
        setSidebarSize(sidebar);
      }
      if (contextPanelOpen && context >= 20) {
        setContextSize(context);
      }
    },
    [contextPanelOpen, setContextSize, setSidebarSize, sidebarCollapsed]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-chrome)]">
      <ThemeInit />
      <KeyboardShortcuts />
      <Header />

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--radius-frame)]",
            "border border-[var(--border-frame)]",
            "bg-[var(--bg-frame)]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_3px_rgba(0,0,0,0.08)]"
          )}
        >
          <PanelGroup
            groupRef={groupRef}
            orientation="horizontal"
            id="lexora-main"
            className="min-h-0 min-w-0 flex-1"
            defaultLayout={panelLayout}
            onLayoutChanged={handleLayoutChanged}
          >
            <ResizablePanel
              id="sidebar"
              collapsible
              collapsedSize={0}
              minSize={sidebarCollapsed ? 0 : 14}
              maxSize={22}
            >
              <ShellPane variant="sidebar" hidden={sidebarCollapsed}>
                <Sidebar />
              </ShellPane>
            </ResizablePanel>

            <PanelResizeHandle />

            <ResizablePanel id="main" minSize={40}>
              <ShellPane variant="main">
                <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                  {children}
                </main>
              </ShellPane>
            </ResizablePanel>

            <PanelResizeHandle />

            <ResizablePanel
              id="context"
              collapsible
              collapsedSize={0}
              minSize={contextPanelOpen ? 20 : 0}
              maxSize={28}
            >
              <ShellPane variant="context" hidden={!contextPanelOpen}>
                <ContextPanel />
              </ShellPane>
            </ResizablePanel>
          </PanelGroup>
        </div>
      </div>

      <Footer />
      <CommandPalette />
    </div>
  );
}
