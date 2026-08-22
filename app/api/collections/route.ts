import { NextResponse } from "next/server";
import { getCollections } from "@/lib/shopify";

export async function GET() {
  try {
    const collections = await getCollections();
    return NextResponse.json({ collections });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load collections" }, { status: 502 });
  }
}
