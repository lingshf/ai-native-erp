CREATE TABLE schema_migrations (
  version BIGINT NOT NULL PRIMARY KEY CHECK(version>0),
  dialect TEXT NOT NULL CHECK(dialect IN ('sqlite','postgres')),
  checksum TEXT NOT NULL CHECK(length(checksum)=64),
  schema_fingerprint TEXT NOT NULL CHECK(length(schema_fingerprint)=64)
);
CREATE TABLE tenants (
  tenant_id TEXT NOT NULL PRIMARY KEY CHECK(length(tenant_id) BETWEEN 1 AND 60 AND instr(tenant_id,char(0))=0 AND tenant_id NOT GLOB '*[^A-Z0-9_.:-]*' AND substr(tenant_id,1,1) GLOB '[A-Z0-9]'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE books (
  tenant_id TEXT NOT NULL,
  book_id TEXT NOT NULL CHECK(length(book_id) BETWEEN 1 AND 60 AND instr(book_id,char(0))=0 AND book_id NOT GLOB '*[^A-Z0-9_.:-]*' AND substr(book_id,1,1) GLOB '[A-Z0-9]'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(tenant_id,book_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(tenant_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE companies (
  tenant_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  company_id TEXT NOT NULL CHECK(length(company_id) BETWEEN 1 AND 60 AND instr(company_id,char(0))=0 AND company_id NOT GLOB '*[^A-Z0-9_.:-]*' AND substr(company_id,1,1) GLOB '[A-Z0-9]'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(tenant_id,book_id,company_id),
  FOREIGN KEY(tenant_id,book_id) REFERENCES books(tenant_id,book_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE receipts (
  tenant_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(length(operation) BETWEEN 1 AND 60 AND instr(operation,char(0))=0 AND operation NOT GLOB '*[^a-z0-9_.:-]*' AND substr(operation,1,1) GLOB '[a-z]'),
  receipt_key TEXT NOT NULL CHECK(length(receipt_key) BETWEEN 1 AND 100 AND receipt_key NOT GLOB '*[^ -~]*' AND instr(receipt_key,char(0))=0),
  principal TEXT NOT NULL CHECK(length(principal) BETWEEN 1 AND 255 AND instr(principal,char(0))=0 AND principal NOT GLOB ('*[' || char(1) || '-' || char(31) || char(127) || '-' || char(159) || ']*')),
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64 AND instr(fingerprint,char(0))=0 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  result TEXT NOT NULL CHECK(typeof(result)='text' AND length(CAST(result AS BLOB))<=65536 AND json_valid(result)),
  version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version=1),
  PRIMARY KEY(tenant_id,book_id,company_id,operation,receipt_key),
  FOREIGN KEY(tenant_id,book_id,company_id) REFERENCES companies(tenant_id,book_id,company_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE audit (
  tenant_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence BETWEEN 1 AND 9007199254740991),
  operation TEXT NOT NULL CHECK(length(operation) BETWEEN 1 AND 60 AND instr(operation,char(0))=0 AND operation NOT GLOB '*[^a-z0-9_.:-]*' AND substr(operation,1,1) GLOB '[a-z]'),
  reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 100 AND reference NOT GLOB '*[^ -~]*' AND instr(reference,char(0))=0),
  principal TEXT NOT NULL CHECK(length(principal) BETWEEN 1 AND 255 AND instr(principal,char(0))=0 AND principal NOT GLOB ('*[' || char(1) || '-' || char(31) || char(127) || '-' || char(159) || ']*')),
  details TEXT NOT NULL CHECK(typeof(details)='text' AND length(CAST(details AS BLOB))<=65536 AND json_valid(details)),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at)=24 AND recorded_at GLOB '????-??-??T??:??:??.???Z'),
  PRIMARY KEY(tenant_id,book_id,company_id,sequence),
  FOREIGN KEY(tenant_id,book_id,company_id) REFERENCES companies(tenant_id,book_id,company_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TRIGGER receipts_no_update BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
