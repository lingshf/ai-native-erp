-- TINV-05: invoice-list partner filter; equality on party plus the sequence keyset, already in sequence order.
CREATE INDEX trade_documents_party ON trade_documents(company_id, party_id, sequence);
