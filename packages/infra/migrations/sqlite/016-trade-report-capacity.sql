-- D51/M1-R3: covering index so report balances sum settlements per item without table lookups.
CREATE INDEX settlements_report ON settlements(company_id,item_id,accounting_date,applied_gross_minor,applied_net_minor,applied_tax_minor);
