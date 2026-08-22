import { NextRequest, NextResponse } from "next/server";
import { getProductsByCollection } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("collection");
  if (!handle) {
    return NextResponse.json({ error: "Missing collection param" }, { status: 400 });
  }

  try {
    const result = await getProductsByCollection(handle);
    if (!result) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load products" }, { status: 502 });
  }
}
