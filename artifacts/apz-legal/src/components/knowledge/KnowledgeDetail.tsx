import { useState } from "react";
import { format } from "date-fns";
import { 
  KnowledgeItem,
  useSubmitKnowledgeForReview,
  useArchiveKnowledgeItem,
  useDecideKnowledgeItem,
  getGetKnowledgeItemQueryKey,
  getListKnowledgeItemsQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { StatusBadge, AiIndexBadge, TypeBadge } from "./KnowledgeBadges";
import { KnowledgeVersions } from "./KnowledgeVersions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileText, History, Info, AlertTriangle, ShieldCheck, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

export function KnowledgeDetail({ 
  item, 
  onEdit, 
  onClose 
}: { 
  item: KnowledgeItem; 
  onEdit: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const submitForReview = useSubmitKnowledgeForReview();
  const archiveItem = useArchiveKnowledgeItem();
  const decideItem = useDecideKnowledgeItem();

  const [decisionDialog, setDecisionDialog] = useState<"approve" | "reject" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const isPartner = ["partner", "managing_partner", "admin"].includes(user?.role || "");
  const canDecide = item.status === "pending_approval" && isPartner;
  const canSubmit = item.status === "uploaded" || item.status === "rejected";
  const isArchived = item.status === "archived";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetKnowledgeItemQueryKey(item.id) });
    queryClient.invalidateQueries({ queryKey: getListKnowledgeItemsQueryKey() });
  };

  const handleAction = (
    action: any, 
    payload: any, 
    successMsg: string, 
    onSuccessCb?: () => void
  ) => {
    action.mutate(payload, {
      onSuccess: () => {
        invalidate();
        toast({ title: successMsg });
        onSuccessCb?.();
      },
      onError: (err: any) => {
        toast({ 
          title: "Action failed", 
          description: err.response?.data?.error || err.message, 
          variant: "destructive" 
        });
      }
    });
  };

  const handleSubmitReview = () => {
    handleAction(submitForReview, { id: item.id }, "Submitted for partner review");
  };

  const handleArchive = () => {
    if (confirm("Are you sure you want to archive this item? It will be removed from the AI index.")) {
      handleAction(archiveItem, { id: item.id }, "Item archived", onClose);
    }
  };

  const handleDecisionSubmit = () => {
    if (decisionDialog === "reject" && !decisionNote.trim()) {
      toast({ title: "Note required", description: "Please provide a reason for rejection.", variant: "destructive" });
      return;
    }
    handleAction(
      decideItem, 
      { id: item.id, data: { decision: decisionDialog!, note: decisionNote } },
      `Item ${decisionDialog}d successfully`,
      () => {
        setDecisionDialog(null);
        setDecisionNote("");
      }
    );
  };

  return (
    <div className="flex flex-col h-full bg-card/50 border-l border-border animate-in slide-in-from-right-8 duration-300">
      {/* Header Actions */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <TypeBadge type={item.type} />
          <span className="text-[10px] text-muted-foreground font-mono">v{item.version}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isArchived && (
            <>
              {canSubmit && (
                <Button variant="outline" size="sm" onClick={handleSubmitReview} className="text-xs uppercase tracking-wider h-7">
                  Submit for Review
                </Button>
              )}
              {canDecide && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setDecisionDialog("reject")} className="text-xs uppercase tracking-wider h-7 border-rose-500/50 text-rose-400 hover:bg-rose-500/10">
                    Reject
                  </Button>
                  <Button variant="default" size="sm" onClick={() => setDecisionDialog("approve")} className="text-xs uppercase tracking-wider h-7 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50">
                    Approve
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={onEdit} className="text-xs uppercase tracking-wider h-7">
                Edit
              </Button>
              {isPartner && (
                <Button variant="ghost" size="sm" onClick={handleArchive} className="text-xs uppercase tracking-wider h-7 text-muted-foreground hover:text-destructive">
                  Archive
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 rounded-sm shrink-0">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          
          <div>
            <h2 className="text-xl font-semibold leading-tight text-foreground mb-3">{item.title}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={item.status} />
              <AiIndexBadge status={item.aiIndexStatus} available={item.availableToAi} />
            </div>
          </div>

          {item.status === "rejected" && item.reviewNote && (
            <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-400">
              <AlertTriangle className="h-4 w-4 stroke-rose-400" />
              <AlertTitle className="text-[12px] uppercase tracking-wider font-semibold">Rejected by {item.reviewedByName || 'Partner'}</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                {item.reviewNote}
              </AlertDescription>
            </Alert>
          )}

          {item.status === "approved" && (
            <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="h-4 w-4 stroke-emerald-400" />
              <AlertTitle className="text-[12px] uppercase tracking-wider font-semibold">Approved by {item.approvedByName}</AlertTitle>
              <AlertDescription className="text-xs mt-1 flex items-center gap-2">
                <span>{item.approvedAt && format(new Date(item.approvedAt), "dd MMM yyyy, HH:mm")}</span>
                {item.reviewNote && <span className="opacity-80">— {item.reviewNote}</span>}
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="content" className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto">
              <TabsTrigger value="content" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 text-xs uppercase tracking-wider">
                <FileText className="h-3.5 w-3.5 mr-2" /> Content
              </TabsTrigger>
              <TabsTrigger value="meta" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 text-xs uppercase tracking-wider">
                <Info className="h-3.5 w-3.5 mr-2" /> Details
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 text-xs uppercase tracking-wider">
                <History className="h-3.5 w-3.5 mr-2" /> History
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="content" className="pt-4 outline-none">
              <div className="bg-background rounded-md border border-border p-4">
                {item.content ? (
                  <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground break-words font-medium">
                    {item.content}
                  </pre>
                ) : (
                  <div className="text-center py-10 text-muted-foreground text-xs italic">
                    No content provided.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="meta" className="pt-4 outline-none">
              <div className="grid grid-cols-2 gap-y-6 gap-x-4 bg-background p-4 rounded-md border border-border">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Category</span>
                  <div className="text-xs font-medium">{item.category}</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {item.tags?.length ? item.tags.map(t => (
                      <span key={t} className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded">{t}</span>
                    )) : <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Uploaded By</span>
                  <div className="text-xs font-medium">{item.authorName || "Unknown"}</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Created At</span>
                  <div className="text-xs">{format(new Date(item.createdAt), "dd MMM yyyy, HH:mm")}</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">AI Indexed At</span>
                  <div className="text-xs">{item.aiIndexedAt ? format(new Date(item.aiIndexedAt), "dd MMM yyyy, HH:mm") : "—"}</div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="pt-4 outline-none">
              <KnowledgeVersions itemId={item.id} />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      <Dialog open={!!decisionDialog} onOpenChange={(o) => !o && setDecisionDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-sm uppercase tracking-wider">
              {decisionDialog === "approve" ? "Approve Item" : "Reject Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={decisionDialog === "reject" ? "Reason for rejection (required)..." : "Optional note..."}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              className="text-xs resize-none"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDecisionDialog(null)} className="text-xs uppercase tracking-wider">
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleDecisionSubmit} 
              disabled={decideItem.isPending}
              className={`text-xs uppercase tracking-wider text-white ${decisionDialog === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
            >
              {decideItem.isPending ? "Submitting..." : decisionDialog === "approve" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
