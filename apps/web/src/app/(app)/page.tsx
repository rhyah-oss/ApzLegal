import Link from "next/link";
import { Panel, PanelHeader, StatusPill, PillButton } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { Workbench, WorkbenchBody, PageHeader } from "@/components/shell/page-header";
import { matters, workflowItems, calendarEvents, currentUser, firm } from "@/data/mock";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const openMatters = matters.filter((m) => m.status === "open");
  const pendingApprovals = workflowItems.filter(
    (w) => w.status === "in_review" || w.status === "draft"
  );
  const upcoming = calendarEvents.slice(0, 4);

  return (
    <Workbench>
      <PageHeader
        title="Dashboard"
        subtitle={`${firm.name} · ${currentUser.name}`}
        actions={
          <>
            <Link href="/matters">
              <PillButton size="xs" variant="outline">
                New matter
              </PillButton>
            </Link>
            <Link href="/ai">
              <PillButton size="xs" variant="default">
                Legal AI
              </PillButton>
            </Link>
          </>
        }
      />
      <WorkbenchBody className="p-3">
        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Open matters" value={openMatters.length} hint="Active caseload" />
          <StatCard label="Pending approvals" value={pendingApprovals.length} hint="Requires action" />
          <StatCard label="Unbilled hours" value="51.0" hint="Across open matters" />
          <StatCard label="Deadlines (7d)" value="2" hint="Hearings & filings" />
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Approval queue"
              subtitle={`${pendingApprovals.length} items`}
              action={
                <Link href="/workflows">
                  <PillButton size="xs" variant="ghost">
                    View all
                  </PillButton>
                </Link>
              }
            />
            <DataTable
              compact
              headers={["Item", "Matter", "Status", "Due"]}
              rows={pendingApprovals.map((w) => [
                w.title,
                w.matterRef,
                <StatusPill key={w.id} status={w.status} />,
                formatDate(w.dueAt),
              ])}
            />
          </Panel>

          <Panel>
            <PanelHeader title="Upcoming" subtitle="Deadlines & hearings" />
            <DataTable
              compact
              headers={["Event", "Matter", "Date"]}
              rows={upcoming.map((e) => [
                e.title,
                e.matterRef ?? "—",
                formatDate(e.date),
              ])}
            />
          </Panel>

          <Panel className="lg:col-span-2">
            <PanelHeader
              title="Active matters"
              subtitle={`${openMatters.length} open`}
              action={
                <Link href="/matters">
                  <PillButton size="xs" variant="ghost">
                    All matters
                  </PillButton>
                </Link>
              }
            />
            <DataTable
              headers={["Reference", "Title", "Client", "Practice area", "Status"]}
              rows={openMatters.map((m) => [
                <Link
                  key={m.id}
                  href={`/matters/${m.id}`}
                  className="font-medium text-[var(--text-primary)] hover:underline"
                >
                  {m.reference}
                </Link>,
                <span key={`t-${m.id}`} className="max-w-[280px] truncate block">
                  {m.title}
                </span>,
                m.client,
                m.practiceArea,
                <StatusPill key={`s-${m.id}`} status={m.status} />,
              ])}
            />
          </Panel>
        </div>
      </WorkbenchBody>
    </Workbench>
  );
}
