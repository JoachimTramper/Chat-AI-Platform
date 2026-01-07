import { PrismaClient, Role } from '@prisma/client';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const BOT_EMAIL = 'bot@ai.local';
const BOT_AVATAR = '/uploads/avatars/bamboobob.png';
const BOT_NAME = 'BambooBob';

const BOT_AVATAR_FILENAME = 'bamboobob.png';

// Source in repo: apps/api/prisma/assets/bamboobob.png
const BOT_AVATAR_SRC = join(__dirname, 'assets', BOT_AVATAR_FILENAME);

// Destination on Railway volume: /app/apps/api/uploads/avatars/bamboobob.png (via process.cwd())
const UPLOADS_DIR = join(process.cwd(), 'uploads');
const AVATARS_DIR = join(UPLOADS_DIR, 'avatars');
const BOT_AVATAR_DEST = join(AVATARS_DIR, BOT_AVATAR_FILENAME);

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

  // 2) Ensure bot avatar file exists on disk (uploads volume)
  mkdirSync(AVATARS_DIR, { recursive: true });

  if (!existsSync(BOT_AVATAR_DEST)) {
    if (!existsSync(BOT_AVATAR_SRC)) {
      console.warn(`[seed] Bot avatar source missing: ${BOT_AVATAR_SRC}`);
    } else {
      copyFileSync(BOT_AVATAR_SRC, BOT_AVATAR_DEST);
      console.log(`[seed] Copied bot avatar → ${BOT_AVATAR_DEST}`);
    }
  } else {
    console.log(`[seed] Bot avatar already present → ${BOT_AVATAR_DEST}`);
  }

  // 2a) Ensure bot user exists + avatar
  await prisma.user.upsert({
    where: { email: BOT_EMAIL },
    update: {
      displayName: BOT_NAME,
      avatarUrl: BOT_AVATAR,
      role: Role.USER,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: BOT_EMAIL,
      passwordHash: '!', // bot never logs in
      displayName: BOT_NAME,
      avatarUrl: BOT_AVATAR,
      role: Role.USER,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('Ensured bot user BambooBob.');

  // 3) Promote admin(s) if user exists
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
