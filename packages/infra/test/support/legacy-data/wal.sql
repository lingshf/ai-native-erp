-- Deterministic fictional legacy fixture captured before removal at main a401d6f.
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE account_dimension_structures (
        account TEXT PRIMARY KEY REFERENCES accounts(code),
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0),
        segments_json TEXT NOT NULL, allowed_json TEXT NOT NULL);
CREATE TABLE account_properties (
        code TEXT PRIMARY KEY REFERENCES accounts(code),
        normal_side TEXT NOT NULL CHECK(normal_side IN ('DEBIT','CREDIT')),
        purpose TEXT NOT NULL CHECK(purpose IN ('general','contra')),
        related_account TEXT REFERENCES accounts(code),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0),
        CHECK((purpose='general' AND related_account IS NULL)
          OR (purpose='contra' AND related_account IS NOT NULL AND related_account<>code)));
CREATE TABLE account_settings (
        code TEXT PRIMARY KEY REFERENCES accounts(code),
        active INTEGER NOT NULL CHECK(active IN (0,1)),
        manual_allowed INTEGER NOT NULL CHECK(manual_allowed IN (0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0));
CREATE TABLE accounts (
        code TEXT PRIMARY KEY, name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')));
CREATE TABLE dimension_values (
        dimension TEXT NOT NULL REFERENCES dimensions(code), code TEXT NOT NULL, name TEXT NOT NULL,
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0),
        PRIMARY KEY(dimension,code));
CREATE TABLE dimensions (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0));
CREATE TABLE journals (
        id INTEGER PRIMARY KEY, date TEXT NOT NULL, memo TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('normal','adjusting','reversal','closing')),
        status TEXT NOT NULL CHECK(status IN ('draft','posted')),
        reversal_of INTEGER UNIQUE REFERENCES journals(id));
CREATE TABLE line_dimensions (
        line_id INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
        dimension TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY(line_id,dimension),
        FOREIGN KEY(dimension,value) REFERENCES dimension_values(dimension,code));
CREATE TABLE lines (
        id INTEGER PRIMARY KEY, journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
        account TEXT NOT NULL REFERENCES accounts(code),
        debit INTEGER NOT NULL CHECK(typeof(debit)='integer' AND debit>=0),
        credit INTEGER NOT NULL CHECK(typeof(credit)='integer' AND credit>=0),
        CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
CREATE TABLE periods (
        month TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('open','closed')));
CREATE TABLE posting_events (
        reference TEXT PRIMARY KEY, input_json TEXT NOT NULL, plan_json TEXT NOT NULL,
        preview_token TEXT NOT NULL, journal_id INTEGER NOT NULL UNIQUE REFERENCES journals(id));
CREATE TABLE posting_rules (
        id INTEGER PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN('service','group','all')),
        match_code TEXT NOT NULL, revenue_account TEXT NOT NULL REFERENCES accounts(code),
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0));
CREATE TABLE teaching_services (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, group_code TEXT NOT NULL,
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0));
INSERT INTO "account_settings" ("code","active","manual_allowed","revision") VALUES ('1100',0,0,2);
INSERT INTO "accounts" ("code","name","category") VALUES ('1000','现金 / Cash','ASSET');
INSERT INTO "accounts" ("code","name","category") VALUES ('1200','预付费用 / Prepayments','ASSET');
INSERT INTO "accounts" ("code","name","category") VALUES ('2000','应计负债 / Accrued liabilities','LIABILITY');
INSERT INTO "accounts" ("code","name","category") VALUES ('3000','投入资本 / Contributed capital','EQUITY');
INSERT INTO "accounts" ("code","name","category") VALUES ('3100','留存收益 / Retained earnings','EQUITY');
INSERT INTO "accounts" ("code","name","category") VALUES ('4000','服务收入 / Service revenue','REVENUE');
INSERT INTO "accounts" ("code","name","category") VALUES ('5000','租金费用 / Rent expense','EXPENSE');
INSERT INTO "accounts" ("code","name","category") VALUES ('5100','工资费用 / Wages expense','EXPENSE');
INSERT INTO "accounts" ("code","name","category") VALUES ('1100','Historical disabled account','ASSET');
INSERT INTO "dimension_values" ("dimension","code","name","active","revision") VALUES ('TEAM','A','Fictional A',1,1);
INSERT INTO "dimensions" ("code","name","active","revision") VALUES ('TEAM','Fictional team',1,1);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (1,'2026-01-01','教学示例：投入资本 12,000','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (2,'2026-01-01','教学示例：现金服务收入 2,000','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (3,'2026-01-15','Retain fictional draft ID3','normal','draft',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (4,'2026-01-20','Fictional 2026-01-20','adjusting','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (5,'2026-01-25','Fictional 2026-01-25','normal','posted',NULL);
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (7,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (8,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (9,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (10,'TEAM','A');
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (1,1,'1000',1200000,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (2,1,'3000',0,1200000);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (3,2,'1000',200000,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (4,2,'4000',0,200000);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (5,3,'1000',725,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (6,3,'4000',0,725);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (7,4,'1000',325,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (8,4,'4000',0,325);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (9,5,'1000',123,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (10,5,'4000',0,123);
INSERT INTO "periods" ("month","status") VALUES ('2026-01','open');
CREATE TRIGGER immutable_dimension_delete BEFORE DELETE ON line_dimensions
        WHEN (SELECT j.status FROM lines l JOIN journals j ON j.id=l.journal_id WHERE l.id=OLD.line_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted dimensions are immutable'); END;
CREATE TRIGGER immutable_dimension_insert BEFORE INSERT ON line_dimensions
        WHEN (SELECT j.status FROM lines l JOIN journals j ON j.id=l.journal_id WHERE l.id=NEW.line_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted dimensions are immutable'); END;
CREATE TRIGGER immutable_dimension_update BEFORE UPDATE ON line_dimensions
        WHEN (SELECT j.status FROM lines l JOIN journals j ON j.id=l.journal_id WHERE l.id=OLD.line_id)='posted'
          OR (SELECT j.status FROM lines l JOIN journals j ON j.id=l.journal_id WHERE l.id=NEW.line_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted dimensions are immutable'); END;
CREATE TRIGGER immutable_event_delete BEFORE DELETE ON posting_events
        BEGIN SELECT RAISE(ABORT,'Posted source event is immutable'); END;
CREATE TRIGGER immutable_event_update BEFORE UPDATE ON posting_events
        BEGIN SELECT RAISE(ABORT,'Posted source event is immutable'); END;
CREATE TRIGGER immutable_journal_delete BEFORE DELETE ON journals
        WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;
CREATE TRIGGER immutable_journal_update BEFORE UPDATE ON journals
        WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;
CREATE TRIGGER immutable_line_delete BEFORE DELETE ON lines
        WHEN (SELECT status FROM journals WHERE id=OLD.journal_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
CREATE TRIGGER immutable_line_insert BEFORE INSERT ON lines
        WHEN (SELECT status FROM journals WHERE id=NEW.journal_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
CREATE TRIGGER immutable_line_update BEFORE UPDATE ON lines
        WHEN (SELECT status FROM journals WHERE id=OLD.journal_id)='posted'
          OR (SELECT status FROM journals WHERE id=NEW.journal_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
CREATE TRIGGER source_event_insert BEFORE INSERT ON posting_events
        WHEN NOT EXISTS(SELECT 1 FROM journals WHERE id=NEW.journal_id AND status='posted'
          AND kind='normal' AND reversal_of IS NULL)
        BEGIN SELECT RAISE(ABORT,'Source event requires a posted normal journal'); END;
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA user_version=0;
