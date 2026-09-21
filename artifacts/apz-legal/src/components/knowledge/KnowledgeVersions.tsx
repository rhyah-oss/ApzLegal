import { useListKnowledgeItemVersions, KnowledgeItemVersion } from "@workspace/api-client-react";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Clock, User, CheckCircle2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TypeBadge } from "./KnowledgeBadges";

export function KnowledgeVersions({ itemId }: { itemId: number }) {
  const { data: versions, isLoading } = useListKnowledgeItemVersions(itemId);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground text-xs">
        No version history available.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] w-full">
      <div className="space-y-4 pr-4">
        <Accordion type="single" collapsible className="w-full">
          {versions.map((v) => (
            <AccordionItem key={v.id} value={`v${v.id}`} className="border-border">
              <AccordionTrigger className="hover:no-underline py-3 px-1">
                <div className="flex items-center gap-3 w-full text-left">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary shrink-0 font-mono text-[10px]">
                    v{v.version}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{v.title}</div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(v.createdAt), "dd MMM yyyy, HH:mm")}
                      </span>
                      {v.editedByName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {v.editedByName}
                        </span>
                      )}
                      {v.wasApproved && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Approved
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-4">
                <div className="space-y-4 bg-muted/20 p-4 rounded-md border border-border">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground uppercase tracking-wider block mb-1 text-[10px]">Type</span>
                      <TypeBadge type={v.type as any} />
                    </div>
                    <div>
                      <span className="text-muted-foreground uppercase tracking-wider block mb-1 text-[10px]">Category</span>
                      <div className="font-medium">{v.category}</div>
                    </div>
                  </div>
                  
                  {v.changeSummary && (
                    <div>
                      <span className="text-muted-foreground uppercase tracking-wider block mb-1 text-[10px]">Change Summary</span>
                      <div className="text-xs bg-muted/50 p-2 rounded italic text-muted-foreground">{v.changeSummary}</div>
                    </div>
                  )}

                  <div>
                    <span className="text-muted-foreground uppercase tracking-wider block mb-2 text-[10px]">Content</span>
                    <div className="text-xs font-mono whitespace-pre-wrap bg-background p-3 rounded-md border border-border max-h-[300px] overflow-y-auto">
                      {v.content || <span className="text-muted-foreground italic">No content</span>}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </ScrollArea>
  );
}
