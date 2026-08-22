/**
 * IfthenPay MB WAY (SPG) integration.
 *
 * Built against IfthenPay's publicly documented MB WAY SPG contract
 * (POST /api/spg/payment/mbway to push a request, GET .../status/mbway/...
 * to poll it). This environment's network egress does not allow fetching
 * ifthenpay.com to double-check the exact response field names against the
 * live docs, so parsing below is deliberately defensive (accepts several
 * known/likely field name variants). Do one real test payment after adding
 * real credentials and check the server logs (raw responses are logged) to
 * confirm the field names match your account's API version.
 */

const BASE_URL = "https://ifthenpay.com/api/spg";

function getMbWayKey() {
  const key = process.env.IFTHENPAY_MBWAY_KEY;
  if (!key) throw new Error("IFTHENPAY_MBWAY_KEY env var is not set");
  return key;
}

/** Formats a normalized 9-digit PT phone as ifthenpay expects: "351#912345678". */
export function toIfthenpayMobile(digits: string): string {
  return `351#${digits}`;
}

export type MbWayInitResult = {
  requestId: string;
  raw: unknown;
};

export async function initMbWayPayment(params: {
  orderId: string;
  amount: number;
  mobileNumber: string; // normalized digits, e.g. "912345678"
}): Promise<MbWayInitResult> {
  const res = await fetch(`${BASE_URL}/payment/mbway`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mbWayKey: getMbWayKey(),
      orderId: params.orderId,
      amount: params.amount.toFixed(2),
      mobileNumber: toIfthenpayMobile(params.mobileNumber),
    }),
  });

  const json = await res.json().catch(() => null);
  console.log("[ifthenpay] init response", JSON.stringify(json));

  if (!res.ok || !json) {
    throw new Error(`IfthenPay init failed: ${res.status} ${JSON.stringify(json)}`);
  }

  const requestId: string | undefined =
    json.RequestId ?? json.requestId ?? json.Status?.RequestId;
  const statusCode: string | undefined = json.Status?.code ?? json.Status ?? json.status;

  if (!requestId || (statusCode && !["000", "0", "success"].includes(String(statusCode).toLowerCase()))) {
    throw new Error(`IfthenPay init rejected: ${JSON.stringify(json)}`);
  }

  return { requestId, raw: json };
}

export type MbWayStatus = "pending" | "paid" | "declined" | "unknown";

export async function checkMbWayStatus(requestId: string): Promise<MbWayStatus> {
  const res = await fetch(`${BASE_URL}/payment/status/mbway/${getMbWayKey()}/${requestId}`, {
    method: "GET",
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  console.log("[ifthenpay] status response", JSON.stringify(json));
  if (!res.ok || !json) return "unknown";

  const raw = String(
    json.TransactionStatus ?? json.Status?.message ?? json.Status ?? json.status ?? ""
  ).toLowerCase();

  if (["success", "paid", "pago", "000"].some((s) => raw.includes(s))) return "paid";
  if (["declined", "rejected", "cancel", "error", "expired"].some((s) => raw.includes(s)))
    return "declined";
  if (["pending", "waiting"].some((s) => raw.includes(s))) return "pending";
  return "unknown";
}

/**
 * Best-effort parse of an inbound callback payload (JSON body or query
 * params, field names vary by ifthenpay product/version) into an orderId +
 * status. Authentication of the callback is NOT done via these fields —
 * see /api/checkout/callback, which instead checks a secret token we embed
 * ourselves in the registered callback URL.
 */
export function parseCallbackPayload(payload: Record<string, unknown>): {
  orderId: string | null;
  status: MbWayStatus;
} {
  const orderId =
    (payload.orderId as string) ??
    (payload.OrderId as string) ??
    (payload.idpedido as string) ??
    (payload.order_id as string) ??
    null;

  const raw = String(
    payload.status ?? payload.Status ?? payload.estado ?? payload.TransactionStatus ?? ""
  ).toLowerCase();

  let status: MbWayStatus = "unknown";
  if (["success", "paid", "pago", "000"].some((s) => raw.includes(s))) status = "paid";
  else if (["declined", "rejected", "cancel", "error", "expired"].some((s) => raw.includes(s)))
    status = "declined";
  else if (["pending", "waiting"].some((s) => raw.includes(s))) status = "pending";

  return { orderId, status };
}
