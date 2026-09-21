import { KnowledgeItemStatus, KnowledgeItemAiIndexStatus, KnowledgeItemType } from "@workspace/api-client-react";
import { CheckCircle2, Clock, XCircle, Archive, UploadCloud, Database, Cpu, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status?: KnowledgeItemStatus; className?: string }) {
  if (!status) return null;

  const config: Record<KnowledgeItemStatus, { label: string; icon: any; className: string }> = {
    uploaded: { label: "Uploaded", icon: UploadCloud, className: "text-neutral-400 bg-neutral-500/10 border-neutral-500/20" },
    pending_approval: { label: "Pending Approval", icon: Clock, className: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    approved: { label: "Approved", icon: CheckCircle2, className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    rejected: { label: "Rejected", icon: XCircle, className: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
    archived: { label: "Archived", icon: Archive, className: "text-neutral-500 bg-neutral-500/10 border-neutral-500/20" },
  };

  const c = config[status];
  const Icon = c.icon;

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider", c.className, className)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </div>
  );
}

export function AiIndexBadge({ status, available }: { status?: KnowledgeItemAiIndexStatus; available?: boolean }) {
  if (!status || status === "none") return null;

  const config: Record<KnowledgeItemAiIndexStatus, { label: string; icon: any; className: string }> = {
    none: { label: "Not Indexed", icon: Database, className: "text-neutral-500 bg-neutral-500/10 border-neutral-500/20" },
    indexing: { label: "Indexing...", icon: Cpu, className: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20 animate-pulse" },
    indexed: { label: available ? "Available to AI" : "Indexed (Inactive)", icon: Search, className: available ? "text-[#00CFFF] bg-[#00CFFF]/10 border-[#00CFFF]/20" : "text-neutral-400 bg-neutral-500/10 border-neutral-500/20" },
  };

  const c = config[status];
  const Icon = c.icon;

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider", c.className)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </div>
  );
}

export function TypeBadge({ type, className }: { type: KnowledgeItemType; className?: string }) {
  const config: Record<KnowledgeItemType, { label: string; className: string }> = {
    template: { label: "Template", className: "text-[#6B8FBB] bg-[#6B8FBB]/10 border-[#6B8FBB]/20" },
    precedent: { label: "Precedent", className: "text-[#4169E1] bg-[#4169E1]/10 border-[#4169E1]/20" },
    opinion: { label: "Opinion", className: "text-[#00CFFF] bg-[#00CFFF]/10 border-[#00CFFF]/20" },
    guidance: { label: "Guidance", className: "text-[#4A6B9A] bg-[#4A6B9A]/10 border-[#4A6B9A]/20" },
  };

  const c = config[type];
  if (!c) return null;

  return (
    <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider", c.className, className)}>
      {c.label}
    </div>
  );
}
