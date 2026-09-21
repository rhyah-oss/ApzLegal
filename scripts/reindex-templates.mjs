import { db } from "@workspace/db";
import { knowledgeItemsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { reindexKnowledgeItem } from "../artifacts/api-server/src/lib/indexing-service.ts";

async function main() {
  const items = await db.select().from(knowledgeItemsTable).where(inArray(knowledgeItemsTable.id, [9, 10, 11]));
  for (const item of items) {
    console.log(`Re-indexing template ${item.id}: ${item.title} (subtype: ${item.documentSubtype})`);
    const result = await reindexKnowledgeItem(item.id);
    console.log(`  Result: ${result.chunksIndexed}/${result.chunksCreated} chunks (${result.status})`);
    if (result.error) console.log(`  Error: ${result.error}`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });