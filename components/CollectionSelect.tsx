"use client";

import { useRouter } from "next/navigation";
import type { ShopifyCollection } from "@/lib/shopify";

export default function CollectionSelect({
  collections,
  selectedHandle,
}: {
  collections: ShopifyCollection[];
  selectedHandle: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedHandle}
      onChange={(e) => router.push(`/?collection=${e.target.value}`)}
      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-900 focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
    >
      {collections.map((c) => (
        <option key={c.handle} value={c.handle}>
          {c.title}
        </option>
      ))}
    </select>
  );
}
