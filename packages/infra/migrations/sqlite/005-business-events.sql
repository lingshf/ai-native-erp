CREATE TABLE business_services (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL, name TEXT NOT NULL, group_code TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN(0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  dimensions TEXT NOT NULL CHECK(json_valid(dimensions) AND json_type(dimensions)='object'),
  PRIMARY KEY(company_id,code)
);
CREATE TABLE business_parties (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL, name TEXT NOT NULL, group_code TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN(0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  dimensions TEXT NOT NULL CHECK(json_valid(dimensions) AND json_type(dimensions)='object'),
  PRIMARY KEY(company_id,code)
);
CREATE TABLE posting_rules (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  code TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN(0,1)),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  direction TEXT NOT NULL CHECK(direction IN('receive','pay')),
  meaning TEXT NOT NULL CHECK(meaning IN('cash','offset')),
  object_scope TEXT NOT NULL CHECK(object_scope IN('exact','group','all')),
  object_code TEXT NOT NULL CHECK((object_scope='all')=(object_code='*')),
  party_scope TEXT NOT NULL CHECK(party_scope IN('exact','group','all')),
  party_code TEXT NOT NULL CHECK((party_scope='all')=(party_code='*')),
  account_code TEXT NOT NULL,
  dimensions TEXT NOT NULL CHECK(json_valid(dimensions) AND json_type(dimensions)='object'),
  valid_from TEXT NOT NULL, valid_to TEXT NOT NULL CHECK(valid_from<=valid_to),
  PRIMARY KEY(company_id,code),
  FOREIGN KEY(company_id,account_code) REFERENCES accounts(company_id,code)
);
CREATE TABLE business_config_history (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  kind TEXT NOT NULL CHECK(kind IN('service','party','rule')),
  code TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(company_id,kind,code,revision)
);
CREATE TABLE business_events (
  company_id TEXT NOT NULL REFERENCES ledger_companies(company_id),
  id TEXT NOT NULL UNIQUE CHECK(length(id)=36),
  source_ref TEXT NOT NULL, accounting_date TEXT NOT NULL, memo TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN('journal','cash_service','cash_service.cancel','statistics','clearing.match')),
  original_event_id TEXT,
  input TEXT NOT NULL CHECK(json_valid(input) AND json_type(input)='object'),
  preview TEXT NOT NULL CHECK(json_valid(preview) AND json_type(preview)='object'),
  receipt_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  CHECK((operation='cash_service.cancel')=(original_event_id IS NOT NULL)),
  PRIMARY KEY(company_id,id),
  UNIQUE(company_id,source_ref),
  FOREIGN KEY(company_id,receipt_key) REFERENCES receipts(company_id,idempotency_key),
  FOREIGN KEY(company_id,original_event_id) REFERENCES business_events(company_id,id)
);
CREATE UNIQUE INDEX business_event_cancel ON business_events(company_id,original_event_id) WHERE original_event_id IS NOT NULL;
CREATE TABLE business_event_journals (
  company_id TEXT NOT NULL, event_id TEXT NOT NULL, journal_id TEXT NOT NULL,
  PRIMARY KEY(company_id,event_id,journal_id), UNIQUE(company_id,journal_id),
  FOREIGN KEY(company_id,event_id) REFERENCES business_events(company_id,id),
  FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id)
);
CREATE TABLE statistics_facts (
  company_id TEXT NOT NULL, event_id TEXT NOT NULL, code TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL CHECK(typeof(quantity_minor)='integer' AND quantity_minor BETWEEN -9007199254740991 AND 9007199254740991),
  scale INTEGER NOT NULL CHECK(scale=6),
  unit TEXT NOT NULL,
  dimensions TEXT NOT NULL CHECK(json_valid(dimensions) AND json_type(dimensions)='object'),
  origins TEXT NOT NULL CHECK(json_valid(origins)),
  PRIMARY KEY(company_id,event_id),
  FOREIGN KEY(company_id,event_id) REFERENCES business_events(company_id,id)
);
CREATE TABLE business_clearing_links (
  company_id TEXT NOT NULL, entry_id TEXT NOT NULL, line_no INTEGER NOT NULL, event_id TEXT NOT NULL,
  PRIMARY KEY(company_id,entry_id,line_no),
  FOREIGN KEY(company_id,event_id) REFERENCES business_events(company_id,id),
  FOREIGN KEY(company_id,entry_id,line_no) REFERENCES journal_lines(company_id,entry_id,line_no)
);
CREATE INDEX journal_lines_open_items ON journal_lines(company_id,account_code,entry_id,line_no);
CREATE TABLE transfer_queue (
  company_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('pending','failed','transferred','withdrawn')),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  journal_ids TEXT NOT NULL CHECK(json_valid(journal_ids) AND json_type(journal_ids)='array'),
  transfer_fingerprint TEXT, transfer_plan TEXT CHECK(transfer_plan IS NULL OR json_valid(transfer_plan)),
  error TEXT, reason TEXT,
  CHECK((status='transferred' AND json_array_length(journal_ids) BETWEEN 1 AND 2 AND transfer_fingerprint IS NOT NULL AND length(transfer_fingerprint)=64 AND transfer_plan IS NOT NULL)
     OR (status<>'transferred' AND json_array_length(journal_ids)=0 AND transfer_fingerprint IS NULL AND transfer_plan IS NULL)),
  CHECK((status='withdrawn' AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 200) OR (status<>'withdrawn' AND reason IS NULL)),
  CHECK((status='failed' AND error IS NOT NULL AND length(error) BETWEEN 1 AND 80) OR (status<>'failed' AND error IS NULL)),
  PRIMARY KEY(company_id,id),
  FOREIGN KEY(company_id,id) REFERENCES business_events(company_id,id)
);
CREATE INDEX transfer_queue_status_created ON transfer_queue(company_id,status,created_at,id);
CREATE TRIGGER transfer_queue_source BEFORE INSERT ON transfer_queue
  WHEN (SELECT operation FROM business_events WHERE company_id=NEW.company_id AND id=NEW.id)<>'journal'
  BEGIN SELECT RAISE(ABORT,'invalid transfer source'); END;
CREATE TRIGGER transfer_queue_transition BEFORE UPDATE ON transfer_queue
  WHEN OLD.status IN('transferred','withdrawn') OR NEW.company_id<>OLD.company_id OR NEW.id<>OLD.id
    OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NEW.status='pending'
  BEGIN SELECT RAISE(ABORT,'invalid transfer transition'); END;
CREATE TRIGGER transfer_queue_no_delete BEFORE DELETE ON transfer_queue BEGIN SELECT RAISE(ABORT,'immutable transfer identity'); END;
CREATE TRIGGER business_config_history_no_update BEFORE UPDATE ON business_config_history BEGIN SELECT RAISE(ABORT,'immutable business history'); END;
CREATE TRIGGER business_config_history_no_delete BEFORE DELETE ON business_config_history BEGIN SELECT RAISE(ABORT,'immutable business history'); END;
CREATE TRIGGER business_events_no_update BEFORE UPDATE ON business_events BEGIN SELECT RAISE(ABORT,'immutable event'); END;
CREATE TRIGGER business_events_no_delete BEFORE DELETE ON business_events BEGIN SELECT RAISE(ABORT,'immutable event'); END;
CREATE TRIGGER business_event_journals_no_update BEFORE UPDATE ON business_event_journals BEGIN SELECT RAISE(ABORT,'immutable event journal'); END;
CREATE TRIGGER business_event_journals_no_delete BEFORE DELETE ON business_event_journals BEGIN SELECT RAISE(ABORT,'immutable event journal'); END;
CREATE TRIGGER statistics_facts_no_update BEFORE UPDATE ON statistics_facts BEGIN SELECT RAISE(ABORT,'immutable statistic'); END;
CREATE TRIGGER statistics_facts_no_delete BEFORE DELETE ON statistics_facts BEGIN SELECT RAISE(ABORT,'immutable statistic'); END;
CREATE TRIGGER business_clearing_links_no_update BEFORE UPDATE ON business_clearing_links BEGIN SELECT RAISE(ABORT,'immutable clearing link'); END;
CREATE TRIGGER business_clearing_links_no_delete BEFORE DELETE ON business_clearing_links BEGIN SELECT RAISE(ABORT,'immutable clearing link'); END;
