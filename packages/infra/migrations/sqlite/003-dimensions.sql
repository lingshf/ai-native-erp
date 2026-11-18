CREATE TABLE dimensions (
 company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
 code TEXT NOT NULL, name TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), valid_from TEXT NOT NULL, valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(company_id,code)
) WITHOUT ROWID;
CREATE TABLE dimension_values (
 company_id TEXT NOT NULL, dimension_code TEXT NOT NULL, value_code TEXT NOT NULL, name TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), valid_from TEXT NOT NULL, valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(company_id,dimension_code,value_code),
 FOREIGN KEY(company_id,dimension_code) REFERENCES dimensions(company_id,code)
) WITHOUT ROWID;
CREATE TABLE dimension_defaults (
 company_id TEXT NOT NULL REFERENCES ledger_companies(company_id), code TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), valid_from TEXT NOT NULL, valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 values_json TEXT NOT NULL CHECK(json_valid(values_json)), PRIMARY KEY(company_id,code)
) WITHOUT ROWID;
CREATE TABLE dimension_derivations (
 company_id TEXT NOT NULL REFERENCES ledger_companies(company_id), code TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), valid_from TEXT NOT NULL, valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 when_json TEXT NOT NULL CHECK(json_valid(when_json)), values_json TEXT NOT NULL CHECK(json_valid(values_json)),
 mode TEXT NOT NULL CHECK(mode IN ('fill','replace')), PRIMARY KEY(company_id,code)
) WITHOUT ROWID;
CREATE TABLE dimension_structures (
 company_id TEXT NOT NULL, account_code TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), valid_from TEXT NOT NULL, valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 required_json TEXT NOT NULL CHECK(json_valid(required_json)), optional_json TEXT NOT NULL CHECK(json_valid(optional_json)),
 forbidden_json TEXT NOT NULL CHECK(json_valid(forbidden_json)),
 allowed_json TEXT NOT NULL CHECK(json_valid(allowed_json)), fixed_json TEXT NOT NULL CHECK(json_valid(fixed_json)),
 conditionals_json TEXT NOT NULL CHECK(json_valid(conditionals_json)), PRIMARY KEY(company_id,account_code),
 FOREIGN KEY(company_id,account_code) REFERENCES accounts(company_id,code)
) WITHOUT ROWID;
CREATE TABLE dimension_balances (
 company_id TEXT NOT NULL, code TEXT NOT NULL CHECK(code='LEDGER'), dimension_code TEXT NOT NULL, account_code TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), valid_from TEXT NOT NULL, valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(company_id,code), FOREIGN KEY(company_id,dimension_code) REFERENCES dimensions(company_id,code),
 FOREIGN KEY(company_id,account_code) REFERENCES accounts(company_id,code)
) WITHOUT ROWID;
CREATE TABLE dimension_history (
 company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
 kind TEXT NOT NULL CHECK(kind IN ('dimension','value','defaults','derivation','structure','balance')), config_key TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 recorded_at TEXT NOT NULL, actor TEXT NOT NULL CHECK(actor='LOCAL'),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot) AND length(CAST(snapshot AS BLOB))<=65536),
 PRIMARY KEY(company_id,kind,config_key,revision)
) WITHOUT ROWID;
CREATE TRIGGER dimension_history_no_update BEFORE UPDATE ON dimension_history BEGIN SELECT RAISE(ABORT,'immutable dimension history'); END;
CREATE TRIGGER dimension_history_no_delete BEFORE DELETE ON dimension_history BEGIN SELECT RAISE(ABORT,'immutable dimension history'); END;
