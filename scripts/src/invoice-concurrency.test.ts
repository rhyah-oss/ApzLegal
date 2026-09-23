import { describe, it } from "node:test";
import assert from "node:assert/strict";
import pg from "../../lib/db/node_modules/pg/esm/index.mjs";

const testUrl = process.env.APZ_TEST_DATABASE_URL;
const enabled = process.env.APZ_TEST_DATABASE_DISPOSABLE === "1" && !!testUrl && /^apz_test_[a-z0-9_]+$/i.test(new URL(testUrl).pathname.slice(1));

describe("M invoice number concurrency", () => {
  it("allocates distinct invoice numbers under concurrent transactions", { skip: !enabled }, async () => {
    process.env.DATABASE_URL ||= testUrl!;
    const { nextInvoiceNumber } = await import("../../artifacts/api-server/src/routes/billing");
    const pool = new pg.Pool({ connectionString: testUrl, max: 16 });
    const schema = `invoice_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(`CREATE SEQUENCE "${schema}".apz_invoice_number_seq`);
      await pool.query(`CREATE TABLE "${schema}".invoices (id serial PRIMARY KEY, invoice_number text UNIQUE NOT NULL)`);
      const numbers = await Promise.all(Array.from({ length: 24 }, async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL search_path TO "${schema}"`);
          const tx = drizzle(client);
          const number = await nextInvoiceNumber(tx);
          await client.query("INSERT INTO invoices (invoice_number) VALUES ($1)", [number]);
          await client.query("COMMIT");
          return number;
        } finally { client.release(); }
      }));
      assert.equal(new Set(numbers).size, numbers.length);
      const stored = await pool.query(`SELECT count(*)::int AS count FROM "${schema}".invoices`);
      assert.equal(Number(stored.rows[0].count), numbers.length);
    } finally {
      await pool.end();
    }
  });
});
