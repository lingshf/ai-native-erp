ALTER TABLE receipts ADD COLUMN idempotency_key TEXT
  CHECK(idempotency_key IS NULL OR (idempotency_key=receipt_key AND tenant_id='LOCAL' AND book_id='LOCAL' AND operation='journal.confirm'));
ALTER TABLE receipts ADD COLUMN source_ref TEXT
  CHECK((source_ref IS NULL AND idempotency_key IS NULL) OR
        (source_ref IS NOT NULL AND idempotency_key IS NOT NULL AND length(source_ref) BETWEEN 1 AND 100 AND source_ref NOT GLOB '*[^ -~]*'));
CREATE UNIQUE INDEX receipts_idempotency ON receipts(idempotency_key);
CREATE UNIQUE INDEX receipts_source ON receipts(company_id,source_ref);
CREATE UNIQUE INDEX receipts_journal_company ON receipts(company_id,idempotency_key);
CREATE VIEW audit_log AS SELECT company_id,sequence,reference AS source_ref,principal AS actor,details,recorded_at
  FROM audit WHERE tenant_id='LOCAL' AND book_id='LOCAL' AND operation='journal.confirm';

CREATE TABLE journal_drafts (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  id TEXT NOT NULL CHECK(length(id)=36),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  source_ref TEXT NOT NULL,
  accounting_date TEXT NOT NULL,
  memo TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN('journal','reverse','replace','reclassify')),
  data TEXT NOT NULL CHECK(json_valid(data)),
  PRIMARY KEY(company_id,id)
);
CREATE TABLE journal_entries (
  sequence INTEGER PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  id TEXT NOT NULL UNIQUE CHECK(length(id)=36),
  receipt_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  accounting_date TEXT NOT NULL CHECK(length(accounting_date)=10),
  period TEXT NOT NULL CHECK(period=substr(accounting_date,1,7)),
  memo TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('normal','adjusting')),
  operation TEXT NOT NULL CHECK(operation IN('journal','reverse','replace','reclassify')),
  role TEXT NOT NULL CHECK(role IN('normal','reversal','reclassification')),
  posted_at TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
  UNIQUE(company_id,id),
  UNIQUE(company_id,id,period),
  FOREIGN KEY(company_id,period) REFERENCES periods(company_id,month),
  FOREIGN KEY(company_id,receipt_key) REFERENCES receipts(company_id,idempotency_key),
  FOREIGN KEY(company_id,id) REFERENCES journal_seals(company_id,entry_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE journal_lines (
  company_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  line_no INTEGER NOT NULL CHECK(typeof(line_no)='integer' AND line_no BETWEEN 1 AND 2000),
  period TEXT NOT NULL,
  account_code TEXT NOT NULL,
  debit_minor INTEGER NOT NULL CHECK(typeof(debit_minor)='integer' AND debit_minor BETWEEN 0 AND 9007199254740991),
  credit_minor INTEGER NOT NULL CHECK(typeof(credit_minor)='integer' AND credit_minor BETWEEN 0 AND 9007199254740991),
  dimensions TEXT NOT NULL CHECK(json_valid(dimensions) AND json_type(dimensions)='object'),
  evidence TEXT NOT NULL CHECK(json_valid(evidence)),
  CHECK((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0)),
  PRIMARY KEY(company_id,entry_id,line_no),
  FOREIGN KEY(company_id,entry_id,period) REFERENCES journal_entries(company_id,id,period),
  FOREIGN KEY(company_id,account_code) REFERENCES accounts(company_id,code)
);
CREATE INDEX journal_lines_period_account ON journal_lines(company_id,period,account_code);
CREATE INDEX journal_entries_page ON journal_entries(company_id,id);
CREATE INDEX journal_entries_recent ON journal_entries(company_id,sequence DESC);
CREATE TABLE journal_seals (
  company_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  turnover_minor INTEGER NOT NULL CHECK(typeof(turnover_minor)='integer' AND turnover_minor BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY(company_id,entry_id),
  FOREIGN KEY(company_id,entry_id) REFERENCES journal_entries(company_id,id)
);
CREATE TABLE journal_corrections (
  company_id TEXT NOT NULL,
  original_id TEXT NOT NULL,
  output_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN('reverse','replace','reclassify')),
  PRIMARY KEY(company_id,original_id,output_id),
  UNIQUE(company_id,output_id),
  CHECK(original_id<>output_id),
  FOREIGN KEY(company_id,original_id) REFERENCES journal_entries(company_id,id),
  FOREIGN KEY(company_id,output_id) REFERENCES journal_entries(company_id,id)
);
CREATE TRIGGER journal_seal_balance BEFORE INSERT ON journal_seals BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM journal_lines WHERE company_id=NEW.company_id AND entry_id=NEW.entry_id)<2
    OR (SELECT sum(debit_minor)<>sum(credit_minor) OR sum(debit_minor)>9007199254740991 FROM journal_lines WHERE company_id=NEW.company_id AND entry_id=NEW.entry_id)
    THEN RAISE(ABORT,'invalid journal balance') END;
  SELECT CASE WHEN NEW.turnover_minor<>coalesce(
    (SELECT s.turnover_minor FROM journal_entries e JOIN journal_seals s ON s.company_id=e.company_id AND s.entry_id=e.id
      WHERE e.company_id=NEW.company_id ORDER BY e.sequence DESC LIMIT 1),0) +
    (SELECT sum(debit_minor) FROM journal_lines WHERE company_id=NEW.company_id AND entry_id=NEW.entry_id)
    THEN RAISE(ABORT,'invalid journal turnover') END;
END;
CREATE TRIGGER journal_lines_sealed BEFORE INSERT ON journal_lines
  WHEN EXISTS(SELECT 1 FROM journal_seals WHERE company_id=NEW.company_id AND entry_id=NEW.entry_id)
  BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_entries_no_update BEFORE UPDATE ON journal_entries BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_entries_no_delete BEFORE DELETE ON journal_entries BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_lines_no_update BEFORE UPDATE ON journal_lines BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_lines_no_delete BEFORE DELETE ON journal_lines BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_seals_no_update BEFORE UPDATE ON journal_seals BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_seals_no_delete BEFORE DELETE ON journal_seals BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_corrections_no_update BEFORE UPDATE ON journal_corrections BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_corrections_no_delete BEFORE DELETE ON journal_corrections BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
