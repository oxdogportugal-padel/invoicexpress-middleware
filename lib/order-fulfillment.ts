import { prisma } from "@/lib/prisma";
import { createShopifyOrder, type CheckoutLineItem } from "@/lib/shopify";
import { formatPhone } from "@/lib/auth";

/**
 * Marks an Order paid and creates the corresponding Shopify order.
 * Idempotent: safe to call more than once for the same order (e.g. once
 * from the callback webhook and once from client status polling racing
 * each other) — only the first call that finds the order still "pending"
 * does the work.
 */
export async function finalizeOrderAsPaid(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "pending") return;

  // Claim the order first so a concurrent call bails out via the guard above.
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: "paid" },
  });
  if (claimed.count === 0) return;

  try {
    const items: CheckoutLineItem[] = JSON.parse(order.itemsJson);
    const shopifyOrder = await createShopifyOrder({
      lineItems: items,
      discountPercent: order.discountPercent,
      customerPhone: order.mbwayPhone ? formatPhone(order.mbwayPhone) : "",
      note: `B2B portal order ${order.id}`,
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { shopifyOrderId: shopifyOrder.id, shopifyOrderName: shopifyOrder.name },
    });
  } catch (err) {
    console.error(`[order-fulfillment] Shopify order creation failed for ${orderId}`, err);
    // Payment already succeeded — keep status "paid" so the customer isn't
    // charged again, but leave shopifyOrderId empty so it's visible for
    // manual follow-up.
  }
}

export async function markOrderDeclined(orderId: string): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: "failed" },
  });
}
