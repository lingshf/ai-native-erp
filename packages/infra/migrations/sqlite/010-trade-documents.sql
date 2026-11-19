CREATE TABLE trade_orders (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  order_id TEXT NOT NULL CHECK(length(order_id) BETWEEN 1 AND 60),
  side TEXT NOT NULL CHECK(side IN ('AP','AR')),
  party_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3 AND currency GLOB '[A-Z][A-Z][A-Z]'),
  order_date TEXT NOT NULL CHECK(length(order_date)=10),
  price_includes_tax INTEGER NOT NULL CHECK(price_includes_tax IN (0,1)),
  rounding_mode TEXT NOT NULL CHECK(rounding_mode IN ('line','document')),
  command_hash TEXT NOT NULL CHECK(length(command_hash)=64 AND command_hash NOT GLOB '*[^0-9a-f]*'),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at)=24 AND recorded_at GLOB '????-??-??T??:??:??.???Z'),
  PRIMARY KEY(company_id,order_id),
  FOREIGN KEY(company_id,party_id) REFERENCES trade_parties(company_id,code)
) WITHOUT ROWID;
CREATE TABLE trade_order_lines (
  company_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  line_id TEXT NOT NULL CHECK(length(line_id) BETWEEN 1 AND 60),
  line_no INTEGER NOT NULL CHECK(typeof(line_no)='integer' AND line_no BETWEEN 1 AND 100),
  product_id TEXT NOT NULL,
  tax_code TEXT NOT NULL,
  quantity TEXT NOT NULL,
  unit_price TEXT NOT NULL,
  discount_percent TEXT NOT NULL,
  taxable_charge TEXT NOT NULL,
  net_minor INTEGER NOT NULL CHECK(typeof(net_minor)='integer' AND net_minor>=0),
  tax_minor INTEGER NOT NULL CHECK(typeof(tax_minor)='integer' AND tax_minor>=0),
  gross_minor INTEGER NOT NULL CHECK(typeof(gross_minor)='integer' AND gross_minor=net_minor+tax_minor),
  PRIMARY KEY(company_id,order_id,line_id),
  UNIQUE(company_id,order_id,line_no),
  FOREIGN KEY(company_id,order_id) REFERENCES trade_orders(company_id,order_id),
  FOREIGN KEY(company_id,product_id) REFERENCES trade_products(company_id,code),
  FOREIGN KEY(company_id,tax_code) REFERENCES trade_tax_codes(company_id,code)
) WITHOUT ROWID;
CREATE TABLE trade_documents (
  sequence INTEGER PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  document_id TEXT NOT NULL CHECK(length(document_id)=36),
  kind TEXT NOT NULL CHECK(kind='invoice'),
  side TEXT NOT NULL CHECK(side IN ('AP','AR')),
  party_id TEXT NOT NULL,
  external_no TEXT NOT NULL CHECK(length(external_no) BETWEEN 1 AND 100),
  external_no_normalized TEXT NOT NULL CHECK(length(external_no_normalized) BETWEEN 1 AND 100),
  currency TEXT NOT NULL CHECK(length(currency)=3 AND currency GLOB '[A-Z][A-Z][A-Z]'),
  accounting_date TEXT NOT NULL CHECK(length(accounting_date)=10),
  document_date TEXT NOT NULL CHECK(length(document_date)=10),
  tax_date TEXT NOT NULL CHECK(length(tax_date)=10),
  due_date TEXT NOT NULL CHECK(length(due_date)=10 AND due_date>=document_date),
  order_id TEXT,
  po_match TEXT NOT NULL CHECK(po_match IN ('notApplicable','matched','exception')),
  exception_reason TEXT CHECK(exception_reason IS NULL OR length(trim(exception_reason)) BETWEEN 1 AND 160),
  net_minor INTEGER NOT NULL CHECK(typeof(net_minor)='integer' AND net_minor>=0),
  tax_minor INTEGER NOT NULL CHECK(typeof(tax_minor)='integer' AND tax_minor>=0),
  gross_minor INTEGER NOT NULL CHECK(typeof(gross_minor)='integer' AND gross_minor>0 AND gross_minor=net_minor+tax_minor),
  journal_id TEXT NOT NULL,
  receipt_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  command_hash TEXT NOT NULL CHECK(length(command_hash)=64 AND command_hash NOT GLOB '*[^0-9a-f]*'),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot) AND length(CAST(snapshot AS BLOB))<=262144),
  posted_at TEXT NOT NULL CHECK(length(posted_at)=24 AND posted_at GLOB '????-??-??T??:??:??.???Z'),
  UNIQUE(company_id,document_id),
  UNIQUE(company_id,receipt_key),
  CHECK((order_id IS NULL)=(po_match='notApplicable')),
  CHECK((po_match='exception')=(exception_reason IS NOT NULL)),
  FOREIGN KEY(company_id,party_id) REFERENCES trade_parties(company_id,code),
  FOREIGN KEY(company_id,order_id) REFERENCES trade_orders(company_id,order_id),
  FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id)
);
CREATE UNIQUE INDEX trade_documents_external ON trade_documents(company_id,party_id,external_no_normalized);
CREATE INDEX trade_documents_company ON trade_documents(company_id,sequence);
CREATE TABLE trade_document_lines (
  company_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  line_id TEXT NOT NULL CHECK(length(line_id) BETWEEN 1 AND 60),
  line_no INTEGER NOT NULL CHECK(typeof(line_no)='integer' AND line_no BETWEEN 1 AND 100),
  product_id TEXT NOT NULL,
  account TEXT NOT NULL,
  tax_code TEXT NOT NULL,
  tax_rate_id TEXT NOT NULL,
  rate_percent TEXT NOT NULL,
  quantity TEXT NOT NULL,
  quantity_micros INTEGER NOT NULL CHECK(typeof(quantity_micros)='integer' AND quantity_micros>0),
  unit_price TEXT NOT NULL,
  discount_percent TEXT NOT NULL,
  taxable_charge TEXT NOT NULL,
  net_minor INTEGER NOT NULL CHECK(typeof(net_minor)='integer' AND net_minor>=0),
  tax_minor INTEGER NOT NULL CHECK(typeof(tax_minor)='integer' AND tax_minor>=0),
  gross_minor INTEGER NOT NULL CHECK(typeof(gross_minor)='integer' AND gross_minor=net_minor+tax_minor),
  deductible_tax_minor INTEGER NOT NULL CHECK(typeof(deductible_tax_minor)='integer' AND deductible_tax_minor BETWEEN 0 AND tax_minor),
  order_id TEXT,
  order_line_id TEXT,
  expected_net_minor INTEGER CHECK(expected_net_minor IS NULL OR (typeof(expected_net_minor)='integer' AND expected_net_minor>=0)),
  match_status TEXT NOT NULL CHECK(match_status IN ('notApplicable','matched','exception')),
  PRIMARY KEY(company_id,document_id,line_id),
  UNIQUE(company_id,document_id,line_no),
  CHECK((order_id IS NULL)=(order_line_id IS NULL)),
  CHECK((order_id IS NULL)=(expected_net_minor IS NULL)),
  CHECK((order_id IS NULL)=(match_status='notApplicable')),
  FOREIGN KEY(company_id,document_id) REFERENCES trade_documents(company_id,document_id),
  FOREIGN KEY(company_id,product_id) REFERENCES trade_products(company_id,code),
  FOREIGN KEY(company_id,account) REFERENCES accounts(company_id,code),
  FOREIGN KEY(company_id,tax_code) REFERENCES trade_tax_codes(company_id,code),
  FOREIGN KEY(company_id,order_id,order_line_id) REFERENCES trade_order_lines(company_id,order_id,line_id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX trade_document_lines_order ON trade_document_lines(company_id,order_id,order_line_id,document_id) WHERE order_id IS NOT NULL;
CREATE TABLE open_items (
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
  status TEXT NOT NULL CHECK(status IN ('open','settled') AND (status='settled')=(remaining_gross_minor=0)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY(company_id,item_id),
  FOREIGN KEY(company_id,item_id) REFERENCES trade_documents(company_id,document_id),
  FOREIGN KEY(company_id,party_id) REFERENCES trade_parties(company_id,code),
  FOREIGN KEY(company_id,control_account) REFERENCES accounts(company_id,code)
) WITHOUT ROWID;
CREATE INDEX open_items_party_due ON open_items(company_id,party_id,status,due_date);
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
CREATE INDEX settlements_item ON settlements(company_id,item_id,accounting_date);
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
CREATE TRIGGER trade_orders_no_update BEFORE UPDATE ON trade_orders BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER trade_orders_no_delete BEFORE DELETE ON trade_orders BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER trade_order_lines_no_update BEFORE UPDATE ON trade_order_lines BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER trade_order_lines_no_delete BEFORE DELETE ON trade_order_lines BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER trade_documents_no_update BEFORE UPDATE ON trade_documents BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER trade_documents_no_delete BEFORE DELETE ON trade_documents BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER trade_document_lines_no_update BEFORE UPDATE ON trade_document_lines BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER trade_document_lines_no_delete BEFORE DELETE ON trade_document_lines BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER settlements_no_update BEFORE UPDATE ON settlements BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
CREATE TRIGGER settlements_no_delete BEFORE DELETE ON settlements BEGIN SELECT RAISE(ABORT,'immutable trade evidence'); END;
