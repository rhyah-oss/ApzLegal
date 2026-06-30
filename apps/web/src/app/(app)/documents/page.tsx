import { Panel, PanelHeader, DataTable, PillButton } from "@/components/ui/primitives";
import { documents, matters } from "@/data/mock";
import { formatDate } from "@/lib/utils";

export default function DocumentsPage() {
  const matterMap = Object.fromEntries(matters.map((m) => [m.id, m.reference]));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <span className="text-[12px] font-medium">Documents</span>
        <PillButton size="xs" variant="default">
          Upload
        </PillButton>
      </div>
      <Panel className="m-3 min-h-0 flex-1">
        <PanelHeader title={`${documents.length} documents`} />
        <DataTable
          headers={["Name", "Matter", "Folder", "Type", "Size", "Updated", ""]}
          rows={documents.map((d) => [
            d.name,
            matterMap[d.matterId] ?? "—",
            d.folder,
            d.type,
            d.size,
            formatDate(d.updatedAt),
            <PillButton key={d.id} size="xs" variant="outline">
              View
            </PillButton>,
          ])}
        />
      </Panel>
    </div>
  );
}
