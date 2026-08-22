import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizePhone } from "../lib/auth";

const prisma = new PrismaClient();

// Edit this list to provision real B2B partner accounts, then re-run
// `npm run prisma:seed`. PINs here are for local testing only.
const testAccounts = [
  { phone: "912 345 678", pin: "1234", name: "Test Partner" },
];

async function main() {
  for (const account of testAccounts) {
    const phone = normalizePhone(account.phone);
    const pinHash = await bcrypt.hash(account.pin, 10);
    await prisma.customer.upsert({
      where: { phone },
      update: { pinHash, name: account.name },
      create: { phone, pinHash, name: account.name },
    });
    console.log(`Seeded customer ${account.name} (${phone})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
