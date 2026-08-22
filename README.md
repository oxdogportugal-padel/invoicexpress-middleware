# invoicexpress-middleware

## OXDOG Padel B2B ordering portal

A mobile-first wholesale ordering site for OXDOG Padel Portugal partners:
phone + PIN login, a live Shopify catalog with stock indicators, a cart with
a self-serve 10% B2B discount, and MB WAY (IfthenPay) checkout that places a
real order in Shopify once payment is confirmed.

### Stack

- Next.js 14 (App Router, TypeScript) + Tailwind CSS
- Prisma + SQLite for B2B customer accounts and order/payment tracking
  (independent of Shopify customers)
- Shopify Admin GraphQL API for collections, products, stock, and order
  creation
- IfthenPay MB WAY (SPG) for payment

### Setup

```bash
npm install
cp .env.example .env   # fill in the values below
npm run prisma:migrate # creates the SQLite database
npm run prisma:seed    # provisions the test account in prisma/seed.ts
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. The seed
script creates `912 345 678` / PIN `1234` for local testing; edit
`prisma/seed.ts` with real partner accounts and re-run `npm run prisma:seed`
to provision them (there is no self-service signup in v1).

### Environment variables (`.env`)

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_STORE_DOMAIN` | e.g. `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Admin API token with `read_products`, `read_orders`/`write_orders` scopes |
| `DATABASE_URL` | SQLite file path (swap to a Postgres URL for production) |
| `SESSION_SECRET` | Random string used to sign the login session cookie |
| `IFTHENPAY_MBWAY_KEY` | Your ifthenpay MB WAY backoffice key |
| `IFTHENPAY_ANTIPHISHING_KEY` | A secret you choose yourself — see below |

### Wiring up the MB WAY callback

In the ifthenpay backoffice, set the MB WAY callback URL to:

```
https://<your-domain>/api/checkout/callback?key=<IFTHENPAY_ANTIPHISHING_KEY>
```

The `key` query param is our own secret (not something ifthenpay sends
back) — it's how `/api/checkout/callback` authenticates the webhook.

**Note:** this was built against ifthenpay's publicly documented MB WAY SPG
contract, but this environment's network egress couldn't reach
`ifthenpay.com` to double check field names against the live docs, so
`lib/ifthenpay.ts` parses responses defensively (accepts a few likely field
name variants) and logs every raw request/response. After adding real
credentials, do one test payment and check the server logs — if a field
name doesn't match your account's API version, `lib/ifthenpay.ts` is the
only file that needs adjusting. As a safety net, the cart page also polls
ifthenpay's payment-status endpoint directly, so a webhook mismatch alone
won't strand an order in "pending".

### How an order is placed

1. `/api/checkout` re-prices and re-checks stock against live Shopify data
   (never trusts the client), creates a `pending` `Order` row, and pushes an
   MB WAY payment request to the customer's phone.
2. The cart page polls `/api/checkout/status/[id]`, which checks ifthenpay's
   status endpoint; the ifthenpay callback can also resolve it.
3. Once paid, `lib/order-fulfillment.ts` creates a real Shopify order
   (`orderCreate`, tagged `b2b-portal`, inventory decremented, the 10%
   discount recorded via a `B2B10` discount code line) and the customer is
   redirected to `/thank-you`.

### Out of scope for v1

- Self-service registration — accounts are provisioned via `prisma/seed.ts`.
- InvoiceXpress invoice creation — Shopify order only for now.
- Multi-variant product selection — the catalog is single-variant today; a
  multi-variant product would need a variant picker added to `ProductCard`.
