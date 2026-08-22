import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerId, normalizePhone, isValidPhone } from "@/lib/auth";
import { getVariantsByIds, type CheckoutLineItem } from "@/lib/shopify";
import { initMbWayPayment } from "@/lib/ifthenpay";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        qty: z.number().int().min(1).max(999),
      })
    )
    .min(1),
  discountPercent: z.number().int().min(0).max(100),
  mbwayPhone: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const customerId = await getCurrentCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.mbwayPhone);
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "Invalid MB WAY phone number" }, { status: 400 });
  }

  // Re-price and re-check stock against live Shopify data — never trust
  // client-supplied prices for a real payment/order.
  const variantMap = await getVariantsByIds(parsed.data.items.map((i) => i.variantId));

  const lineItems: CheckoutLineItem[] = [];
  for (const item of parsed.data.items) {
    const variant = variantMap.get(item.variantId);
    if (!variant) {
      return NextResponse.json(
        { error: `Product no longer available (${item.variantId})` },
        { status: 409 }
      );
    }
    if (variant.inventoryQuantity <= 0) {
      return NextResponse.json(
        { error: `${variant.title} is out of stock` },
        { status: 409 }
      );
    }
    lineItems.push({
      variantId: item.variantId,
      title: variant.title,
      qty: item.qty,
      price: variant.price,
    });
  }

  const subtotal = lineItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discountPercent = parsed.data.discountPercent;
  const total = Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100;

  const order = await prisma.order.create({
    data: {
      customerId,
      itemsJson: JSON.stringify(lineItems),
      subtotal,
      discountPercent,
      total,
      mbwayPhone: phone,
      status: "pending",
    },
  });

  try {
    const { requestId } = await initMbWayPayment({
      orderId: order.id,
      amount: total,
      mobileNumber: phone,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { mbwayRequestId: requestId },
    });
  } catch (err) {
    console.error("[checkout] MB WAY init failed", err);
    await prisma.order.update({ where: { id: order.id }, data: { status: "failed" } });
    return NextResponse.json(
      { error: "Could not start MB WAY payment. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ orderId: order.id });
}
