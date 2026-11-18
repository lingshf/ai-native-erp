CREATE TABLE ledger_companies (
  company_id TEXT NOT NULL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'LOCAL' CHECK(tenant_id='LOCAL'),
  book_id TEXT NOT NULL DEFAULT 'LOCAL' CHECK(book_id='LOCAL'),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  currency TEXT NOT NULL CHECK(length(currency)=3 AND currency GLOB '[A-Z][A-Z][A-Z]'),
  scale INTEGER NOT NULL CHECK(typeof(scale)='integer' AND scale BETWEEN 0 AND 4),
  year INTEGER NOT NULL CHECK(typeof(year)='integer' AND year BETWEEN 1900 AND 9998),
  close_mode TEXT NOT NULL CHECK(close_mode IN ('monthly-teaching','annual')),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  FOREIGN KEY(tenant_id,book_id,company_id) REFERENCES companies(tenant_id,book_id,company_id)
);
CREATE TABLE accounts (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL CHECK(length(code)=4 AND code GLOB '[1-9][0-9][0-9][0-9]'),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  category TEXT NOT NULL CHECK(category IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  report_group TEXT NOT NULL CHECK(
    (category='ASSET' AND report_group IN ('cash','receivables','inventory','prepayments','fixedAssets','otherAssets')) OR
    (category='LIABILITY' AND report_group IN ('payables','taxLiabilities','otherLiabilities')) OR
    (category='EQUITY' AND report_group IN ('capital','retainedEarnings','otherEquity')) OR
    (category='REVENUE' AND report_group IN ('sales','otherRevenue')) OR
    (category='EXPENSE' AND report_group IN ('costOfSales','operatingExpense','otherExpense'))),
  normal_side TEXT NOT NULL CHECK(normal_side IN ('DEBIT','CREDIT')),
  purpose TEXT NOT NULL CHECK(purpose IN ('general','control','clearing','suspense')),
  control_module TEXT,
  contra_of TEXT,
  manual_allowed INTEGER NOT NULL CHECK(manual_allowed IN (0,1)),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  builtin INTEGER NOT NULL CHECK(builtin IN (0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY(company_id,code),
  FOREIGN KEY(company_id,contra_of) REFERENCES accounts(company_id,code),
  CHECK((purpose='control' AND control_module IS NOT NULL AND
    control_module IN ('AP','AR','INVENTORY','ASSET','BANK','TAX','LEASE','IC') AND manual_allowed=0)
    OR (purpose!='control' AND control_module IS NULL)),
  CHECK(contra_of IS NULL OR (purpose='general' AND contra_of!=code))
) WITHOUT ROWID;
CREATE TABLE periods (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  month TEXT NOT NULL CHECK(length(month)=7 AND month GLOB '[1-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(month,6,2) BETWEEN '01' AND '12'),
  status TEXT NOT NULL CHECK(status IN ('open','frozen','closed')),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY(company_id,month)
) WITHOUT ROWID;
CREATE TABLE config_history (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  kind TEXT NOT NULL CHECK(kind IN ('company','account','period')),
  config_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at)=24 AND recorded_at GLOB '????-??-??T??:??:??.???Z'),
  actor TEXT NOT NULL CHECK(actor='LOCAL'),
  reason TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot) AND length(CAST(snapshot AS BLOB))<=65536),
  PRIMARY KEY(company_id,kind,config_key,revision)
) WITHOUT ROWID;
CREATE INDEX config_history_at ON config_history(company_id,kind,config_key,recorded_at DESC,revision DESC);
CREATE TRIGGER config_history_no_update BEFORE UPDATE ON config_history BEGIN SELECT RAISE(ABORT,'immutable configuration history'); END;
CREATE TRIGGER config_history_no_delete BEFORE DELETE ON config_history BEGIN SELECT RAISE(ABORT,'immutable configuration history'); END;
