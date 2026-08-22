import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerId } from "@/lib/auth";
import { checkMbWayStatus } from "@/lib/ifthenpay";
import { finalizeOrderAsPaid, markOrderDeclined } from "@/lib/order-fulfillment";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const customerId = await getCurrentCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.order.findUnique({ where: { id: params.id } });
  if (!order || order.customerId !== customerId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (order.status === "pending" && order.mbwayRequestId) {
    try {
      const mbwayStatus = await checkMbWayStatus(order.mbwayRequestId);
      if (mbwayStatus === "paid") {
        await finalizeOrderAsPaid(order.id);
      } else if (mbwayStatus === "declined") {
        await markOrderDeclined(order.id);
      }
    } catch (err) {
      console.error("[checkout/status] MB WAY poll failed", err);
    }
  }

  const fresh = await prisma.order.findUnique({ where: { id: params.id } });
  return NextResponse.json({
    status: fresh?.status ?? order.status,
    shopifyOrderName: fresh?.shopifyOrderName ?? null,
    total: fresh?.total ?? order.total,
  });
}
