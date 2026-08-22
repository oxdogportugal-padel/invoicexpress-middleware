import { prisma } from "@/lib/prisma";
import { getCurrentCustomerId, formatPhone } from "@/lib/auth";
import CartView from "@/components/CartView";

export default async function CartPage() {
  const customerId = await getCurrentCustomerId();
  const customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId } })
    : null;

  return <CartView initialPhone={customer ? formatPhone(customer.phone) : ""} />;
}
