import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

function parseAdminEmails(raw?: string) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAIL);

  // 1) Ensure "general" channel exists (idempotent, no unique constraint needed)
  const general = await prisma.channel.findFirst({
    where: { name: 'general', isDirect: false },
    select: { id: true },
  });

  if (!general) {
    await prisma.channel.create({
      data: { name: 'general', isDirect: false },
    });
    console.log('Created channel "general".');
  } else {
    console.log('Channel "general" already exists.');
  }

  // 2) Promote admin(s) if user exists
  if (adminEmails.length === 0) {
    console.log('No ADMIN_EMAIL set, skipping admin bootstrap.');
    return;
  }

  const res = await prisma.user.updateMany({
    where: { email: { in: adminEmails } },
    data: { role: Role.ADMIN, emailVerifiedAt: new Date() },
  });

  if (res.count === 0) {
    console.log(
      `No user found for ADMIN_EMAIL in [${adminEmails.join(', ')}] (nothing updated).`,
    );
  } else {
    console.log(
      `Promoted ${res.count} user(s) to ADMIN for [${adminEmails.join(', ')}].`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
