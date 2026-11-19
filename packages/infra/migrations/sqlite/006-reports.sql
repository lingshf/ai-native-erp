CREATE INDEX journal_lines_ledger_account ON journal_lines(company_id,account_code,period,entry_id,line_no);
CREATE INDEX journal_entries_ledger_date ON journal_entries(company_id,period,accounting_date,id);
CREATE INDEX journal_lines_report_totals ON journal_lines(company_id,period,account_code,debit_minor,credit_minor);
