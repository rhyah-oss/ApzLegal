"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { mainNav, adminSections } from "@/lib/navigation";
import { matters } from "@/data/mock";
import { useUiStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";

type CommandItem = {
  id: string;
  label: string;
  href: string;
  group: string;
};

export function CommandPalette() {
  const router = useRouter();
  const { commandPaletteOpen, setCommandPaletteOpen } = useUiStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const items: CommandItem[] = [
    ...mainNav.map((n) => ({ id: n.id, label: n.label, href: n.href, group: "Navigation" })),
    ...adminSections.map((s) => ({
      id: s.id,
      label: s.label,
      href: s.href,
      group: "Admin",
    })),
    ...matters.map((m) => ({
      id: m.id,
      label: `${m.reference} — ${m.title}`,
      href: `/matters/${m.id}`,
      group: "Matters",
    })),
  ];

  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      setCommandPaletteOpen(false);
      setQuery("");
      setSelected(0);
    },
    [router, setCommandPaletteOpen]
  );

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCommandPaletteOpen(false);
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s -  1, 0));
      } else if (e.key === "Enter" && filtered[selected]) {
        e.preventDefault();
        navigate(filtered[selected].href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen, filtered, selected, navigate, setCommandPaletteOpen]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSelected(0), [query]);

  if (!commandPaletteOpen) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-[12vh] backdrop-blur-[1px]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="animate-fade-in w-full max-w-[560px] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[40px] items-center gap-2 border-b border-[var(--border-subtle)] px-3">
          <Search className="h-4 w-4 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search navigation, matters, admin…"
            className="h-full w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11px] text-[var(--text-muted)]">
              No results found
            </p>
          ) : (
            filtered.map((item, i) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <div key={item.id + item.href}>
                  {showGroup && (
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      {item.group}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
                    className={cn(
                      "mx-1 flex h-[30px] w-[calc(100%-8px)] items-center rounded-[var(--radius-sm)] px-2.5 text-left text-[11px]",
                      i === selected
                        ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    )}
                  >
                    {item.label}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
