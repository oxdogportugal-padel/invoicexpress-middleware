# Interface contract (round 1)

Minimal, stable decisions so independently-built pieces agree on shapes without
reading each other's code. Implementation details beyond this are each piece's
own call — this file only fixes what would otherwise cause integration
conflicts.

## Webhook ingestion

- `POST /webhooks/zoho/salesorder`
- Body: the raw Zoho Inventory sales order object, same shape as
  `src/types/zoho.ts`'s `ZohoSalesOrder` (equivalently, the `data.salesorder`
  value in `fixtures/golden/*/sales_order.json`). Zoho's real webhook envelope
  is not something this project has observed directly; this is a documented
  assumption, not a verified fact — the webhook handler should validate the
  shape defensively and reject anything malformed (SPEC.md §3 Bar D: "malformed
  or replayed webhook payload from an untrusted source").
- Processing is synchronous: the response reflects the final outcome of this
  attempt (not just "accepted").
- Response body includes at minimum: `{ "correlationId": string, "orderId": number, "status": OrderStatus }`
  where `OrderStatus` is one of the values in `src/db/orderStore.ts`.
- Idempotency: `orders.zoho_salesorder_id` is UNIQUE (`src/db/orderStore.ts`).
  A second delivery for an already-`succeeded` order must return the existing
  invoice, not create a second one — the exact status/response shape for a
  replay is the webhook piece's own design decision, as long as it never
  results in a second InvoiceXpress invoice for the same sales order.

## Dashboard / Bar E interface (already built, `src/routes/dashboard.ts`)

- `GET /` — order list + status counts.
- `GET /orders/:id` — one order's full detail: status, stage, correlation ID,
  every external call's request/response (redacted), log lines, a replay form
  posting to `POST /orders/:id/replay` (not yet wired to real replay logic —
  that's the webhook/idempotency piece's job).
- `GET /api/orders`, `GET /api/orders/:id` — JSON mirrors of the above.

## Mapping pipeline (owned by separate pieces, composed by "invoice assembly")

Each mapping piece is a pure function/module, independently unit-testable
against `fixtures/golden/*`:

- `src/mapping/discountTax.ts` — per Zoho line item, returns the InvoiceXpress
  `unit_price` (tax-exclusive), `discount` (percentage, 0-100), and resolved
  `tax_id`/`tax` — or a explicit "cannot determine with certainty" result.
- `src/mapping/customerResolution.ts` — given Zoho customer fields, resolves to
  an existing InvoiceXpress client ID, or an explicit "ambiguous"/"not found"
  result. Never creates a client itself (SPEC.md §2 hard gate).
- `src/mapping/itemResolution.ts` — given a Zoho line item's `sku`, resolves to
  an existing InvoiceXpress catalog item, or an explicit "not found" result.
  No SKU-based search endpoint exists on InvoiceXpress (SPEC.md §4) — resolve
  against a locally-held snapshot of the full IX item catalog, exact match on
  `code` (this is what `sku` matches to, confirmed against real data).
- `src/mapping/invoiceAssembly.ts` — composes the three above into a full
  InvoiceXpress create-invoice payload, or refuses (no invoice created) per
  SPEC.md §2's "no silent partial success" gate.

## Known, verified business rule (round 1 finding — see workbench.html)

Confirmed against all 42 golden fixtures + explicit user decision:
InvoiceXpress applies a flat 10% line-level percentage discount to every
Shopify-channel order that Zoho itself records a discount for
(`sales_channel: "shopify"`, `has_discount: true` — the euro amount recorded
always resolves to exactly 10% of the pre-discount line rate; derive the
percentage from Zoho's own data rather than hardcoding it, for robustness).
For every other channel (confirmed: `"direct_sales"`), Zoho's sales order
carries **no discount information at all**, even though the real invoices
apply the same 10% by hand — this is not derivable from Zoho data with
certainty. Per user decision (2026-08-20): **`direct_sales` orders (and any
sales_channel other than `"shopify"`) must be parked for human review, never
auto-invoiced with a guessed discount.** This means roughly half the golden
corpus cannot produce a generated invoice at all — for those fixtures, Bar A
is evaluated as "did the middleware correctly refuse and park, not did it
produce a winning invoice." See `fixtures/golden/COVERAGE_NOTES.md` for the
full data investigation this rule is based on.

Also verified: unit price sent to InvoiceXpress is Zoho's `rate` (tax-inclusive
catalog price) converted to tax-exclusive — `rate / (1 + tax_rate/100)` — not
Zoho's `item_total` (which may already have Zoho's own discount subtracted).
Using `item_total` as the IX unit price while also applying a percentage
discount in IX double-discounts the line — this exact bug is present in one
human-made fixture (`016-leticia-azevedo`; its invoice total does not
reconcile to its sales order total). Do not treat that fixture's total as
ground truth for Bar B/Bar A judging — flag it as a known human error instead
of trying to replicate it.
