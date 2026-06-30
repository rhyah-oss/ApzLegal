import { Panel, PanelHeader, DataTable } from "@/components/ui/primitives";
import { auditLogs } from "@/data/mock";

export default function AuditPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center border-b border-[var(--border)] px-3">
        <span className="text-[12px] font-medium">Audit Logs</span>
      </div>
      <Panel className="m-3 min-h-0 flex-1">
        <PanelHeader title="Immutable action history" />
        <DataTable
          headers={["Timestamp", "User", "Action", "Entity", "Matter"]}
          rows={auditLogs.map((a) => [
            a.timestamp.replace("T", " ").slice(0, 16),
            a.user,
            a.action,
            a.entity,
            a.matterRef ?? "—",
          ])}
        />
      </Panel>
    </div>
  );
}
