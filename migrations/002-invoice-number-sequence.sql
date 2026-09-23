-- Apply before deploying the new invoice writer. Pause invoice writes during migration.
BEGIN;
LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS apz_invoice_number_seq;
SELECT setval('apz_invoice_number_seq', GREATEST(
  (SELECT COALESCE(MAX(substring(invoice_number FROM '^INV-[0-9]{4}-([0-9]+)$')::bigint),0) + 1 FROM invoices),
  (SELECT last_value FROM apz_invoice_number_seq)
), false);
COMMIT;
