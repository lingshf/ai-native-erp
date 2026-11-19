-- Deterministic fictional legacy fixture captured before removal at main a401d6f.
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE accounts(company TEXT NOT NULL REFERENCES companies(code), code TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
 purpose TEXT NOT NULL CHECK(purpose IN('general','control','clearing','suspense')), data TEXT NOT NULL CHECK(json_valid(data)),
 PRIMARY KEY(company,code));
CREATE TABLE adapter_facts(company TEXT NOT NULL, reference TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(company,reference),
 FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL REFERENCES companies(code), action TEXT NOT NULL,
 reference TEXT, data TEXT NOT NULL CHECK(json_valid(data)), at TEXT NOT NULL);
CREATE TABLE chart_templates(code TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(code,revision));
CREATE TABLE clearing_links(company TEXT NOT NULL, line_id INTEGER NOT NULL, reference TEXT NOT NULL, PRIMARY KEY(company,line_id),
 FOREIGN KEY(company,line_id) REFERENCES lines(company,id), FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE companies(code TEXT PRIMARY KEY, name TEXT NOT NULL, year INTEGER NOT NULL CHECK(year BETWEEN 1900 AND 9998),
 currency TEXT NOT NULL REFERENCES currencies(code), scale INTEGER NOT NULL, report_currency TEXT NOT NULL REFERENCES currencies(code),
 report_scale INTEGER NOT NULL, template TEXT NOT NULL, template_revision INTEGER NOT NULL,
 FOREIGN KEY(template,template_revision) REFERENCES chart_templates(code,revision));
CREATE TABLE config_versions(company TEXT NOT NULL, kind TEXT NOT NULL, code TEXT NOT NULL, revision INTEGER NOT NULL,
 active INTEGER NOT NULL CHECK(active IN(0,1)), data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(company,kind,code,revision),
 FOREIGN KEY(company,kind,code) REFERENCES configs(company,kind,code));
CREATE TABLE configs(company TEXT NOT NULL REFERENCES companies(code), kind TEXT NOT NULL, code TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0), active INTEGER NOT NULL CHECK(active IN(0,1)), data TEXT NOT NULL CHECK(json_valid(data)),
 PRIMARY KEY(company,kind,code));
CREATE TABLE corrections(company TEXT NOT NULL, original_id INTEGER NOT NULL, output_id INTEGER NOT NULL, reference TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN('reverse','replace','reclassify','cash_service.cancel')), PRIMARY KEY(company,reference),
 FOREIGN KEY(company,original_id) REFERENCES journals(company,id), FOREIGN KEY(company,output_id) REFERENCES journals(company,id),
 FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE currencies(code TEXT PRIMARY KEY CHECK(length(code)=3 AND code GLOB '[A-Z][A-Z][A-Z]'),
 scale INTEGER NOT NULL CHECK(typeof(scale)='integer' AND scale BETWEEN 0 AND 4));
CREATE TABLE journal_seals(company TEXT NOT NULL, journal_id INTEGER NOT NULL, PRIMARY KEY(company,journal_id),
 FOREIGN KEY(company,journal_id) REFERENCES journals(company,id));
CREATE TABLE journals(id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, reference TEXT NOT NULL,
 accounting_date TEXT NOT NULL, document_date TEXT NOT NULL, tax_date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('normal','adjusting')),
 operation TEXT NOT NULL, memo TEXT NOT NULL, details TEXT NOT NULL CHECK(json_valid(details)),
 substr_month TEXT GENERATED ALWAYS AS (substr(accounting_date,1,7)) STORED, UNIQUE(company,id),
 FOREIGN KEY(company,reference) REFERENCES source_events(company,reference),
 FOREIGN KEY(company,substr_month) REFERENCES periods(company,month));
CREATE TABLE lines(id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, journal_id INTEGER NOT NULL, line_no INTEGER NOT NULL CHECK(line_no>0),
 account TEXT NOT NULL, debit INTEGER NOT NULL CHECK(typeof(debit)='integer' AND debit BETWEEN 0 AND 9007199254740991),
 credit INTEGER NOT NULL CHECK(typeof(credit)='integer' AND credit BETWEEN 0 AND 9007199254740991),
 data TEXT NOT NULL CHECK(json_valid(data)), CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)),
 UNIQUE(company,id), UNIQUE(company,journal_id,line_no),
 FOREIGN KEY(company,journal_id) REFERENCES journals(company,id), FOREIGN KEY(company,account) REFERENCES accounts(company,code));
CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0));
CREATE TABLE periods(company TEXT NOT NULL REFERENCES companies(code), month TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 status TEXT NOT NULL CHECK(status IN('open','hold','permanent')), modules TEXT NOT NULL CHECK(json_valid(modules)), PRIMARY KEY(company,month));
CREATE TABLE receipts(company TEXT NOT NULL, reference TEXT NOT NULL, evidence TEXT NOT NULL CHECK(json_valid(evidence)),
 PRIMARY KEY(company,reference), FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE source_events(company TEXT NOT NULL REFERENCES companies(code), reference TEXT NOT NULL, operation TEXT NOT NULL,
 accounting_date TEXT NOT NULL, command TEXT NOT NULL CHECK(json_valid(command)), PRIMARY KEY(company,reference));
CREATE TABLE statistics(company TEXT NOT NULL, reference TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(company,reference),
 FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE transfer_queue(company TEXT NOT NULL, reference TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('pending','failed','transferred','withdrawn')),
 journal_ids TEXT NOT NULL CHECK(json_valid(journal_ids)), error TEXT, reason TEXT, PRIMARY KEY(company,reference),
 FOREIGN KEY(company,reference) REFERENCES receipts(company,reference));
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','1000','ASSET','general','{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Cash","normalSide":"DEBIT","purpose":"general","reportGroup":"cash"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','1100','ASSET','general','{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Bank","normalSide":"DEBIT","purpose":"general","reportGroup":"cash"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','1200','ASSET','general','{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Prepayments","normalSide":"DEBIT","purpose":"general","reportGroup":"prepayments"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','1300','ASSET','control','{"category":"ASSET","contraOf":null,"controlModule":"AR","manualAllowed":false,"name":"Receivables control","normalSide":"DEBIT","purpose":"control","reportGroup":"receivables"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','1500','ASSET','general','{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Fixed assets","normalSide":"DEBIT","purpose":"general","reportGroup":"fixedAssets"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','1590','ASSET','general','{"category":"ASSET","contraOf":"1500","controlModule":null,"manualAllowed":true,"name":"Accumulated depreciation","normalSide":"CREDIT","purpose":"general","reportGroup":"fixedAssets"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','2000','LIABILITY','general','{"category":"LIABILITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Accruals","normalSide":"CREDIT","purpose":"general","reportGroup":"otherLiabilities"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','2100','LIABILITY','control','{"category":"LIABILITY","contraOf":null,"controlModule":"AP","manualAllowed":false,"name":"Payables control","normalSide":"CREDIT","purpose":"control","reportGroup":"payables"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','2800','LIABILITY','clearing','{"category":"LIABILITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Clearing","normalSide":"CREDIT","purpose":"clearing","reportGroup":"otherLiabilities"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','2900','ASSET','suspense','{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Suspense","normalSide":"DEBIT","purpose":"suspense","reportGroup":"otherAssets"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','3000','EQUITY','general','{"category":"EQUITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Capital","normalSide":"CREDIT","purpose":"general","reportGroup":"capital"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','3100','EQUITY','general','{"category":"EQUITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Retained earnings","normalSide":"CREDIT","purpose":"general","reportGroup":"retainedEarnings"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','4000','REVENUE','general','{"category":"REVENUE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Sales","normalSide":"CREDIT","purpose":"general","reportGroup":"sales"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','5000','EXPENSE','general','{"category":"EXPENSE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Expense","normalSide":"DEBIT","purpose":"general","reportGroup":"operatingExpense"}');
INSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','5100','EXPENSE','general','{"category":"EXPENSE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Wages","normalSide":"DEBIT","purpose":"general","reportGroup":"operatingExpense"}');
INSERT INTO "audit" ("id","company","action","reference","data","at") VALUES (1,'F','company.create',NULL,'{"assurance":"simulated-local-single-operator","template":"STANDARD","templateRevision":1}','2026-11-19T04:05:03.803Z');
INSERT INTO "chart_templates" ("code","revision","data") VALUES ('STANDARD',1,'[{"code":"1000","data":{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Cash","normalSide":"DEBIT","purpose":"general","reportGroup":"cash"}},{"code":"1100","data":{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Bank","normalSide":"DEBIT","purpose":"general","reportGroup":"cash"}},{"code":"1200","data":{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Prepayments","normalSide":"DEBIT","purpose":"general","reportGroup":"prepayments"}},{"code":"1300","data":{"category":"ASSET","contraOf":null,"controlModule":"AR","manualAllowed":false,"name":"Receivables control","normalSide":"DEBIT","purpose":"control","reportGroup":"receivables"}},{"code":"1500","data":{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Fixed assets","normalSide":"DEBIT","purpose":"general","reportGroup":"fixedAssets"}},{"code":"1590","data":{"category":"ASSET","contraOf":"1500","controlModule":null,"manualAllowed":true,"name":"Accumulated depreciation","normalSide":"CREDIT","purpose":"general","reportGroup":"fixedAssets"}},{"code":"2000","data":{"category":"LIABILITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Accruals","normalSide":"CREDIT","purpose":"general","reportGroup":"otherLiabilities"}},{"code":"2100","data":{"category":"LIABILITY","contraOf":null,"controlModule":"AP","manualAllowed":false,"name":"Payables control","normalSide":"CREDIT","purpose":"control","reportGroup":"payables"}},{"code":"2800","data":{"category":"LIABILITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Clearing","normalSide":"CREDIT","purpose":"clearing","reportGroup":"otherLiabilities"}},{"code":"2900","data":{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Suspense","normalSide":"DEBIT","purpose":"suspense","reportGroup":"otherAssets"}},{"code":"3000","data":{"category":"EQUITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Capital","normalSide":"CREDIT","purpose":"general","reportGroup":"capital"}},{"code":"3100","data":{"category":"EQUITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Retained earnings","normalSide":"CREDIT","purpose":"general","reportGroup":"retainedEarnings"}},{"code":"4000","data":{"category":"REVENUE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Sales","normalSide":"CREDIT","purpose":"general","reportGroup":"sales"}},{"code":"5000","data":{"category":"EXPENSE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Expense","normalSide":"DEBIT","purpose":"general","reportGroup":"operatingExpense"}},{"code":"5100","data":{"category":"EXPENSE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Wages","normalSide":"DEBIT","purpose":"general","reportGroup":"operatingExpense"}}]');
INSERT INTO "companies" ("code","name","year","currency","scale","report_currency","report_scale","template","template_revision") VALUES ('F','Fictional legacy fixture',2026,'EUR',2,'EUR',2,'STANDARD',1);
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','1000',1,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Cash","normalSide":"DEBIT","purpose":"general","reportGroup":"cash"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','1100',2,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Bank","normalSide":"DEBIT","purpose":"general","reportGroup":"cash"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','1200',3,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Prepayments","normalSide":"DEBIT","purpose":"general","reportGroup":"prepayments"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','1300',4,1,'{"category":"ASSET","contraOf":null,"controlModule":"AR","manualAllowed":false,"name":"Receivables control","normalSide":"DEBIT","purpose":"control","reportGroup":"receivables"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','1500',5,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Fixed assets","normalSide":"DEBIT","purpose":"general","reportGroup":"fixedAssets"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','1590',6,1,'{"category":"ASSET","contraOf":"1500","controlModule":null,"manualAllowed":true,"name":"Accumulated depreciation","normalSide":"CREDIT","purpose":"general","reportGroup":"fixedAssets"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','2000',7,1,'{"category":"LIABILITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Accruals","normalSide":"CREDIT","purpose":"general","reportGroup":"otherLiabilities"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','2100',8,1,'{"category":"LIABILITY","contraOf":null,"controlModule":"AP","manualAllowed":false,"name":"Payables control","normalSide":"CREDIT","purpose":"control","reportGroup":"payables"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','2800',9,1,'{"category":"LIABILITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Clearing","normalSide":"CREDIT","purpose":"clearing","reportGroup":"otherLiabilities"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','2900',10,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Suspense","normalSide":"DEBIT","purpose":"suspense","reportGroup":"otherAssets"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','3000',11,1,'{"category":"EQUITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Capital","normalSide":"CREDIT","purpose":"general","reportGroup":"capital"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','3100',12,1,'{"category":"EQUITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Retained earnings","normalSide":"CREDIT","purpose":"general","reportGroup":"retainedEarnings"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','4000',13,1,'{"category":"REVENUE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Sales","normalSide":"CREDIT","purpose":"general","reportGroup":"sales"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','5000',14,1,'{"category":"EXPENSE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Expense","normalSide":"DEBIT","purpose":"general","reportGroup":"operatingExpense"}');
INSERT INTO "config_versions" ("company","kind","code","revision","active","data") VALUES ('F','account','5100',15,1,'{"category":"EXPENSE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Wages","normalSide":"DEBIT","purpose":"general","reportGroup":"operatingExpense"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','1000',1,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Cash","normalSide":"DEBIT","purpose":"general","reportGroup":"cash"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','1100',2,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Bank","normalSide":"DEBIT","purpose":"general","reportGroup":"cash"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','1200',3,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Prepayments","normalSide":"DEBIT","purpose":"general","reportGroup":"prepayments"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','1300',4,1,'{"category":"ASSET","contraOf":null,"controlModule":"AR","manualAllowed":false,"name":"Receivables control","normalSide":"DEBIT","purpose":"control","reportGroup":"receivables"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','1500',5,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Fixed assets","normalSide":"DEBIT","purpose":"general","reportGroup":"fixedAssets"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','1590',6,1,'{"category":"ASSET","contraOf":"1500","controlModule":null,"manualAllowed":true,"name":"Accumulated depreciation","normalSide":"CREDIT","purpose":"general","reportGroup":"fixedAssets"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','2000',7,1,'{"category":"LIABILITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Accruals","normalSide":"CREDIT","purpose":"general","reportGroup":"otherLiabilities"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','2100',8,1,'{"category":"LIABILITY","contraOf":null,"controlModule":"AP","manualAllowed":false,"name":"Payables control","normalSide":"CREDIT","purpose":"control","reportGroup":"payables"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','2800',9,1,'{"category":"LIABILITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Clearing","normalSide":"CREDIT","purpose":"clearing","reportGroup":"otherLiabilities"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','2900',10,1,'{"category":"ASSET","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Suspense","normalSide":"DEBIT","purpose":"suspense","reportGroup":"otherAssets"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','3000',11,1,'{"category":"EQUITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Capital","normalSide":"CREDIT","purpose":"general","reportGroup":"capital"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','3100',12,1,'{"category":"EQUITY","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Retained earnings","normalSide":"CREDIT","purpose":"general","reportGroup":"retainedEarnings"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','4000',13,1,'{"category":"REVENUE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Sales","normalSide":"CREDIT","purpose":"general","reportGroup":"sales"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','5000',14,1,'{"category":"EXPENSE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Expense","normalSide":"DEBIT","purpose":"general","reportGroup":"operatingExpense"}');
INSERT INTO "configs" ("company","kind","code","revision","active","data") VALUES ('F','account','5100',15,1,'{"category":"EXPENSE","contraOf":null,"controlModule":null,"manualAllowed":true,"name":"Wages","normalSide":"DEBIT","purpose":"general","reportGroup":"operatingExpense"}');
INSERT INTO "currencies" ("code","scale") VALUES ('EUR',2);
INSERT INTO "meta" ("id","revision") VALUES (1,15);
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-01',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-02',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-03',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-04',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-05',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-06',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-07',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-08',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-09',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-10',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-11',1,'open','["journal","cash_service","statistics","clearing","correction"]');
INSERT INTO "periods" ("company","month","revision","status","modules") VALUES ('F','2026-12',1,'open','["journal","cash_service","statistics","clearing","correction"]');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES ('audit',1);
CREATE TRIGGER company_delete BEFORE DELETE ON companies BEGIN SELECT RAISE(ABORT,'immutable company'); END;
CREATE TRIGGER company_scales BEFORE INSERT ON companies WHEN
 NEW.scale!=(SELECT scale FROM currencies WHERE code=NEW.currency)
 OR NEW.report_scale!=(SELECT scale FROM currencies WHERE code=NEW.report_currency)
 BEGIN SELECT RAISE(ABORT,'currency scale mismatch'); END;
CREATE TRIGGER company_update BEFORE UPDATE ON companies BEGIN SELECT RAISE(ABORT,'immutable company'); END;
CREATE TRIGGER currency_delete BEFORE DELETE ON currencies BEGIN SELECT RAISE(ABORT,'immutable currency'); END;
CREATE TRIGGER currency_scale BEFORE UPDATE ON currencies BEGIN SELECT RAISE(ABORT,'immutable currency scale'); END;
CREATE TRIGGER immutable_adapter_facts_DELETE BEFORE DELETE ON adapter_facts BEGIN SELECT RAISE(ABORT,'immutable adapter_facts'); END;
CREATE TRIGGER immutable_adapter_facts_UPDATE BEFORE UPDATE ON adapter_facts BEGIN SELECT RAISE(ABORT,'immutable adapter_facts'); END;
CREATE TRIGGER immutable_audit_DELETE BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER immutable_audit_UPDATE BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER immutable_chart_templates_DELETE BEFORE DELETE ON chart_templates BEGIN SELECT RAISE(ABORT,'immutable chart_templates'); END;
CREATE TRIGGER immutable_chart_templates_UPDATE BEFORE UPDATE ON chart_templates BEGIN SELECT RAISE(ABORT,'immutable chart_templates'); END;
CREATE TRIGGER immutable_clearing_links_DELETE BEFORE DELETE ON clearing_links BEGIN SELECT RAISE(ABORT,'immutable clearing_links'); END;
CREATE TRIGGER immutable_clearing_links_UPDATE BEFORE UPDATE ON clearing_links BEGIN SELECT RAISE(ABORT,'immutable clearing_links'); END;
CREATE TRIGGER immutable_config_versions_DELETE BEFORE DELETE ON config_versions BEGIN SELECT RAISE(ABORT,'immutable config_versions'); END;
CREATE TRIGGER immutable_config_versions_UPDATE BEFORE UPDATE ON config_versions BEGIN SELECT RAISE(ABORT,'immutable config_versions'); END;
CREATE TRIGGER immutable_corrections_DELETE BEFORE DELETE ON corrections BEGIN SELECT RAISE(ABORT,'immutable corrections'); END;
CREATE TRIGGER immutable_corrections_UPDATE BEFORE UPDATE ON corrections BEGIN SELECT RAISE(ABORT,'immutable corrections'); END;
CREATE TRIGGER immutable_journal_seals_DELETE BEFORE DELETE ON journal_seals BEGIN SELECT RAISE(ABORT,'immutable journal_seals'); END;
CREATE TRIGGER immutable_journal_seals_UPDATE BEFORE UPDATE ON journal_seals BEGIN SELECT RAISE(ABORT,'immutable journal_seals'); END;
CREATE TRIGGER immutable_journals_DELETE BEFORE DELETE ON journals BEGIN SELECT RAISE(ABORT,'immutable journals'); END;
CREATE TRIGGER immutable_journals_UPDATE BEFORE UPDATE ON journals BEGIN SELECT RAISE(ABORT,'immutable journals'); END;
CREATE TRIGGER immutable_lines_DELETE BEFORE DELETE ON lines BEGIN SELECT RAISE(ABORT,'immutable lines'); END;
CREATE TRIGGER immutable_lines_UPDATE BEFORE UPDATE ON lines BEGIN SELECT RAISE(ABORT,'immutable lines'); END;
CREATE TRIGGER immutable_receipts_DELETE BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT,'immutable receipts'); END;
CREATE TRIGGER immutable_receipts_UPDATE BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT,'immutable receipts'); END;
CREATE TRIGGER immutable_source_events_DELETE BEFORE DELETE ON source_events BEGIN SELECT RAISE(ABORT,'immutable source_events'); END;
CREATE TRIGGER immutable_source_events_UPDATE BEFORE UPDATE ON source_events BEGIN SELECT RAISE(ABORT,'immutable source_events'); END;
CREATE TRIGGER immutable_statistics_DELETE BEFORE DELETE ON statistics BEGIN SELECT RAISE(ABORT,'immutable statistics'); END;
CREATE TRIGGER immutable_statistics_UPDATE BEFORE UPDATE ON statistics BEGIN SELECT RAISE(ABORT,'immutable statistics'); END;
CREATE TRIGGER line_shape BEFORE INSERT ON lines WHEN
 json_extract(NEW.data,'$.account') IS NOT NEW.account
 OR json_extract(NEW.data,'$.debit') IS NOT NEW.debit OR json_extract(NEW.data,'$.credit') IS NOT NEW.credit
 OR json_extract(NEW.data,'$.transactionDebit') IS NOT NEW.debit OR json_extract(NEW.data,'$.transactionCredit') IS NOT NEW.credit
 OR json_extract(NEW.data,'$.accountingCurrency') IS NOT (SELECT currency FROM companies WHERE code=NEW.company)
 OR json_extract(NEW.data,'$.currency') IS NOT (SELECT currency FROM companies WHERE code=NEW.company)
 OR json_extract(NEW.data,'$.reportingCurrency') IS NOT (SELECT report_currency FROM companies WHERE code=NEW.company)
 OR json_type(NEW.data,'$.debit') IS NOT 'integer' OR json_type(NEW.data,'$.credit') IS NOT 'integer'
 OR json_type(NEW.data,'$.transactionDebit') IS NOT 'integer' OR json_type(NEW.data,'$.transactionCredit') IS NOT 'integer'
 OR ((SELECT currency=report_currency FROM companies WHERE code=NEW.company) AND
 (json_extract(NEW.data,'$.reportingDebit') IS NOT NEW.debit OR json_extract(NEW.data,'$.reportingCredit') IS NOT NEW.credit))
 OR ((SELECT currency!=report_currency FROM companies WHERE code=NEW.company) AND
 (json_type(NEW.data,'$.reportingDebit') IS NOT 'null' OR json_type(NEW.data,'$.reportingCredit') IS NOT 'null'))
 OR json_type(NEW.data,'$.rateRefs.accounting') IS NOT 'null' OR json_type(NEW.data,'$.rateRefs.reporting') IS NOT 'null'
 OR json_type(NEW.data,'$.dimensions') IS NOT 'object'
 OR json_type(NEW.data,'$.dimensionOrigins') IS NOT 'object'
 OR json_type(NEW.data,'$.metadata') IS NOT 'object'
 BEGIN SELECT RAISE(ABORT,'invalid normalized line'); END;
CREATE TRIGGER seal_balance BEFORE INSERT ON journal_seals BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM lines WHERE company=NEW.company AND journal_id=NEW.journal_id)<2
 OR (SELECT sum(debit)!=sum(credit) OR sum(debit)>9007199254740991 FROM lines WHERE company=NEW.company AND journal_id=NEW.journal_id)
 THEN RAISE(ABORT,'unbalanced journal') END; END;
CREATE TRIGGER sealed_lines BEFORE INSERT ON lines WHEN EXISTS(SELECT 1 FROM journal_seals WHERE company=NEW.company AND journal_id=NEW.journal_id)
 BEGIN SELECT RAISE(ABORT,'immutable posted lines'); END;
CREATE TRIGGER used_account_identity BEFORE UPDATE ON accounts WHEN
 EXISTS(SELECT 1 FROM lines WHERE company=OLD.company AND account=OLD.code) AND
 (NEW.company!=OLD.company OR NEW.code!=OLD.code OR NEW.category!=OLD.category OR NEW.purpose!=OLD.purpose
 OR json_extract(NEW.data,'$.controlModule') IS NOT json_extract(OLD.data,'$.controlModule')
 OR json_extract(NEW.data,'$.normalSide') IS NOT json_extract(OLD.data,'$.normalSide')
 OR json_extract(NEW.data,'$.contraOf') IS NOT json_extract(OLD.data,'$.contraOf'))
 BEGIN SELECT RAISE(ABORT,'immutable used account identity'); END;
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA user_version=1;
