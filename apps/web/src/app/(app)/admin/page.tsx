import Link from "next/link";
import { adminSections } from "@/lib/navigation";
import { Panel, PanelHeader } from "@/components/ui/primitives";

export default function AdminPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center border-b border-[var(--border)] px-3">
        <span className="text-[12px] font-medium">Admin Console</span>
      </div>
      <div className="grid flex-1 grid-cols-[200px_1fr]">
        <Panel className="border-0 border-r border-[var(--border)]">
          <PanelHeader title="Sections" />
          <nav className="p-2">
            {adminSections.map((s) => (
              <Link
                key={s.id}
                href={s.href}
                className="flex h-[28px] items-center rounded-full px-3 text-[11px] hover:bg-[var(--bg-hover)]"
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </Panel>
        <div className="flex items-center justify-center p-8 text-[12px] text-[var(--text-muted)]">
          Select an admin section from the sidebar
        </div>
      </div>
    </div>
  );
}
