CREATE TABLE trade_invoice_terms (
  company_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  discount_percent TEXT NOT NULL,
  allow_partial_discount INTEGER NOT NULL CHECK(allow_partial_discount IN (0,1)),
  PRIMARY KEY(company_id,item_id),
  FOREIGN KEY(company_id,item_id) REFERENCES open_items(company_id,item_id)
) WITHOUT ROWID;
-- The runner restores 010 terms from complete revision chains only when all
-- candidate discount semantics agree. Wall-clock timestamps are not ordering evidence.
CREATE TRIGGER trade_invoice_terms_no_update BEFORE UPDATE ON trade_invoice_terms BEGIN SELECT RAISE(ABORT,'immutable invoice terms'); END;
CREATE TRIGGER trade_invoice_terms_no_delete BEFORE DELETE ON trade_invoice_terms BEGIN SELECT RAISE(ABORT,'immutable invoice terms'); END;
CREATE TABLE trade_payments (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  payment_id TEXT NOT NULL CHECK(length(payment_id)=36),
  receipt_key TEXT NOT NULL CHECK(length(receipt_key)=36),
  command_hash TEXT NOT NULL CHECK(length(command_hash)=64),
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
  receipt TEXT NOT NULL CHECK(json_valid(receipt)),
  PRIMARY KEY(company_id,payment_id),
  UNIQUE(company_id,receipt_key)
) WITHOUT ROWID;
CREATE TRIGGER trade_payments_no_update BEFORE UPDATE ON trade_payments BEGIN SELECT RAISE(ABORT,'immutable trade payment'); END;
CREATE TRIGGER trade_payments_no_delete BEFORE DELETE ON trade_payments BEGIN SELECT RAISE(ABORT,'immutable trade payment'); END;
CREATE TRIGGER settlements_payment_source BEFORE INSERT ON settlements WHEN
  NEW.journal_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM trade_payments p
    JOIN journal_entries j ON j.company_id=p.company_id AND j.id=NEW.journal_id
    JOIN receipts r ON r.company_id=j.company_id AND r.idempotency_key=j.receipt_key
    JOIN open_items o ON o.company_id=p.company_id AND o.item_id=NEW.item_id
    WHERE p.company_id=NEW.company_id AND p.payment_id=NEW.settlement_id
      AND p.receipt_key=NEW.receipt_key AND json_extract(r.result,'$.module')='TRADE'
      AND j.source_ref='TRADE-PAY:'||p.payment_id AND o.side=NEW.side
      AND NEW.discount_minor<=NEW.applied_net_minor
  )
BEGIN SELECT RAISE(ABORT,'settlement requires trade payment source'); END;
CREATE INDEX open_items_due_page ON open_items(company_id,status,due_date,item_id);
