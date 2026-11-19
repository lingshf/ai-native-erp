CREATE TABLE trade_item_sources (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  item_id TEXT NOT NULL CHECK(length(item_id)=36),
  kind TEXT NOT NULL CHECK(kind IN ('invoice','advance','credit')),
  external_no TEXT NOT NULL,
  journal_id TEXT NOT NULL,
  original_id TEXT,
  CHECK((kind='credit')=(original_id IS NOT NULL)),
  PRIMARY KEY(company_id,item_id),
  FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id),
  FOREIGN KEY(company_id,original_id) REFERENCES trade_documents(company_id,document_id)
) WITHOUT ROWID;
INSERT INTO trade_item_sources SELECT company_id,document_id,'invoice',external_no,journal_id,NULL FROM trade_documents;
CREATE TRIGGER trade_documents_item_source AFTER INSERT ON trade_documents BEGIN
  INSERT INTO trade_item_sources VALUES(NEW.company_id,NEW.document_id,'invoice',NEW.external_no,NEW.journal_id,NULL);
END;

CREATE TABLE open_items_next (
  company_id TEXT NOT NULL,
  item_id TEXT NOT NULL CHECK(length(item_id)=36),
  side TEXT NOT NULL CHECK(side IN ('AP','AR')),
  party_id TEXT NOT NULL,
  control_account TEXT NOT NULL,
  dimensions TEXT NOT NULL CHECK(json_valid(dimensions) AND json_type(dimensions)='object'),
  currency TEXT NOT NULL CHECK(length(currency)=3 AND currency GLOB '[A-Z][A-Z][A-Z]'),
  accounting_date TEXT NOT NULL CHECK(length(accounting_date)=10),
  document_date TEXT NOT NULL CHECK(length(document_date)=10),
  due_date TEXT NOT NULL CHECK(length(due_date)=10),
  discount_date TEXT NOT NULL CHECK(length(discount_date)=10 AND discount_date<=due_date),
  gross_minor INTEGER NOT NULL CHECK(typeof(gross_minor)='integer' AND gross_minor>0 AND gross_minor=net_minor+tax_minor),
  net_minor INTEGER NOT NULL CHECK(typeof(net_minor)='integer' AND net_minor>=0),
  tax_minor INTEGER NOT NULL CHECK(typeof(tax_minor)='integer' AND tax_minor>=0),
  remaining_gross_minor INTEGER NOT NULL CHECK(typeof(remaining_gross_minor)='integer' AND remaining_gross_minor BETWEEN 0 AND gross_minor AND remaining_gross_minor=remaining_net_minor+remaining_tax_minor),
  remaining_net_minor INTEGER NOT NULL CHECK(typeof(remaining_net_minor)='integer' AND remaining_net_minor BETWEEN 0 AND net_minor),
  remaining_tax_minor INTEGER NOT NULL CHECK(typeof(remaining_tax_minor)='integer' AND remaining_tax_minor BETWEEN 0 AND tax_minor),
  status TEXT NOT NULL CHECK(status IN ('open','settled','cancelled') AND (status='open')=(remaining_gross_minor>0)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY(company_id,item_id),
  FOREIGN KEY(company_id,item_id) REFERENCES trade_item_sources(company_id,item_id),
  FOREIGN KEY(company_id,party_id) REFERENCES trade_parties(company_id,code),
  FOREIGN KEY(company_id,control_account) REFERENCES accounts(company_id,code)
) WITHOUT ROWID;
INSERT INTO open_items_next SELECT * FROM open_items;
CREATE TEMP TABLE saved_trade_terms AS SELECT * FROM trade_invoice_terms;
CREATE TEMP TABLE saved_trade_settlements AS SELECT * FROM settlements;
DROP TABLE trade_invoice_terms;
DROP TABLE settlements;
DROP TABLE open_items;
ALTER TABLE open_items_next RENAME TO open_items;
CREATE INDEX open_items_party_due ON open_items(company_id,party_id,status,due_date);
CREATE INDEX open_items_due_page ON open_items(company_id,status,due_date,item_id);
CREATE TRIGGER open_items_no_delete BEFORE DELETE ON open_items BEGIN SELECT RAISE(ABORT,'immutable open item'); END;
CREATE TRIGGER open_items_balance_only BEFORE UPDATE ON open_items WHEN
  NEW.company_id IS NOT OLD.company_id OR NEW.item_id IS NOT OLD.item_id OR NEW.side IS NOT OLD.side OR
  NEW.party_id IS NOT OLD.party_id OR NEW.control_account IS NOT OLD.control_account OR
  NEW.dimensions IS NOT OLD.dimensions OR NEW.currency IS NOT OLD.currency OR
  NEW.accounting_date IS NOT OLD.accounting_date OR NEW.document_date IS NOT OLD.document_date OR
  NEW.due_date IS NOT OLD.due_date OR NEW.discount_date IS NOT OLD.discount_date OR
  NEW.gross_minor IS NOT OLD.gross_minor OR NEW.net_minor IS NOT OLD.net_minor OR
  NEW.tax_minor IS NOT OLD.tax_minor OR NEW.revision IS NOT OLD.revision+1
BEGIN SELECT RAISE(ABORT,'open item identity is immutable'); END;
CREATE TABLE trade_invoice_terms (
  company_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  discount_percent TEXT NOT NULL,
  allow_partial_discount INTEGER NOT NULL CHECK(allow_partial_discount IN (0,1)),
  PRIMARY KEY(company_id,item_id),
  FOREIGN KEY(company_id,item_id) REFERENCES open_items(company_id,item_id)
) WITHOUT ROWID;
INSERT INTO trade_invoice_terms SELECT * FROM saved_trade_terms;
DROP TABLE saved_trade_terms;
CREATE TRIGGER trade_invoice_terms_no_update BEFORE UPDATE ON trade_invoice_terms BEGIN SELECT RAISE(ABORT,'immutable invoice terms'); END;
CREATE TRIGGER trade_invoice_terms_no_delete BEFORE DELETE ON trade_invoice_terms BEGIN SELECT RAISE(ABORT,'immutable invoice terms'); END;
CREATE TABLE settlements (
  company_id TEXT NOT NULL,
  settlement_id TEXT NOT NULL CHECK(length(settlement_id)=36),
  item_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('AP','AR')),
  accounting_date TEXT NOT NULL CHECK(length(accounting_date)=10),
  applied_gross_minor INTEGER NOT NULL CHECK(typeof(applied_gross_minor)='integer' AND applied_gross_minor>0 AND applied_gross_minor=applied_net_minor+applied_tax_minor),
  applied_net_minor INTEGER NOT NULL CHECK(typeof(applied_net_minor)='integer' AND applied_net_minor>=0),
  applied_tax_minor INTEGER NOT NULL CHECK(typeof(applied_tax_minor)='integer' AND applied_tax_minor>=0),
  discount_minor INTEGER NOT NULL CHECK(typeof(discount_minor)='integer' AND discount_minor>=0),
  receipt_key TEXT NOT NULL,
  journal_id TEXT,
  recorded_at TEXT NOT NULL CHECK(length(recorded_at)=24 AND recorded_at GLOB '????-??-??T??:??:??.???Z'),
  PRIMARY KEY(company_id,settlement_id,item_id),
  FOREIGN KEY(company_id,item_id) REFERENCES open_items(company_id,item_id),
  FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id)
) WITHOUT ROWID;
INSERT INTO settlements SELECT * FROM saved_trade_settlements;
DROP TABLE saved_trade_settlements;
CREATE INDEX settlements_item ON settlements(company_id,item_id,accounting_date);
CREATE TRIGGER settlements_no_update BEFORE UPDATE ON settlements BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER settlements_no_delete BEFORE DELETE ON settlements BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
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

CREATE TABLE trade_actions (
  sequence INTEGER PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  action_id TEXT NOT NULL CHECK(length(action_id)=36),
  kind TEXT NOT NULL CHECK(kind IN ('advance','credit','apply','cancel','reverse')),
  related_id TEXT,
  accounting_date TEXT NOT NULL CHECK(length(accounting_date)=10),
  receipt_key TEXT NOT NULL,
  command_hash TEXT NOT NULL CHECK(length(command_hash)=64),
  record TEXT NOT NULL CHECK(json_valid(record)),
  UNIQUE(company_id,action_id),
  UNIQUE(company_id,receipt_key),
  FOREIGN KEY(company_id,receipt_key) REFERENCES receipts(company_id,idempotency_key)
);
CREATE UNIQUE INDEX trade_actions_undo ON trade_actions(company_id,kind,related_id) WHERE kind IN ('cancel','reverse');
CREATE INDEX trade_documents_order_events ON trade_documents(company_id,order_id,accounting_date);
CREATE TABLE trade_action_items (
  company_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY(company_id,action_id,item_id),
  FOREIGN KEY(company_id,action_id) REFERENCES trade_actions(company_id,action_id),
  FOREIGN KEY(company_id,item_id) REFERENCES open_items(company_id,item_id)
) WITHOUT ROWID;
CREATE INDEX trade_action_items_item ON trade_action_items(company_id,item_id,action_id);
CREATE TABLE trade_credit_lines (
  company_id TEXT NOT NULL,
  credit_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  source_line_id TEXT NOT NULL,
  quantity TEXT NOT NULL,
  net_minor INTEGER NOT NULL CHECK(net_minor>=0),
  tax_minor INTEGER NOT NULL CHECK(tax_minor>=0),
  deductible_tax_minor INTEGER NOT NULL CHECK(deductible_tax_minor BETWEEN 0 AND tax_minor),
  PRIMARY KEY(company_id,credit_id,source_line_id),
  FOREIGN KEY(company_id,credit_id) REFERENCES trade_item_sources(company_id,item_id),
  FOREIGN KEY(company_id,invoice_id,source_line_id) REFERENCES trade_document_lines(company_id,document_id,line_id)
) WITHOUT ROWID;
CREATE INDEX trade_credit_lines_source ON trade_credit_lines(company_id,invoice_id,source_line_id,credit_id);
CREATE TRIGGER trade_item_sources_no_update BEFORE UPDATE ON trade_item_sources BEGIN SELECT RAISE(ABORT,'immutable trade source'); END;
CREATE TRIGGER trade_item_sources_no_delete BEFORE DELETE ON trade_item_sources BEGIN SELECT RAISE(ABORT,'immutable trade source'); END;
CREATE TRIGGER trade_actions_no_update BEFORE UPDATE ON trade_actions BEGIN SELECT RAISE(ABORT,'immutable trade action'); END;
CREATE TRIGGER trade_actions_no_delete BEFORE DELETE ON trade_actions BEGIN SELECT RAISE(ABORT,'immutable trade action'); END;
CREATE TRIGGER trade_action_items_no_update BEFORE UPDATE ON trade_action_items BEGIN SELECT RAISE(ABORT,'immutable trade link'); END;
CREATE TRIGGER trade_action_items_no_delete BEFORE DELETE ON trade_action_items BEGIN SELECT RAISE(ABORT,'immutable trade link'); END;
CREATE TRIGGER trade_credit_lines_no_update BEFORE UPDATE ON trade_credit_lines BEGIN SELECT RAISE(ABORT,'immutable credit line'); END;
CREATE TRIGGER trade_credit_lines_no_delete BEFORE DELETE ON trade_credit_lines BEGIN SELECT RAISE(ABORT,'immutable credit line'); END;
CREATE TABLE trade_control_segments (
  company_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  dimension_key TEXT NOT NULL CHECK(json_valid(dimension_key) AND json_type(dimension_key)='object'),
  gross_minor INTEGER NOT NULL CHECK(typeof(gross_minor)='integer' AND gross_minor>0),
  remaining_gross_minor INTEGER NOT NULL CHECK(typeof(remaining_gross_minor)='integer' AND remaining_gross_minor BETWEEN 0 AND gross_minor),
  PRIMARY KEY(company_id,item_id,dimension_key),
  FOREIGN KEY(company_id,item_id) REFERENCES open_items(company_id,item_id)
) WITHOUT ROWID;
INSERT INTO trade_control_segments
  SELECT o.company_id,o.item_id,
    (SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(o.dimensions) ORDER BY key COLLATE BINARY)),
    o.gross_minor,o.remaining_gross_minor FROM open_items o;
CREATE TRIGGER trade_control_segments_no_delete BEFORE DELETE ON trade_control_segments BEGIN SELECT RAISE(ABORT,'immutable control segment'); END;
CREATE TRIGGER trade_control_segments_balance_only BEFORE UPDATE ON trade_control_segments WHEN
  NEW.company_id IS NOT OLD.company_id OR NEW.item_id IS NOT OLD.item_id OR
  NEW.dimension_key IS NOT OLD.dimension_key OR NEW.gross_minor IS NOT OLD.gross_minor
BEGIN SELECT RAISE(ABORT,'immutable control segment identity'); END;
