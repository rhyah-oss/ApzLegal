import { toast } from "../hooks/use-toast";

export async function runAsyncAction(action: () => Promise<unknown>): Promise<void> {
  try { await action(); }
  catch { toast({ title: "Action failed", description: "Please check your connection and try again.", variant: "destructive" }); }
}
