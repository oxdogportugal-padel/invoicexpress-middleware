# Golden corpus coverage notes

The corpus is restricted, by explicit user instruction, to InvoiceXpress invoices
in series **OXD2026 onwards** (checked 2026-08-20: no later OXD-family series
exists yet in this account, so this is currently equivalent to "OXD2026 only").
This is a hard constraint on data sourcing, not a suggestion — no fixture may
use an invoice from any other series, even to backfill a missing category.

42 fixture pairs were built (`fixtures/golden/001-*` .. `042-*`), meeting the
SPEC.md §3 Bar A minimum of 40. Within the OXD2026-only scope, four of the
required categories are **not represented**, because the underlying data does
not contain them — not because the search was incomplete:

- **Line-level absolute (flat-euro) discount** — every discount observed across
  all OXD2026-series invoices is percentage-based (a recurring 10% "welcome"
  promo applied at the item level).
- **Entity/header-level discount** — `global_discount` is `null` on every
  OXD2026 invoice checked; Zoho's top-level `discount` field is `0` on every
  corresponding sales order.
- **Header + line discount combined** — depends on header-level discount
  existing at all, which it doesn't in this scope.
- **Mixed VAT rates within one invoice** — no OXD2026 invoice applies more than
  one VAT rate across its lines. Fixture `001-nuno-silva-smallest` comes close:
  its Zoho sales order has a 0%-tax line next to VAT-bearing lines, but the
  hand-made invoice normalizes the whole thing to 23% — worth keeping as a
  landmine example, but it is not a true mixed-rate invoice.

Decision (confirmed with the user 2026-08-20): accept this as a documented gap
rather than synthesizing fixtures or relaxing the series restriction. Bar A/B/C
run against what is real. If the mapping code needs to handle absolute
discounts, header-level discounts, or mixed VAT correctly (it does — SPEC.md §4
calls out absolute→percentage conversion as the single most likely source of
cent-level drift, and it can occur in principle even though this slice of real
data doesn't exercise it), that logic must still be written and unit-tested
directly, since the golden A/B corpus cannot exercise it here.

Two additional caveats, also accepted as documented rather than fixed:

- **"Largest order" (fixture `014-roberto-santos-largest`, €685.50) is the
  largest order *within the OXD2026-only corpus*, not the largest in the whole
  Zoho account.** The true account-wide largest order was invoiced under a
  different series and is out of scope per the series restriction.
- **Non-PT customer (fixture `002-david-finnegan-non-pt`) carries a real data
  inconsistency, not a bug in the fixture:** Zoho's billing address has
  `country_code: "GB"` (Torquay, UK), while the InvoiceXpress client record
  for the same person shows `country: "Portugal"`. This is exactly the kind of
  cross-system inconsistency SPEC.md §4 warns about and should be treated as
  adversarial material, not normalized away when building the fixture.

Also found, not required by SPEC.md §3 but valuable adversarial/reconciliation
material and worth exercising in Bar B / Bar D:

- `011-helio-rodrigues`: rounding drift between per-line-rounded total (267.90)
  and the invoice's actual total (267.89).
- `034`, `036`–`040`: the Zoho sales order shows no discount but the hand-made
  invoice applies the 10% promo anyway (tagged `so_invoice_discount_divergence`
  in `manifest.json`).
- Standalone evidence (not tied to a specific golden fixture) of the
  "Luis Castro" duplicate-client situation named in SPEC.md §3 Bar C: 3+
  InvoiceXpress client records share NIF `205694934` and email
  `luismarcalcastro@gmail.com`. No sales order in the OXD2026-scope search
  window happened to be for this customer, so it isn't backed by a golden
  fixture pair — but Bar C's resolution-ordering experiment and the Bar D
  adversarial suite should still exercise it directly against the live
  InvoiceXpress client list.
