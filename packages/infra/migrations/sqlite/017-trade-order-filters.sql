-- TORD-05: order-list partner filter; equality on party plus the order_id keyset, already in order_id order.
CREATE INDEX trade_orders_party ON trade_orders(company_id, party_id, order_id);
