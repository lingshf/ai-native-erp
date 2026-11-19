CREATE TABLE legacy_import_runs (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL CHECK(tool='legacy.import.v1'),
  snapshot_sha TEXT NOT NULL CHECK(json_valid(snapshot_sha)),
  choices TEXT NOT NULL CHECK(json_valid(choices)),
  migration_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN('importing','imported','reconciled','failed')),
  cursor INTEGER NOT NULL DEFAULT 0 CHECK(cursor>=0),
  counts TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(counts)),
  write_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE legacy_refs (
  source TEXT NOT NULL CHECK(source IN('teaching','enterprise')),
  object_type TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES legacy_import_runs(id),
  evidence TEXT NOT NULL CHECK(json_valid(evidence)),
  PRIMARY KEY(source,object_type,legacy_id)
);
CREATE INDEX legacy_refs_target ON legacy_refs(target_id,object_type,run_id);
-- Cover the deferred entry/line FK probe; a company-only covering scan is quadratic.
CREATE INDEX journal_lines_entry_period ON journal_lines(company_id,entry_id,period);
-- Stream account aggregates instead of sorting every imported GL row.
DROP INDEX journal_lines_report_totals;
CREATE INDEX journal_lines_report_totals
  ON journal_lines(company_id,account_code,period,debit_minor,credit_minor);
CREATE TABLE write_seq (
  id INTEGER PRIMARY KEY CHECK(id=1),
  value INTEGER NOT NULL CHECK(typeof(value)='integer' AND value>=0)
);
INSERT INTO write_seq VALUES(1,0);

-- Rebuild the parent in place: deferred children keep their original table name.
-- Historical entries have import provenance instead of a manufactured receipt.
PRAGMA defer_foreign_keys=ON;
CREATE TEMP TABLE legacy_entry_backup AS SELECT * FROM journal_entries;
DROP TABLE journal_entries;
CREATE TABLE journal_entries (
  sequence INTEGER PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  id TEXT NOT NULL UNIQUE CHECK(length(id)=36),
  receipt_key TEXT,
  source_ref TEXT NOT NULL,
  accounting_date TEXT NOT NULL CHECK(length(accounting_date)=10),
  period TEXT NOT NULL CHECK(period=substr(accounting_date,1,7)),
  memo TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('normal','adjusting')),
  operation TEXT NOT NULL CHECK(operation IN('journal','reverse','replace','reclassify')),
  role TEXT NOT NULL CHECK(role IN('normal','reversal','reclassification')),
  posted_at TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
  document_date TEXT NOT NULL DEFAULT ''
    CHECK(document_date='' OR (length(document_date)=10 AND date(document_date,'+0 days') IS document_date)),
  tax_date TEXT NOT NULL DEFAULT ''
    CHECK(tax_date='' OR (length(tax_date)=10 AND date(tax_date,'+0 days') IS tax_date)),
  import_run TEXT REFERENCES legacy_import_runs(id),
  CHECK((receipt_key IS NOT NULL AND import_run IS NULL) OR (receipt_key IS NULL AND import_run IS NOT NULL)),
  UNIQUE(company_id,id),
  UNIQUE(company_id,id,period),
  FOREIGN KEY(company_id,period) REFERENCES periods(company_id,month),
  FOREIGN KEY(company_id,receipt_key) REFERENCES receipts(company_id,idempotency_key),
  FOREIGN KEY(company_id,id) REFERENCES journal_seals(company_id,entry_id) DEFERRABLE INITIALLY DEFERRED
);
INSERT INTO journal_entries SELECT *,NULL FROM legacy_entry_backup;
DROP TABLE legacy_entry_backup;
CREATE INDEX journal_entries_page ON journal_entries(company_id,id);
CREATE INDEX journal_entries_recent ON journal_entries(company_id,sequence DESC);
CREATE INDEX journal_entries_ledger_date ON journal_entries(company_id,period,accounting_date,id);
CREATE TRIGGER journal_entries_no_update BEFORE UPDATE ON journal_entries
  BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_entries_no_delete BEFORE DELETE ON journal_entries
  BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_entries_dates BEFORE INSERT ON journal_entries
  WHEN NEW.document_date='' OR NEW.tax_date=''
  BEGIN SELECT RAISE(ABORT,'missing journal dates'); END;
CREATE TRIGGER journal_entries_import BEFORE INSERT ON journal_entries
  WHEN NEW.import_run IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM legacy_import_runs r JOIN legacy_refs f ON f.run_id=r.id
    WHERE r.id=NEW.import_run AND r.status='importing' AND f.object_type='journals' AND f.target_id=NEW.id)
  BEGIN SELECT RAISE(ABORT,'missing import provenance'); END;

DROP TRIGGER period_closing_journals_source;
CREATE TRIGGER period_closing_journals_source BEFORE INSERT ON period_closing_journals
WHEN EXISTS(SELECT 1 FROM journal_seals WHERE company_id=NEW.company_id AND entry_id=NEW.journal_id)
  OR NOT EXISTS(SELECT 1 FROM journal_entries e LEFT JOIN receipts r ON r.company_id=e.company_id AND r.idempotency_key=e.receipt_key
    WHERE e.company_id=NEW.company_id AND e.id=NEW.journal_id AND e.kind='normal' AND e.operation='journal' AND e.role='normal'
      AND (json_extract(r.result,'$.operation')='period.close' OR e.import_run IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'invalid closing source'); END;
