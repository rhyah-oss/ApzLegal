import Link from "next/link";
import { Panel, PanelHeader, StatusPill, PillButton } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/data-table";
import { Workbench, WorkbenchBody, PageHeader } from "@/components/shell/page-header";
import { matters } from "@/data/mock";
import { formatDate } from "@/lib/utils";

export default function MattersPage() {
  return (
    <Workbench>
      <PageHeader
        title="Matters"
        subtitle={`${matters.length} total`}
        actions={
          <PillButton size="sm" variant="default">
            New matter
          </PillButton>
        }
      />
      <WorkbenchBody className="p-3">
        <Panel>
          <PanelHeader title="All matters" subtitle="South Africa jurisdiction" />
          <DataTable
            headers={["Reference", "Title", "Client", "Lead", "Opened", "Status", ""]}
            rows={matters.map((m) => [
              <span key={`r-${m.id}`} className="font-medium tabular-nums">
                {m.reference}
              </span>,
              <span key={`t-${m.id}`} className="block max-w-md truncate">
                {m.title}
              </span>,
              m.client,
              m.lead,
              formatDate(m.openedAt),
              <StatusPill key={`s-${m.id}`} status={m.status} />,
              <Link key={`l-${m.id}`} href={`/matters/${m.id}`}>
                <PillButton size="xs" variant={m.status === "open" ? "default" : "outline"}>
                  Open
                </PillButton>
              </Link>,
            ])}
          />
        </Panel>
      </WorkbenchBody>
    </Workbench>
  );
}
