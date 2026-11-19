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
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (5,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (6,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (7,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (8,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (9,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (10,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (11,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (12,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (13,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (14,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (15,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (16,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (17,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (18,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (19,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (20,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (21,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (22,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (23,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (24,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (25,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (26,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (27,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (28,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (29,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (30,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (31,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (32,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (33,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (34,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (35,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (36,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (37,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (38,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (39,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (40,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (41,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (42,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (43,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (44,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (45,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (46,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (47,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (48,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (49,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (50,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (51,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (52,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (53,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (54,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (55,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (56,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (57,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (58,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (59,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (60,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (61,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (62,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (63,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (64,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (65,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (66,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (67,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (68,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (69,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (70,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (71,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (72,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (73,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (74,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (75,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (76,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (77,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (78,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (79,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (80,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (81,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (82,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (83,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (84,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (85,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (86,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (87,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (88,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (89,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (90,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (91,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (92,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (93,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (94,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (95,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (96,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (97,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (98,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (99,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (100,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (101,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (102,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (103,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (104,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "journals" ("id","date","memo","kind","status","reversal_of") VALUES (105,'2026-01-10','Fictional 2026-01-10','normal','posted',NULL);
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (7,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (8,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (9,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (10,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (11,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (12,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (13,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (14,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (15,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (16,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (17,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (18,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (19,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (20,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (21,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (22,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (23,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (24,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (25,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (26,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (27,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (28,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (29,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (30,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (31,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (32,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (33,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (34,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (35,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (36,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (37,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (38,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (39,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (40,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (41,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (42,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (43,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (44,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (45,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (46,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (47,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (48,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (49,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (50,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (51,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (52,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (53,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (54,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (55,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (56,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (57,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (58,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (59,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (60,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (61,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (62,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (63,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (64,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (65,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (66,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (67,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (68,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (69,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (70,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (71,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (72,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (73,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (74,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (75,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (76,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (77,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (78,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (79,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (80,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (81,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (82,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (83,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (84,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (85,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (86,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (87,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (88,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (89,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (90,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (91,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (92,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (93,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (94,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (95,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (96,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (97,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (98,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (99,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (100,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (101,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (102,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (103,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (104,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (105,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (106,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (107,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (108,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (109,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (110,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (111,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (112,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (113,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (114,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (115,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (116,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (117,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (118,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (119,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (120,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (121,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (122,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (123,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (124,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (125,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (126,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (127,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (128,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (129,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (130,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (131,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (132,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (133,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (134,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (135,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (136,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (137,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (138,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (139,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (140,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (141,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (142,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (143,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (144,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (145,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (146,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (147,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (148,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (149,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (150,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (151,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (152,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (153,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (154,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (155,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (156,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (157,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (158,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (159,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (160,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (161,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (162,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (163,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (164,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (165,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (166,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (167,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (168,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (169,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (170,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (171,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (172,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (173,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (174,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (175,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (176,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (177,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (178,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (179,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (180,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (181,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (182,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (183,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (184,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (185,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (186,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (187,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (188,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (189,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (190,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (191,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (192,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (193,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (194,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (195,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (196,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (197,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (198,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (199,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (200,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (201,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (202,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (203,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (204,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (205,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (206,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (207,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (208,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (209,'TEAM','A');
INSERT INTO "line_dimensions" ("line_id","dimension","value") VALUES (210,'TEAM','A');
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (1,1,'1000',1200000,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (2,1,'3000',0,1200000);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (3,2,'1000',200000,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (4,2,'4000',0,200000);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (5,3,'1000',725,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (6,3,'4000',0,725);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (7,4,'1000',325,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (8,4,'4000',0,325);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (9,5,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (10,5,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (11,6,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (12,6,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (13,7,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (14,7,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (15,8,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (16,8,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (17,9,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (18,9,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (19,10,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (20,10,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (21,11,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (22,11,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (23,12,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (24,12,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (25,13,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (26,13,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (27,14,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (28,14,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (29,15,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (30,15,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (31,16,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (32,16,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (33,17,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (34,17,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (35,18,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (36,18,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (37,19,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (38,19,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (39,20,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (40,20,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (41,21,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (42,21,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (43,22,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (44,22,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (45,23,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (46,23,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (47,24,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (48,24,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (49,25,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (50,25,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (51,26,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (52,26,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (53,27,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (54,27,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (55,28,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (56,28,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (57,29,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (58,29,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (59,30,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (60,30,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (61,31,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (62,31,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (63,32,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (64,32,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (65,33,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (66,33,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (67,34,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (68,34,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (69,35,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (70,35,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (71,36,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (72,36,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (73,37,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (74,37,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (75,38,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (76,38,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (77,39,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (78,39,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (79,40,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (80,40,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (81,41,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (82,41,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (83,42,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (84,42,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (85,43,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (86,43,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (87,44,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (88,44,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (89,45,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (90,45,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (91,46,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (92,46,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (93,47,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (94,47,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (95,48,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (96,48,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (97,49,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (98,49,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (99,50,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (100,50,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (101,51,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (102,51,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (103,52,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (104,52,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (105,53,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (106,53,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (107,54,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (108,54,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (109,55,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (110,55,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (111,56,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (112,56,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (113,57,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (114,57,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (115,58,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (116,58,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (117,59,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (118,59,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (119,60,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (120,60,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (121,61,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (122,61,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (123,62,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (124,62,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (125,63,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (126,63,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (127,64,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (128,64,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (129,65,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (130,65,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (131,66,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (132,66,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (133,67,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (134,67,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (135,68,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (136,68,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (137,69,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (138,69,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (139,70,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (140,70,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (141,71,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (142,71,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (143,72,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (144,72,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (145,73,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (146,73,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (147,74,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (148,74,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (149,75,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (150,75,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (151,76,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (152,76,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (153,77,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (154,77,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (155,78,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (156,78,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (157,79,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (158,79,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (159,80,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (160,80,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (161,81,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (162,81,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (163,82,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (164,82,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (165,83,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (166,83,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (167,84,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (168,84,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (169,85,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (170,85,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (171,86,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (172,86,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (173,87,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (174,87,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (175,88,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (176,88,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (177,89,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (178,89,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (179,90,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (180,90,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (181,91,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (182,91,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (183,92,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (184,92,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (185,93,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (186,93,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (187,94,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (188,94,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (189,95,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (190,95,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (191,96,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (192,96,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (193,97,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (194,97,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (195,98,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (196,98,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (197,99,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (198,99,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (199,100,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (200,100,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (201,101,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (202,101,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (203,102,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (204,102,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (205,103,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (206,103,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (207,104,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (208,104,'4000',0,1);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (209,105,'1000',1,0);
INSERT INTO "lines" ("id","journal_id","account","debit","credit") VALUES (210,105,'4000',0,1);
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
