"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";

export default function Header() {
  const { itemCount } = useCart();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-brand px-4 py-3 text-white shadow-sm">
      <Link href="/" className="text-sm font-bold tracking-wide">
        OXDOG B2B
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/cart" className="relative flex items-center gap-1 text-sm font-medium">
          Cart
          {itemCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-xs font-bold">
              {itemCount}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs font-medium text-gray-300 underline underline-offset-2"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
