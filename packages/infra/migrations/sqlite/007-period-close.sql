CREATE TABLE period_closes (
  company_id TEXT NOT NULL,
  receipt_key TEXT NOT NULL,
  month TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>1),
  result TEXT NOT NULL CHECK(json_valid(result)),
  PRIMARY KEY(company_id,receipt_key),
  UNIQUE(company_id,month,revision),
  FOREIGN KEY(company_id,month) REFERENCES periods(company_id,month),
  FOREIGN KEY(company_id,receipt_key) REFERENCES receipts(company_id,idempotency_key)
);
CREATE TABLE period_closing_journals (
  company_id TEXT NOT NULL,
  journal_id TEXT NOT NULL,
  PRIMARY KEY(company_id,journal_id),
  FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id)
);
CREATE TRIGGER period_closes_no_update BEFORE UPDATE ON period_closes BEGIN SELECT RAISE(ABORT,'immutable period close'); END;
CREATE TRIGGER period_closes_no_delete BEFORE DELETE ON period_closes BEGIN SELECT RAISE(ABORT,'immutable period close'); END;
CREATE TRIGGER period_closing_journals_no_update BEFORE UPDATE ON period_closing_journals BEGIN SELECT RAISE(ABORT,'immutable closing journal'); END;
CREATE TRIGGER period_closing_journals_no_delete BEFORE DELETE ON period_closing_journals BEGIN SELECT RAISE(ABORT,'immutable closing journal'); END;
CREATE TRIGGER period_closing_journals_source BEFORE INSERT ON period_closing_journals
WHEN EXISTS(SELECT 1 FROM journal_seals WHERE company_id=NEW.company_id AND entry_id=NEW.journal_id)
  OR NOT EXISTS(SELECT 1 FROM journal_entries e JOIN receipts r ON r.company_id=e.company_id AND r.idempotency_key=e.receipt_key
    WHERE e.company_id=NEW.company_id AND e.id=NEW.journal_id AND e.kind='normal' AND e.operation='journal' AND e.role='normal'
      AND json_extract(r.result,'$.operation')='period.close')
BEGIN SELECT RAISE(ABORT,'invalid closing source'); END;
CREATE TRIGGER period_close_seal BEFORE INSERT ON journal_seals
WHEN EXISTS(SELECT 1 FROM journal_entries e JOIN receipts r ON r.company_id=e.company_id AND r.idempotency_key=e.receipt_key
    WHERE e.company_id=NEW.company_id AND e.id=NEW.entry_id AND json_extract(r.result,'$.operation')='period.close')
  AND NOT EXISTS(SELECT 1 FROM period_closing_journals WHERE company_id=NEW.company_id AND journal_id=NEW.entry_id)
BEGIN SELECT RAISE(ABORT,'missing closing marker'); END;
