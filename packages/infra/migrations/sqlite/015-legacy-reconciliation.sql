ALTER TABLE legacy_import_runs ADD COLUMN opening TEXT CHECK(opening IS NULL OR opening='done');
CREATE TABLE legacy_reconciliations (
  run_id TEXT PRIMARY KEY REFERENCES legacy_import_runs(id),
  report TEXT NOT NULL CHECK(json_valid(report)),
  report_sha TEXT NOT NULL CHECK(length(report_sha)=64),
  confirmation_sha TEXT CHECK(confirmation_sha IS NULL OR length(confirmation_sha)=64),
  baseline INTEGER CHECK(baseline IS NULL OR (typeof(baseline)='integer' AND baseline>=0)),
  CHECK((confirmation_sha IS NULL)=(baseline IS NULL))
);
CREATE TRIGGER legacy_reconciliation_baseline BEFORE UPDATE ON legacy_reconciliations
  WHEN OLD.baseline IS NOT NULL
  BEGIN SELECT RAISE(ABORT,'immutable reconciliation baseline'); END;
CREATE TRIGGER legacy_reconciliation_no_delete BEFORE DELETE ON legacy_reconciliations
  BEGIN SELECT RAISE(ABORT,'immutable reconciliation'); END;
