import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useCreateKnowledgeItem, 
  useUpdateKnowledgeItem,
  KnowledgeItem,
  KnowledgeItemInputType,
  getGetKnowledgeItemQueryKey,
  getListKnowledgeItemsQueryKey,
  getListKnowledgeItemVersionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["template", "opinion", "guidance", "precedent"] as const),
  category: z.string().min(1, "Category is required"),
  tags: z.string().optional(),
  content: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function KnowledgeForm({
  item,
  onSuccess,
  onCancel,
}: {
  item?: KnowledgeItem;
  onSuccess: (id: number) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const createItem = useCreateKnowledgeItem();
  const updateItem = useUpdateKnowledgeItem();

  const isEditingApproved = item?.status === "approved";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: item?.title || "",
      type: (item?.type as KnowledgeItemInputType) || "template",
      category: item?.category || "",
      tags: item?.tags?.join(", ") || "",
      content: item?.content || "",
    },
  });

  const onSubmit = (values: FormValues) => {
    const tagsArray = values.tags
      ? values.tags.split(",").map(t => t.trim()).filter(Boolean)
      : [];

    if (item) {
      updateItem.mutate(
        {
          id: item.id,
          data: {
            title: values.title,
            type: values.type,
            category: values.category,
            tags: tagsArray,
            content: values.content,
            changeSummary: isEditingApproved ? "Edited after approval" : undefined,
          }
        },
        {
          onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: getGetKnowledgeItemQueryKey(item.id) });
            queryClient.invalidateQueries({ queryKey: getListKnowledgeItemsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListKnowledgeItemVersionsQueryKey(item.id) });
            toast({ title: "Item updated successfully" });
            onSuccess(data.id);
          },
          onError: (err: any) => {
            toast({ 
              title: "Error updating item", 
              description: err.response?.data?.error || err.message, 
              variant: "destructive" 
            });
          }
        }
      );
    } else {
      createItem.mutate(
        {
          data: {
            title: values.title,
            type: values.type,
            category: values.category,
            tags: tagsArray,
            content: values.content,
          }
        },
        {
          onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: getListKnowledgeItemsQueryKey() });
            toast({ title: "Item created successfully" });
            onSuccess(data.id);
          },
          onError: (err: any) => {
            toast({ 
              title: "Error creating item", 
              description: err.response?.data?.error || err.message, 
              variant: "destructive" 
            });
          }
        }
      );
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex flex-col h-full">
        {isEditingApproved && (
          <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-400">
            <AlertTriangle className="h-4 w-4 stroke-rose-400" />
            <AlertTitle className="text-[12px] uppercase tracking-wider font-semibold">Governance Warning</AlertTitle>
            <AlertDescription className="text-xs">
              Editing an approved item will bump its version, remove it from the AI index, and send it back to Pending Approval. 
              The current version will be preserved in history.
            </AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">Title</FormLabel>
              <FormControl>
                <Input placeholder="E.g. Master Services Agreement v2" className="bg-background border-border" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="template">Template</SelectItem>
                    <SelectItem value="precedent">Precedent</SelectItem>
                    <SelectItem value="opinion">Opinion</SelectItem>
                    <SelectItem value="guidance">Guidance</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">Category</FormLabel>
                <FormControl>
                  <Input placeholder="E.g. Commercial, Litigation" className="bg-background border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">Tags (comma separated)</FormLabel>
              <FormControl>
                <Input placeholder="E.g. msa, software, b2b" className="bg-background border-border" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem className="flex-1 flex flex-col min-h-[200px]">
              <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">Content</FormLabel>
              <FormControl className="flex-1">
                <Textarea 
                  placeholder="Paste or type the document content here..." 
                  className="resize-none font-mono text-xs bg-background border-border h-full flex-1" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" type="button" onClick={onCancel} className="text-xs uppercase tracking-wider">
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={createItem.isPending || updateItem.isPending}
            className="text-xs uppercase tracking-wider bg-gradient-to-r from-[#4169E1] to-[#00CFFF] hover:opacity-90 text-white border-0"
          >
            {item ? (updateItem.isPending ? "Saving..." : "Save Changes") : (createItem.isPending ? "Adding..." : "Add to Library")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
