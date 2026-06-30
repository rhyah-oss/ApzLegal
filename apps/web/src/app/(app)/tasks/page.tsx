import { Panel, PanelHeader, DataTable, PillButton } from "@/components/ui/primitives";
import { tasks } from "@/data/mock";
import { formatDate } from "@/lib/utils";

export default function TasksPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <span className="text-[12px] font-medium">Tasks</span>
        <PillButton size="xs" variant="default">
          New task
        </PillButton>
      </div>
      <Panel className="m-3 min-h-0 flex-1">
        <PanelHeader title={`${tasks.length} tasks`} />
        <DataTable
          headers={["Task", "Matter", "Assignee", "Due", "Done"]}
          rows={tasks.map((t) => [
            t.title,
            t.matterRef,
            t.assignee,
            formatDate(t.dueAt),
            t.done ? "✓" : "—",
          ])}
        />
      </Panel>
    </div>
  );
}
