SPEC — Zoho Inventory → InvoiceXpress invoice middleware
This file is the bar. The lead agent reads it before planning. Critics judge against it. Nothing in here is a suggestion.
1. Goal
Every new sales order created in Zoho Inventory produces one corresponding draft invoice in InvoiceXpress, matching the order line for line, cent for cent, including discounts, and attached to the correct existing client.
2. Hard gates (violating any of these is an automatic failure, not a gap)

* Draft only. Invoices are created and left in `draft`. The middleware must never call `change_invoice_state` with `finalized`, `settled`, or `canceled`. There must be a test that fails if that call path exists in the codebase at all. Rationale: a finalized invoice in Portugal is immutable and reported to AT. A bug that finalizes is not recoverable.
* Never create a second client for an existing one. When resolution is ambiguous, the run fails loudly and parks the order for human review. It does not guess and it does not create.
* Never invoice customer A as customer B. Zero tolerance. A duplicate client record is an annoyance; a misattributed invoice is a legal and accounting problem.
* Exactly one invoice per sales order. The webhook can fire more than once for the same order. Replaying the same order must be a no-op that returns the existing invoice, not a second invoice.
* No silent partial success. If any line, tax, or total cannot be mapped with certainty, no invoice is created. Half an invoice is worse than none.

3. The bar
Four layers. All four must pass. The critic runs the real code against real data and inspects real output — never a summary written by the builder.
Bar A — blind A/B against human-made invoices (primary)
`fixtures/golden/` contains historical pairs: a Zoho Inventory sales order and the InvoiceXpress invoice that was created from it by hand and accepted.
The critic receives the generated payload and the human invoice with labels stripped and decides which one a Portuguese certified accountant would accept. Ours must win or tie on every fixture. Any difference in a line description, quantity, unit price, discount, tax rate, line total, or document total is an automatic loss for that fixture.
Minimum corpus: 40 pairs, deliberately including at least one of each —

* B2B customer with NIF
* B2C customer with no NIF (consumidor final)
* line-level percentage discount
* line-level absolute discount
* entity/header-level discount
* both header and line discounts on the same order
* an order with a zero-price or free line
* an order with mixed VAT rates
* an order to a non-Portuguese customer, if any exist
* the largest and smallest order by value in the account

Bar B — reconciliation (numeric, zero tolerance)
For 100% of fixtures, computed independently of the mapping code:

* sum of invoice line nets, after discounts, equals the sales order net
* invoice tax total equals the sales order tax total
* invoice grand total equals the sales order grand total
* every comparison to the cent, using decimal arithmetic, never floats

Rounding is specified once and applied consistently: per line, half-up, two decimal places, and the document total is the sum of rounded lines rather than a rounded sum. If InvoiceXpress rounds differently, the mapping compensates and a test documents the compensation.
Bar C — customer resolution, measured not asserted
Candidate lookup orderings, tested against the full golden corpus:

1. display name (phone number) → VAT number → mobile phone
2. VAT number → display name → mobile phone
3. any other ordering the agent proposes

Report, per ordering: false positive rate (matched the wrong existing client), false negative rate (failed to find a client that exists, would have created a duplicate), and ambiguous rate (multiple candidates). Ship the ordering with a false positive rate of exactly zero and the lowest ambiguous rate. Put the numbers on the progress page.
Note the account already contains duplicate client records sharing a single NIF (several "Luis Castro" variants). Resolution must be deterministic in the face of these — same input always yields the same client — and must never widen the problem.
Bar D — adversarial suite (written by a critic, not the builder)
A fresh critic writes this suite against the spec without reading the implementation. All must pass:

* the same webhook delivered twice, and delivered twice concurrently
* InvoiceXpress client lookup returning HTTP 500 when no client exists (this is documented behaviour of that endpoint, not an outage — see §4)
* a genuine InvoiceXpress 5xx outage mid-create
* timeout after the invoice was created but before the response was read
* rate limit response
* an order containing an item that has no counterpart in InvoiceXpress
* an order edited in Zoho after the invoice was drafted
* a customer whose display name contains characters requiring URL encoding
* a customer matching more than one InvoiceXpress client
* a sales order with zero lines
* malformed or replayed webhook payload from an untrusted source

Bar E — observability
The test: hand a fresh critic a failed run and only the middleware's own interface — no database access, no log files, no source code. Within two minutes it must be able to state which order failed, at which stage, with what payload sent and what response received, and why. If it cannot, observability fails regardless of how the interface looks.
Required, at minimum:

* one row per processed order, with status, timestamps, Zoho SO number, resulting InvoiceXpress invoice ID, and duration
* the exact outbound request and inbound response for every external call, stored and viewable, with secrets redacted
* a distinct visible state for each of: succeeded, failed, parked for human review, skipped as duplicate, retrying
* the ability to replay a single order by hand from the interface, safely
* a correlation ID threaded through every log line for a given order
* a count of unprocessed and parked orders visible without clicking anything

4. Known landmines — do not spend rounds rediscovering these

* InvoiceXpress client lookup by name returns 500, not 404, when no client is found. Treating 5xx uniformly as a transient error will produce infinite retries and duplicate clients. Distinguish it explicitly.
* Query variables in InvoiceXpress lookups must be URL encoded.
* InvoiceXpress has no SKU-based item search. Item resolution cannot rely on SKU lookup and must use another deterministic strategy — decide it and document it.
* InvoiceXpress error behaviour on lookup endpoints is inconsistent across endpoints. Verify each one used, do not generalise.
* Zoho discounts may be percentage or absolute, at line level or entity level. InvoiceXpress takes a per-line percentage discount. The absolute→percentage conversion is the single most likely source of cent-level drift. This mapping gets its own builder and critic pair.
* Zoho and InvoiceXpress tax representations are not identical. Do not assume a tax name maps to the same rate on both sides; resolve rates explicitly.

5. Runtime and secrets
The agent chooses the runtime and justifies the choice in round 0, against one constraint: Bar E is binding. A host that cannot deliver the observability interface described above is not a valid choice regardless of convenience.
Credentials come from environment variables. No secret is ever written to a log, a payload store, or the progress page. A test asserts this.
6. Explicitly out of scope

* finalizing, sending, or emailing invoices
* credit notes, refunds, returns
* payment reconciliation
* any write back into Zoho other than the idempotency marker recording the InvoiceXpress invoice ID against the sales order

7. Definition of done
Every fixture in `fixtures/golden/` wins or ties its blind A/B. Bar B is exact across the whole corpus. The chosen customer resolution ordering has a zero false positive rate. The adversarial suite is green. A fresh critic passes the Bar E test. Every hard gate in §2 has a test that fails when the gate is removed.
