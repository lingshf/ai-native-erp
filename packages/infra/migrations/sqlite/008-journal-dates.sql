ALTER TABLE journal_entries ADD COLUMN document_date TEXT NOT NULL DEFAULT ''
  CHECK(document_date='' OR (length(document_date)=10 AND date(document_date,'+0 days') IS document_date));
ALTER TABLE journal_entries ADD COLUMN tax_date TEXT NOT NULL DEFAULT ''
  CHECK(tax_date='' OR (length(tax_date)=10 AND date(tax_date,'+0 days') IS tax_date));

DROP TRIGGER journal_entries_no_update;
UPDATE journal_entries SET document_date=accounting_date,tax_date=accounting_date;
CREATE TRIGGER journal_entries_no_update BEFORE UPDATE ON journal_entries
  BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_entries_dates BEFORE INSERT ON journal_entries
  WHEN NEW.document_date='' OR NEW.tax_date=''
  BEGIN SELECT RAISE(ABORT,'missing journal dates'); END;
