import { Panel, PanelHeader, DataTable, PillButton } from "@/components/ui/primitives";
import { templates } from "@/data/mock";
import { formatDate } from "@/lib/utils";

export default function TemplatesPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <span className="text-[12px] font-medium">Templates</span>
        <PillButton size="xs" variant="default">
          New template
        </PillButton>
      </div>
      <Panel className="m-3 min-h-0 flex-1">
        <PanelHeader title="Document templates" />
        <DataTable
          headers={["Name", "Category", "Updated", ""]}
          rows={templates.map((t) => [
            t.name,
            t.category,
            formatDate(t.updatedAt),
            <PillButton key={t.id} size="xs" variant="outline">
              Use
            </PillButton>,
          ])}
        />
      </Panel>
    </div>
  );
}
