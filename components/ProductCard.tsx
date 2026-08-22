"use client";

import { useState } from "react";
import Image from "next/image";
import { useCart } from "@/lib/cart-context";
import StockBadge, { stockLevel } from "./StockBadge";
import QtyStepper from "./QtyStepper";
import type { ShopifyProduct } from "@/lib/shopify";

export default function ProductCard({ product }: { product: ShopifyProduct }) {
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const outOfStock = stockLevel(product.inventoryQuantity) === "red";

  function handleAdd() {
    addItem(
      {
        variantId: product.variantId,
        productId: product.id,
        title: product.title,
        imageUrl: product.imageUrl,
        price: parseFloat(product.price),
      },
      qty
    );
    setAdded(true);
    setQty(1);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="relative aspect-square w-full bg-gray-100">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-gray-900">
          {product.title}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">
            €{parseFloat(product.price).toFixed(2)}
          </span>
          <StockBadge inventoryQuantity={product.inventoryQuantity} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <QtyStepper qty={qty} onChange={setQty} disabled={outOfStock} max={99} />
          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock}
            className="flex-1 rounded-lg bg-brand-accent px-3 py-2 text-xs font-semibold text-white transition disabled:bg-gray-300"
          >
            {outOfStock ? "Unavailable" : added ? "Added ✓" : "Add to cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
