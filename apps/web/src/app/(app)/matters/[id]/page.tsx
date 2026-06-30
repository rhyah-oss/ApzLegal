"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  PanelGroup,
  ResizablePanel,
  PanelResizeHandle,
} from "@/components/ui/resizable";
import { Panel, PanelHeader, StatusPill, PillButton, PillChip, MicroLabel } from "@/components/ui/primitives";
import { CitationInline } from "@/components/shell/citation-panel";
import { PageHeader, Workbench, WorkbenchBody } from "@/components/shell/page-header";
import {
  getMatter,
  getMatterDocuments,
  parties,
  aiMessages,
  emailThreads,
  tasks,
} from "@/data/mock";
import { formatDate } from "@/lib/utils";
import { FileText, Mail, CheckSquare, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const matterTabs = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "emails", label: "Emails" },
  { id: "tasks", label: "Tasks" },
];

export default function MatterWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("overview");
  const matter = getMatter(id);
  const docs = getMatterDocuments(id);
  const matterParties = parties[id] ?? [];
  const matterEmails = emailThreads.filter((e) => e.matterId === id);
  const matterTasks = tasks.filter((t) => matter && t.matterRef === matter.reference);
  const lastAi = aiMessages.find((m) => m.role === "assistant");

  if (!matter) {
    return (
      <Workbench>
        <PageHeader title="Matter not found" />
        <WorkbenchBody className="flex items-center justify-center">
          <Link href="/matters" className="text-[12px] text-[var(--text-secondary)] hover:underline">
            ← Back to matters
          </Link>
        </WorkbenchBody>
      </Workbench>
    );
  }

  return (
    <Workbench>
      <PageHeader
        title={matter.reference}
        subtitle={matter.title}
        tabs={matterTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={
          <>
            <StatusPill status={matter.status} />
            <PillChip active>{matter.practiceArea}</PillChip>
            <PillButton size="xs" variant="default">
              Submit for review
            </PillButton>
          </>
        }
      />

      <WorkbenchBody flush className="flex min-h-0 flex-1 flex-col">
        <PanelGroup orientation="horizontal" id={`matter-${id}`} className="min-h-0 flex-1">
          <ResizablePanel defaultSize={22} minSize={16} maxSize={32}>
            <Panel flush className="h-full border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
              <PanelHeader title="Matter tree" subtitle={matter.client} />
              <div className="flex-1 overflow-y-auto p-2 text-[11px]">
                <NavSection icon={FileText} label="Documents" count={docs.length}>
                  {docs.map((d) => (
                    <TreeItem key={d.id} label={d.name} meta={d.folder} />
                  ))}
                </NavSection>
                <NavSection icon={Mail} label="Emails" count={matterEmails.length}>
                  {matterEmails.map((e) => (
                    <TreeItem key={e.id} label={e.subject} meta={formatDate(e.date)} />
                  ))}
                </NavSection>
                <NavSection icon={CheckSquare} label="Tasks" count={matterTasks.length}>
                  {matterTasks.map((t) => (
                    <TreeItem
                      key={t.id}
                      label={t.title}
                      meta={formatDate(t.dueAt)}
                      muted={t.done}
                    />
                  ))}
                </NavSection>
              </div>
            </Panel>
          </ResizablePanel>

          <PanelResizeHandle />

          <ResizablePanel defaultSize={48} minSize={35}>
            <Panel flush className="h-full">
              <PanelHeader
                title="Heads of Argument — Draft.docx"
                subtitle="Pleadings · Last edited today"
                action={
                  <div className="flex gap-1">
                    <PillButton size="xs" variant="ghost">
                      Edit
                    </PillButton>
                    <PillButton size="xs" variant="outline">
                      Preview
                    </PillButton>
                  </div>
                }
              />
              <div className="flex-1 overflow-y-auto bg-[var(--bg-panel)] p-5">
                <div className="mx-auto max-w-2xl font-mono text-[12px] leading-[1.7] text-[var(--text-primary)]">
                  <p className="mb-4 font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    Document preview
                  </p>
                  <p>IN THE LABOUR COURT OF SOUTH AFRICA</p>
                  <p>JOHANNESBURG</p>
                  <p className="my-4">Case no: J124/2024</p>
                  <p>
                    In the matter between:
                    <br />
                    SIBUSISO NKOSI · Applicant
                    <br />
                    and
                    <br />
                    TRANSVAAL LOGISTICS (PTY) LTD · Respondent
                  </p>
                  <p className="my-4 font-sans text-[13px] font-semibold">
                    HEADS OF ARGUMENT ON BEHALF OF THE APPLICANT
                  </p>
                  <p className="mb-3">
                    1. This matter concerns an automatically unfair dismissal pursuant to section
                    187(1)(f) of the Labour Relations Act 66 of 1995.
                  </p>
                  <p>
                    2. The applicant participated in a protected strike on 14–16 January 2026. The
                    employer&apos;s stated reason for dismissal — gross insubordination — is
                    inconsistent with the timeline of events documented in Exhibit C.
                  </p>
                </div>
              </div>
            </Panel>
          </ResizablePanel>

          <PanelResizeHandle />

          <ResizablePanel defaultSize={30} minSize={22} maxSize={40}>
            <Panel flush className="h-full border-l border-[var(--border)] bg-[var(--bg-sidebar)]">
              <PanelHeader title="Matter context" subtitle="AI · Citations" />
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                <section className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-panel)] p-3">
                  <MicroLabel>Parties</MicroLabel>
                  <ul className="mt-2 space-y-1">
                    {matterParties.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2 text-[11px]">
                        <span className="truncate text-[var(--text-primary)]">{p.name}</span>
                        <span className="shrink-0 capitalize text-[var(--text-muted)]">
                          {p.role.replace("_", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                {lastAi ? (
                  <section>
                    <MicroLabel>Latest AI insight</MicroLabel>
                    <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {lastAi.content.slice(0, 240)}…
                    </p>
                    {lastAi.citations ? (
                      <CitationInline citations={lastAi.citations} />
                    ) : null}
                  </section>
                ) : null}

                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                  <Clock className="h-3 w-3" />
                  {matter.nextDeadline
                    ? `Next deadline ${formatDate(matter.nextDeadline)}`
                    : "No upcoming deadline"}
                </div>

                <Link href="/ai">
                  <PillButton size="sm" variant="default" className="w-full">
                    Open Legal AI
                  </PillButton>
                </Link>
              </div>
            </Panel>
          </ResizablePanel>
        </PanelGroup>
      </WorkbenchBody>
    </Workbench>
  );
}

function NavSection({
  icon: Icon,
  label,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        <Icon className="h-3 w-3" />
        {label}
        <span className="ml-auto tabular-nums">{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function TreeItem({
  label,
  meta,
  muted,
}: {
  label: string;
  meta?: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-full px-2 py-1 text-left transition-colors hover:bg-[var(--bg-hover)]",
        muted && "opacity-50 line-through"
      )}
    >
      <span className="min-w-0 truncate text-[11px] text-[var(--text-primary)]">{label}</span>
      {meta ? (
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{meta}</span>
      ) : null}
    </button>
  );
}
