import { Panel, PanelHeader, DataTable, PillButton } from "@/components/ui/primitives";
import { researchResults } from "@/data/mock";

export default function ResearchPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
        <span className="text-[12px] font-medium">Research</span>
      </div>
      <div className="p-3">
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            defaultValue="automatically unfair dismissal protected strike LRA"
            className="h-[28px] flex-1 rounded-full border border-[var(--border)] px-4 text-[12px] outline-none"
          />
          <PillButton variant="default" size="md">
            Search
          </PillButton>
        </div>
        <Panel className="min-h-0 flex-1">
          <PanelHeader title="Results · South Africa" />
          <DataTable
            headers={["Title", "Type", "Reference", "Relevance", ""]}
            rows={researchResults.map((r) => [
              r.title,
              r.type,
              r.ref,
              `${r.relevance}%`,
              <PillButton key={r.id} size="xs" variant="outline">
                Open
              </PillButton>,
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}
