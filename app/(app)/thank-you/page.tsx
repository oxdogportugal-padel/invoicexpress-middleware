import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerId } from "@/lib/auth";
import type { CheckoutLineItem } from "@/lib/shopify";

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: { order?: string };
}) {
  const customerId = await getCurrentCustomerId();
  const order =
    customerId && searchParams.order
      ? await prisma.order.findUnique({ where: { id: searchParams.order } })
      : null;

  if (!order || order.customerId !== customerId) {
    return (
      <div className="mx-auto max-w-sm space-y-4 rounded-lg bg-white p-6 text-center">
        <p className="text-sm text-gray-500">We couldn&apos;t find that order.</p>
        <Link href="/" className="text-sm font-medium text-brand-accent underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  const items: CheckoutLineItem[] = JSON.parse(order.itemsJson);

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div className="rounded-lg bg-white p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
          ✓
        </div>
        <h1 className="text-lg font-bold text-gray-900">Thank you for your order!</h1>
        <p className="mt-1 text-sm text-gray-500">
          {order.shopifyOrderName ? `Order ${order.shopifyOrderName}` : `Order #${order.id.slice(0, 8)}`}
        </p>
      </div>

      <div className="space-y-2 rounded-lg bg-white p-4">
        {items.map((item) => (
          <div key={item.variantId} className="flex justify-between text-sm text-gray-700">
            <span>
              {item.qty} × {item.title}
            </span>
            <span>€{(item.price * item.qty).toFixed(2)}</span>
          </div>
        ))}
        <div className="border-t border-gray-100 pt-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>€{order.subtotal.toFixed(2)}</span>
          </div>
          {order.discountPercent > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount ({order.discountPercent}%)</span>
              <span>-€{(order.subtotal - order.total).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-900">
            <span>Total paid</span>
            <span>€{order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <Link
        href="/"
        className="block rounded-lg bg-brand-accent px-4 py-3 text-center text-sm font-semibold text-white"
      >
        Back to catalog
      </Link>
    </div>
  );
}
