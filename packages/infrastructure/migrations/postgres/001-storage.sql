CREATE TABLE public.schema_migrations (
  version BIGINT NOT NULL PRIMARY KEY CHECK(version>0),
  dialect TEXT NOT NULL CHECK(dialect IN ('sqlite','postgres')),
  checksum TEXT NOT NULL CHECK(length(checksum)=64),
  schema_fingerprint TEXT NOT NULL CHECK(length(schema_fingerprint)=64)
);
CREATE TABLE public.tenants (
  tenant_id TEXT COLLATE "C" NOT NULL PRIMARY KEY CHECK(tenant_id ~ '^[A-Z0-9][A-Z0-9_.:-]{0,59}$'),
  revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE public.books (
  tenant_id TEXT COLLATE "C" NOT NULL,
  book_id TEXT COLLATE "C" NOT NULL CHECK(book_id ~ '^[A-Z0-9][A-Z0-9_.:-]{0,59}$'),
  revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(tenant_id,book_id),
  FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE public.companies (
  tenant_id TEXT COLLATE "C" NOT NULL,
  book_id TEXT COLLATE "C" NOT NULL,
  company_id TEXT COLLATE "C" NOT NULL CHECK(company_id ~ '^[A-Z0-9][A-Z0-9_.:-]{0,59}$'),
  revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(tenant_id,book_id,company_id),
  FOREIGN KEY(tenant_id,book_id) REFERENCES public.books(tenant_id,book_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE public.receipts (
  tenant_id TEXT COLLATE "C" NOT NULL,
  book_id TEXT COLLATE "C" NOT NULL,
  company_id TEXT COLLATE "C" NOT NULL,
  operation TEXT COLLATE "C" NOT NULL CHECK(operation ~ '^[a-z][a-z0-9_.:-]{0,59}$'),
  receipt_key TEXT COLLATE "C" NOT NULL CHECK(receipt_key ~ '^[ -~]{1,100}$'),
  principal TEXT NOT NULL CHECK(length(principal) BETWEEN 1 AND 255 AND principal !~ U&'[\0001-\001f\007f-\009f]'),
  fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
  result TEXT NOT NULL CHECK(octet_length(result)<=65536 AND result::json IS NOT NULL),
  version BIGINT NOT NULL CHECK(version=1),
  PRIMARY KEY(tenant_id,book_id,company_id,operation,receipt_key),
  FOREIGN KEY(tenant_id,book_id,company_id) REFERENCES public.companies(tenant_id,book_id,company_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE public.audit (
  tenant_id TEXT COLLATE "C" NOT NULL,
  book_id TEXT COLLATE "C" NOT NULL,
  company_id TEXT COLLATE "C" NOT NULL,
  sequence BIGINT NOT NULL CHECK(sequence BETWEEN 1 AND 9007199254740991),
  operation TEXT COLLATE "C" NOT NULL CHECK(operation ~ '^[a-z][a-z0-9_.:-]{0,59}$'),
  reference TEXT COLLATE "C" NOT NULL CHECK(reference ~ '^[ -~]{1,100}$'),
  principal TEXT NOT NULL CHECK(length(principal) BETWEEN 1 AND 255 AND principal !~ U&'[\0001-\001f\007f-\009f]'),
  details TEXT NOT NULL CHECK(octet_length(details)<=65536 AND details::json IS NOT NULL),
  recorded_at TEXT NOT NULL CHECK(recorded_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'),
  PRIMARY KEY(tenant_id,book_id,company_id,sequence),
  FOREIGN KEY(tenant_id,book_id,company_id) REFERENCES public.companies(tenant_id,book_id,company_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE FUNCTION public.reject_evidence_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable evidence' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER receipts_no_update BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.reject_evidence_change();
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.reject_evidence_change();
CREATE TRIGGER receipts_no_truncate BEFORE TRUNCATE ON public.receipts FOR EACH STATEMENT EXECUTE FUNCTION public.reject_evidence_change();
CREATE TRIGGER audit_no_update BEFORE UPDATE ON public.audit FOR EACH ROW EXECUTE FUNCTION public.reject_evidence_change();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON public.audit FOR EACH ROW EXECUTE FUNCTION public.reject_evidence_change();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON public.audit FOR EACH STATEMENT EXECUTE FUNCTION public.reject_evidence_change();
