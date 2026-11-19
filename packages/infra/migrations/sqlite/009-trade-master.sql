CREATE TABLE trade_terms (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
  due_days INTEGER NOT NULL CHECK(due_days BETWEEN 0 AND 3650),
  discount_days INTEGER NOT NULL CHECK(discount_days BETWEEN 0 AND due_days),
  discount_percent TEXT NOT NULL,
  allow_partial_discount INTEGER NOT NULL CHECK(allow_partial_discount IN (0,1)),
  PRIMARY KEY(company_id,code)
) WITHOUT ROWID;
CREATE TABLE trade_profiles (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
  side TEXT NOT NULL CHECK(side IN ('AP','AR')),
  control_account TEXT NOT NULL,
  advance_account TEXT NOT NULL,
  cash_account TEXT NOT NULL,
  discount_account TEXT NOT NULL,
  PRIMARY KEY(company_id,code),
  FOREIGN KEY(company_id,control_account) REFERENCES accounts(company_id,code),
  FOREIGN KEY(company_id,advance_account) REFERENCES accounts(company_id,code),
  FOREIGN KEY(company_id,cash_account) REFERENCES accounts(company_id,code),
  FOREIGN KEY(company_id,discount_account) REFERENCES accounts(company_id,code)
) WITHOUT ROWID;
CREATE TABLE trade_tax_codes (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
  mode TEXT NOT NULL CHECK(mode IN ('ordinary','zero','exempt')),
  rates TEXT NOT NULL CHECK(json_valid(rates) AND json_type(rates)='array'),
  deductible_percent TEXT NOT NULL,
  input_account TEXT,
  output_account TEXT,
  PRIMARY KEY(company_id,code),
  FOREIGN KEY(company_id,input_account) REFERENCES accounts(company_id,code),
  FOREIGN KEY(company_id,output_account) REFERENCES accounts(company_id,code),
  CHECK((input_account IS NULL)=(output_account IS NULL)),
  CHECK(mode!='ordinary' OR input_account IS NOT NULL)
) WITHOUT ROWID;
CREATE TABLE trade_parties (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
  role TEXT NOT NULL CHECK(role IN ('vendor','customer','both')),
  ap_profile TEXT,
  ar_profile TEXT,
  terms TEXT NOT NULL,
  allowed_tax_codes TEXT NOT NULL CHECK(json_valid(allowed_tax_codes) AND json_type(allowed_tax_codes)='array'),
  default_dimensions TEXT NOT NULL CHECK(json_valid(default_dimensions) AND json_type(default_dimensions)='object'),
  PRIMARY KEY(company_id,code),
  FOREIGN KEY(company_id,ap_profile) REFERENCES trade_profiles(company_id,code),
  FOREIGN KEY(company_id,ar_profile) REFERENCES trade_profiles(company_id,code),
  FOREIGN KEY(company_id,terms) REFERENCES trade_terms(company_id,code),
  CHECK((role!='customer')=(ap_profile IS NOT NULL)),
  CHECK((role!='vendor')=(ar_profile IS NOT NULL))
) WITHOUT ROWID;
CREATE TABLE trade_products (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL CHECK(valid_to>=valid_from),
  type TEXT NOT NULL CHECK(type IN ('expense','service')),
  expense_account TEXT,
  revenue_account TEXT,
  allowed_tax_codes TEXT NOT NULL CHECK(json_valid(allowed_tax_codes) AND json_type(allowed_tax_codes)='array'),
  default_dimensions TEXT NOT NULL CHECK(json_valid(default_dimensions) AND json_type(default_dimensions)='object'),
  PRIMARY KEY(company_id,code),
  FOREIGN KEY(company_id,expense_account) REFERENCES accounts(company_id,code),
  FOREIGN KEY(company_id,revenue_account) REFERENCES accounts(company_id,code),
  CHECK((type='expense')=(expense_account IS NOT NULL)),
  CHECK((type='service')=(revenue_account IS NOT NULL))
) WITHOUT ROWID;
CREATE INDEX trade_parties_name ON trade_parties(company_id,name);
CREATE INDEX trade_products_name ON trade_products(company_id,name);
CREATE INDEX trade_profiles_name ON trade_profiles(company_id,name);
CREATE INDEX trade_terms_name ON trade_terms(company_id,name);
CREATE INDEX trade_tax_codes_name ON trade_tax_codes(company_id,name);
CREATE TABLE trade_config_history (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  kind TEXT NOT NULL CHECK(kind IN ('tradeParty','tradeProduct','tradeProfile','tradeTerms','taxCode')),
  config_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at)=24 AND recorded_at GLOB '????-??-??T??:??:??.???Z'),
  actor TEXT NOT NULL CHECK(actor='LOCAL'),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot) AND length(CAST(snapshot AS BLOB))<=65536),
  PRIMARY KEY(company_id,kind,config_key,revision)
) WITHOUT ROWID;
CREATE INDEX trade_config_history_at ON trade_config_history(company_id,kind,config_key,recorded_at DESC,revision DESC);
CREATE TRIGGER trade_config_history_no_update BEFORE UPDATE ON trade_config_history BEGIN SELECT RAISE(ABORT,'immutable configuration history'); END;
CREATE TRIGGER trade_config_history_no_delete BEFORE DELETE ON trade_config_history BEGIN SELECT RAISE(ABORT,'immutable configuration history'); END;
