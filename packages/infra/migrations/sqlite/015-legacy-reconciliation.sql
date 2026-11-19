ALTER TABLE legacy_import_runs ADD COLUMN opening TEXT CHECK(opening IS NULL OR opening='done');
ALTER TABLE legacy_import_runs ADD COLUMN opening_details_sha TEXT CHECK(
  opening_details_sha IS NULL OR
  (length(opening_details_sha)=64 AND opening_details_sha NOT GLOB '*[^0-9a-f]*')
);
CREATE TABLE legacy_reconciliations (
  run_id TEXT PRIMARY KEY REFERENCES legacy_import_runs(id),
  report TEXT NOT NULL CHECK(json_valid(report)),
  report_sha TEXT NOT NULL CHECK(length(report_sha)=64),
  confirmation_sha TEXT CHECK(confirmation_sha IS NULL OR length(confirmation_sha)=64),
  baseline INTEGER CHECK(baseline IS NULL OR (typeof(baseline)='integer' AND baseline>=0)),
  CHECK((confirmation_sha IS NULL)=(baseline IS NULL))
) WITHOUT ROWID;
CREATE TRIGGER legacy_reconciliation_no_replace BEFORE INSERT ON legacy_reconciliations
  WHEN EXISTS(SELECT 1 FROM legacy_reconciliations WHERE run_id=NEW.run_id AND baseline IS NOT NULL)
  BEGIN SELECT RAISE(ABORT,'immutable reconciliation baseline'); END;
CREATE TRIGGER legacy_reconciliation_baseline BEFORE UPDATE ON legacy_reconciliations
  WHEN OLD.baseline IS NOT NULL
  BEGIN SELECT RAISE(ABORT,'immutable reconciliation baseline'); END;
CREATE TRIGGER legacy_reconciliation_no_delete BEFORE DELETE ON legacy_reconciliations
  BEGIN SELECT RAISE(ABORT,'immutable reconciliation'); END;
