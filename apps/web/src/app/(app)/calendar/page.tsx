import { Panel, PanelHeader } from "@/components/ui/primitives";
import { calendarEvents } from "@/data/mock";
import { formatDate } from "@/lib/utils";

export default function CalendarPage() {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center border-b border-[var(--border)] px-3">
        <span className="text-[12px] font-medium">Calendar · June 2026</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_240px]">
        <Panel className="border-0 border-r border-[var(--border)]">
          <PanelHeader title="Month view" />
          <div className="grid grid-cols-7 gap-px bg-[var(--border)] p-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bg-[var(--bg-panel)] p-1 text-center text-[10px] text-[var(--text-muted)]">
                {d}
              </div>
            ))}
            {days.map((d) => (
              <div
                key={d}
                className={`min-h-[48px] bg-[var(--bg-panel)] p-1 text-[10px] ${
                  d === 12 ? "ring-1 ring-inset ring-[var(--text-primary)]" : ""
                }`}
              >
                {d}
                {calendarEvents
                  .filter((e) => new Date(e.date).getDate() === d)
                  .map((e) => (
                    <div
                      key={e.id}
                      className="mt-0.5 truncate rounded-full border border-[var(--border)] px-1 text-[9px]"
                    >
                      {e.title.slice(0, 20)}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="border-0">
          <PanelHeader title="Upcoming" />
          <div className="space-y-2 p-3">
            {calendarEvents.map((e) => (
              <div key={e.id} className="rounded border border-[var(--border)] p-2 text-[11px]">
                <p className="font-medium">{e.title}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {formatDate(e.date)} · {e.type}
                  {e.matterRef ? ` · ${e.matterRef}` : ""}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
