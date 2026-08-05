# Ticket inventory and order holds

`ticketing` owns idempotent pending orders and short inventory reservations. Prices are copied from immutable ticket-type Decimal128 values into order items; totals are calculated in integer minor units and persisted as Decimal128 with one ISO currency per order.

The public create endpoint accepts `Idempotency-Key` and creates the order, line items, ticket-type reservation increments and privacy-safe audit event in one MongoDB transaction. Holds default to ten minutes and the composed expiry worker atomically marks abandoned orders expired before releasing every reservation.

Late verified payments are intentionally not accepted blindly. `ReconcileLatePayment` is callable only from a trusted server-side payment workflow. It either atomically restores the complete reservation and returns the order to `awaiting_payment`, or restores nothing and flags `reconciliation_required` for manual resolution. Ticket issuance remains JK-023 and must only follow JK-022 verified webhook confirmation.
