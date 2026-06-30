"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups } from "@/lib/navigation";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useLayoutStore();

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--bg-sidebar)]">
      <nav className="flex-1 overflow-y-auto px-1.5 py-2">
        {navGroups.map((group) => (
          <div key={group.id} className="mb-3 last:mb-0">
            {!sidebarCollapsed ? (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {group.label}
              </p>
            ) : (
              <div className="mx-auto mb-1 h-px w-5 bg-[var(--border)]" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={cn(
                        "group flex h-[28px] items-center gap-2 rounded-full px-2 text-[11px] font-medium transition-all duration-100",
                        active
                          ? "bg-[var(--accent)] text-[var(--text-inverse)] shadow-sm"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                        sidebarCollapsed && "justify-center px-0"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[14px] w-[14px] shrink-0",
                          active ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                        )}
                        strokeWidth={active ? 2 : 1.75}
                      />
                      {!sidebarCollapsed ? (
                        <>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.shortcut ? (
                            <span
                              className={cn(
                                "text-[9px] tabular-nums",
                                active ? "text-[var(--text-inverse)]/60" : "text-[var(--text-muted)]"
                              )}
                            >
                              ⌘{item.shortcut}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
