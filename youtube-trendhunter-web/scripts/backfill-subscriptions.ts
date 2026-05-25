import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function backfill() {
  console.log("Starting subscription backfill...");
  
  // Step 1: Create a subscription for each user that doesn't have one
  const users = await prisma.user.findMany({
    where: { subscriptions: { none: {} } },
    select: { id: true, orgId: true },
  });
  
  for (const user of users) {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: "FREE",
        status: "ACTIVE",
      },
    });
  }
  console.log(`Created FREE subscriptions for ${users.length} users`);
  
  // Step 2: Link existing subscriptions to users via orgId
  const subsWithoutUser = await prisma.subscription.findMany({
    where: { userId: null },
    include: { organization: { include: { users: { take: 1, select: { id: true } } } } },
  });
  
  for (const sub of subsWithoutUser) {
    const orgUser = sub.organization?.users?.[0];
    if (orgUser) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { userId: orgUser.id },
      });
    }
  }
  console.log(`Linked ${subsWithoutUser.length} org subscriptions to users`);
  
  console.log("Backfill complete!");
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
