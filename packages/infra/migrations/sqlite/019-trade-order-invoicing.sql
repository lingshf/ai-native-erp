-- TORD-06: stored order invoicing status (one row per order), kept in the invoice post / cancel transaction; migrate backfills partial / full.
CREATE TABLE trade_order_invoicing (
  company_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('none','partial','full')),
  PRIMARY KEY(company_id,order_id),
  FOREIGN KEY(company_id,order_id) REFERENCES trade_orders(company_id,order_id)
) WITHOUT ROWID;
CREATE INDEX trade_order_invoicing_status ON trade_order_invoicing(company_id,status,order_id);
CREATE TRIGGER trade_order_invoicing_no_delete BEFORE DELETE ON trade_order_invoicing BEGIN SELECT RAISE(ABORT,'immutable order invoicing'); END;
CREATE TRIGGER trade_order_invoicing_status_only BEFORE UPDATE ON trade_order_invoicing WHEN NEW.company_id IS NOT OLD.company_id OR NEW.order_id IS NOT OLD.order_id BEGIN SELECT RAISE(ABORT,'order invoicing identity is immutable'); END;
CREATE TRIGGER trade_orders_invoicing_seed AFTER INSERT ON trade_orders BEGIN INSERT INTO trade_order_invoicing(company_id,order_id,status) VALUES(NEW.company_id,NEW.order_id,'none'); END;
INSERT INTO trade_order_invoicing(company_id,order_id,status) SELECT company_id,order_id,'none' FROM trade_orders;
