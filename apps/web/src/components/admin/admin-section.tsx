import Link from "next/link";
import { adminSections } from "@/lib/navigation";
import { Panel, PanelHeader, DataTable } from "@/components/ui/primitives";

export function AdminSection({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center border-b border-[var(--border)] px-3">
        <Link href="/admin" className="text-[10px] text-[var(--text-muted)] hover:underline">
          Admin
        </Link>
        <span className="mx-1 text-[var(--text-muted)]">/</span>
        <span className="text-[12px] font-medium">{title}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr]">
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
        <Panel className="m-3 border-0">
          <PanelHeader title={title} />
          <DataTable headers={headers} rows={rows} />
        </Panel>
      </div>
    </div>
  );
}
