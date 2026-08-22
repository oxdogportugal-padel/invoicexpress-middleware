import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  normalizePhone,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPin,
} from "@/lib/auth";

const bodySchema = z.object({
  phone: z.string().min(1),
  pin: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.phone);
  const pin = parsed.data.pin.trim();

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) {
    return NextResponse.json({ error: "Invalid phone number or PIN" }, { status: 401 });
  }

  const valid = await verifyPin(pin, customer.pinHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid phone number or PIN" }, { status: 401 });
  }

  const token = await createSessionToken(customer.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
