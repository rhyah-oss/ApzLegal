import { Panel, PanelHeader, DataTable, StatusPill, PillButton } from "@/components/ui/primitives";
import { Workbench, WorkbenchBody, PageHeader } from "@/components/shell/page-header";
import { emailThreads } from "@/data/mock";
import { formatDate } from "@/lib/utils";

export default function EmailPage() {
  return (
    <Workbench>
      <PageHeader
        title="Email Discovery"
        subtitle="Correspondence review"
        actions={
          <PillButton size="xs" variant="outline">
            Connect mailbox
          </PillButton>
        }
      />
      <WorkbenchBody flush className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <Panel flush className="border-r border-[var(--border)]">
          <PanelHeader title="Threads" subtitle={`${emailThreads.length} items`} />
          <DataTable
            compact
            headers={["Subject", "From", "Date", "Status"]}
            rows={emailThreads.map((e) => [
              e.subject,
              e.from,
              formatDate(e.date),
              e.approvalStatus ? (
                <StatusPill key={e.id} status={e.approvalStatus} />
              ) : (
                "—"
              ),
            ])}
          />
        </Panel>
        <Panel flush>
          <PanelHeader
            title="Draft reply"
            subtitle="Requires approval before send"
            action={
              <PillButton size="xs" variant="default">
                Submit for approval
              </PillButton>
            }
          />
          <div className="flex-1 overflow-y-auto p-5 text-[12px] leading-relaxed text-[var(--text-primary)]">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              AI-drafted · Pending review
            </p>
            <p>Dear Commissioner,</p>
            <p className="my-3">
              We refer to the above matter and wish to place on record that the applicant&apos;s
              dismissal was procedurally and substantively unfair. The employer failed to establish
              a valid reason related to operational requirements or misconduct unrelated to protected
              strike participation.
            </p>
            <p>Yours faithfully,</p>
            <p className="font-medium">Smith & Partners Inc.</p>
          </div>
        </Panel>
      </WorkbenchBody>
    </Workbench>
  );
}
