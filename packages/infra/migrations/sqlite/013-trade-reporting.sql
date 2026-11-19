ALTER TABLE periods ADD COLUMN modules TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(modules) AND json_type(modules)='array');
CREATE INDEX trade_actions_reporting ON trade_actions(company_id,accounting_date,action_id);
CREATE INDEX open_items_reporting ON open_items(company_id,accounting_date,item_id);
