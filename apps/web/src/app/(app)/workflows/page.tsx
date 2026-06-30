import { Panel, PanelHeader, DataTable, StatusPill, PillButton } from "@/components/ui/primitives";
import { Workbench, WorkbenchBody, PageHeader } from "@/components/shell/page-header";
import { workflowItems } from "@/data/mock";
import { formatDate } from "@/lib/utils";

export default function WorkflowsPage() {
  return (
    <Workbench>
      <PageHeader title="Workflows" subtitle="Approval queue" />
      <WorkbenchBody className="p-3">
        <Panel>
          <PanelHeader title="Pending review" subtitle={`${workflowItems.length} items`} />
          <DataTable
            headers={["Item", "Type", "Matter", "Assignee", "Status", "Due", ""]}
            rows={workflowItems.map((w) => [
              w.title,
              w.type,
              w.matterRef,
              w.assignee,
              <StatusPill key={w.id} status={w.status} />,
              formatDate(w.dueAt),
              <div key={w.id} className="flex gap-1">
                <PillButton size="xs" variant="default">
                  Approve
                </PillButton>
                <PillButton size="xs" variant="ghost">
                  Reject
                </PillButton>
              </div>,
            ])}
          />
        </Panel>
      </WorkbenchBody>
    </Workbench>
  );
}
