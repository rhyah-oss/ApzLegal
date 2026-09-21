import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../lib/api-zod/src/index.ts", import.meta.url);
const current = await readFile(path, "utf8");
const repaired = current
  .replace(/\nexport \* from ['"]\.\/generated\/types['"];?\s*$/m, "\n")
  .replace(/^export \* from ['"]\.\/generated\/api['"];?\nexport \* from ['"]\.\/generated\/api['"];?\n/m, "export * from './generated/api';\n");
if (repaired !== current) await writeFile(path, repaired);