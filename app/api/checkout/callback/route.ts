import { NextRequest, NextResponse } from "next/server";
import { parseCallbackPayload } from "@/lib/ifthenpay";
import { finalizeOrderAsPaid, markOrderDeclined } from "@/lib/order-fulfillment";

/**
 * IfthenPay MB WAY callback (webhook). Register this URL in the ifthenpay
 * backoffice as: https://<your-domain>/api/checkout/callback?key=<IFTHENPAY_ANTIPHISHING_KEY>
 *
 * Authentication is our own secret query-param token (checked below), not
 * anything ifthenpay includes in the payload — this sidesteps needing to
 * know ifthenpay's exact anti-phishing field name up front. The payload's
 * own fields are still parsed defensively (see lib/ifthenpay.ts) since this
 * environment couldn't verify the live field names against ifthenpay's docs.
 *
 * The client also polls /api/checkout/status/[id], which independently
 * confirms payment via ifthenpay's status GET endpoint — so a webhook
 * shape mismatch here doesn't strand an order in "pending" forever.
 */
async function handle(req: NextRequest) {
  const expectedKey = process.env.IFTHENPAY_ANTIPHISHING_KEY;
  const providedKey = req.nextUrl.searchParams.get("key");
  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else {
      const form = await req.formData().catch(() => null);
      if (form) body = Object.fromEntries(form.entries());
    }
  }
  const merged: Record<string, unknown> = {
    ...Object.fromEntries(req.nextUrl.searchParams.entries()),
    ...body,
  };

  console.log("[ifthenpay] callback payload", JSON.stringify(merged));

  const { orderId, status } = parseCallbackPayload(merged);
  if (orderId) {
    if (status === "paid") await finalizeOrderAsPaid(orderId);
    else if (status === "declined") await markOrderDeclined(orderId);
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
