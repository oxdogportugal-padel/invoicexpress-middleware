"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCart } from "@/lib/cart-context";
import QtyStepper from "./QtyStepper";

const DISCOUNT_PERCENT = 10;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

type Phase = "editing" | "submitting" | "awaiting-confirmation" | "error";

export default function CartView({ initialPhone }: { initialPhone: string }) {
  const { items, subtotal, updateQty, removeItem, clear } = useCart();
  const router = useRouter();
  const [discountApplied, setDiscountApplied] = useState(false);
  const [phone, setPhone] = useState(initialPhone);
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const discountPercent = discountApplied ? DISCOUNT_PERCENT : 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;

  async function handlePay() {
    setError(null);
    setPhase("submitting");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
          discountPercent,
          mbwayPhone: phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Checkout failed");
        setPhase("error");
        return;
      }

      setPhase("awaiting-confirmation");
      const orderId = data.orderId as string;
      const startedAt = Date.now();

      pollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          if (pollRef.current) clearInterval(pollRef.current);
          setError("We didn't receive your MB WAY confirmation in time. Please try again.");
          setPhase("error");
          return;
        }
        const statusRes = await fetch(`/api/checkout/status/${orderId}`);
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        if (statusData.status === "paid") {
          if (pollRef.current) clearInterval(pollRef.current);
          clear();
          router.push(`/thank-you?order=${orderId}`);
        } else if (statusData.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setError("The MB WAY payment was declined or expired. Please try again.");
          setPhase("error");
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("error");
    }
  }

  if (items.length === 0 && phase === "editing") {
    return (
      <div className="rounded-lg bg-white p-6 text-center text-sm text-gray-500">
        Your cart is empty.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-32">
      <h1 className="text-lg font-bold text-gray-900">Your cart</h1>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.variantId} className="flex items-center gap-3 rounded-lg bg-white p-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-gray-100">
              {item.imageUrl && (
                <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
              <p className="text-xs text-gray-500">€{item.price.toFixed(2)} each</p>
            </div>
            <QtyStepper
              qty={item.qty}
              onChange={(q) => updateQty(item.variantId, q)}
              disabled={phase !== "editing"}
            />
            <button
              type="button"
              onClick={() => removeItem(item.variantId)}
              disabled={phase !== "editing"}
              className="text-xs text-gray-400 underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <label className="flex items-center justify-between rounded-lg bg-white p-3 text-sm">
        <span className="font-medium text-gray-900">Apply 10% B2B discount</span>
        <input
          type="checkbox"
          checked={discountApplied}
          disabled={phase !== "editing"}
          onChange={(e) => setDiscountApplied(e.target.checked)}
          className="h-5 w-5 accent-brand-accent"
        />
      </label>

      <div className="space-y-1 rounded-lg bg-white p-3 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>€{subtotal.toFixed(2)}</span>
        </div>
        {discountApplied && (
          <div className="flex justify-between text-green-600">
            <span>Discount ({DISCOUNT_PERCENT}%)</span>
            <span>-€{discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-100 pt-1 text-base font-bold text-gray-900">
          <span>Total</span>
          <span>€{total.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-2 rounded-lg bg-white p-3">
        <label htmlFor="mbway-phone" className="block text-sm font-medium text-gray-700">
          MB WAY mobile number
        </label>
        <input
          id="mbway-phone"
          type="tel"
          inputMode="numeric"
          value={phone}
          disabled={phase !== "editing"}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="912 345 678"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
        />
      </div>

      {phase === "awaiting-confirmation" && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
          Confirm the payment on your phone via the MB WAY app…
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white p-3">
        <button
          type="button"
          onClick={handlePay}
          disabled={
            items.length === 0 ||
            phone.replace(/\D/g, "").length < 9 ||
            phase === "submitting" ||
            phase === "awaiting-confirmation"
          }
          className="w-full rounded-lg bg-brand-accent px-4 py-3 text-base font-semibold text-white disabled:opacity-40"
        >
          {phase === "submitting"
            ? "Starting payment…"
            : phase === "awaiting-confirmation"
              ? "Waiting for confirmation…"
              : `Pay €${total.toFixed(2)} with MB WAY`}
        </button>
      </div>
    </div>
  );
}
