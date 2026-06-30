import { Panel, PanelHeader, DataTable, StatusPill, PillButton } from "@/components/ui/primitives";
import { timeEntries } from "@/data/mock";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function BillingPage() {
  const totalMinutes = timeEntries.reduce((s, t) => s + t.durationMinutes, 0);
  const totalValue = timeEntries.reduce(
    (s, t) => s + (t.durationMinutes / 60) * t.rateCents,
    0
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <span className="text-[12px] font-medium">Time & Billing</span>
        <div className="flex gap-1">
          <PillButton size="xs" variant="outline">
            Start timer
          </PillButton>
          <PillButton size="xs" variant="default">
            New entry
          </PillButton>
        </div>
      </div>

      <div className="p-3">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded border border-[var(--border)] px-3 py-2">
            <p className="text-[10px] text-[var(--text-muted)]">Total hours</p>
            <p className="text-[15px] font-semibold">{(totalMinutes / 60).toFixed(1)}</p>
          </div>
          <div className="rounded border border-[var(--border)] px-3 py-2">
            <p className="text-[10px] text-[var(--text-muted)]">Unbilled value</p>
            <p className="text-[15px] font-semibold">{formatCurrency(totalValue)}</p>
          </div>
          <div className="rounded border border-[var(--border)] px-3 py-2">
            <p className="text-[10px] text-[var(--text-muted)]">Pending approval</p>
            <p className="text-[15px] font-semibold">2</p>
          </div>
        </div>

        <Panel>
          <PanelHeader title="Time entries" />
          <DataTable
            headers={["Matter", "Description", "User", "Duration", "Rate", "Status", "Date"]}
            rows={timeEntries.map((t) => [
              t.matterRef,
              t.description,
              t.user,
              `${t.durationMinutes}m`,
              formatCurrency(t.rateCents) + "/hr",
              <StatusPill key={t.id} status={t.status} />,
              formatDate(t.entryDate),
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}
