// apps/api/src/digest/digest.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

@Injectable()
export class DigestService {
  constructor(private prisma: PrismaService) {}

  async setEnabled(channelId: string, enabled: boolean) {
    return this.prisma.channelDigestSetting.upsert({
      where: { channelId },
      create: { channelId, enabled },
      update: { enabled },
    });
  }

  async setTime(channelId: string, timeHHmm: string) {
    return this.prisma.channelDigestSetting.upsert({
      where: { channelId },
      create: { channelId, enabled: true, timeHHmm },
      update: { timeHHmm, enabled: true },
    });
  }

  async get(channelId: string) {
    return this.prisma.channelDigestSetting.findUnique({
      where: { channelId },
    });
  }

  async listEnabled() {
    return this.prisma.channelDigestSetting.findMany({
      where: { enabled: true },
      select: { channelId: true, timeHHmm: true, lastRunAt: true },
    });
  }

  // ---- scheduling helpers ----
  nowHHmm(d = new Date()) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // voorkomt dubbele runs op dezelfde dag op hetzelfde tijdstip
  hasRunTodayAt(
    lastRunAt: Date | null | undefined,
    timeHHmm: string,
    now = new Date(),
  ) {
    if (!lastRunAt) return false;

    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const [hh, mm] = timeHHmm.split(':').map((x) => Number(x));

    const scheduledToday = new Date(y, m, d, hh || 0, mm || 0, 0, 0);
    return lastRunAt.getTime() >= scheduledToday.getTime();
  }

  async markRan(channelId: string) {
    const now = new Date();

    return this.prisma.channelDigestSetting.upsert({
      where: { channelId },
      create: {
        channelId,
        enabled: true,
        timeHHmm: '18:00',
        lastRunAt: now,
      },
      update: {
        lastRunAt: now,
      },
    });
  }

  validateTimeOrThrow(timeHHmm: string) {
    const t = (timeHHmm ?? '').trim();
    if (!TIME_RE.test(t)) {
      throw new Error('Invalid time. Use HH:mm (00:00 - 23:59).');
    }
    return t;
  }

  async ensure(channelId: string) {
    return this.prisma.channelDigestSetting.upsert({
      where: { channelId },
      create: { channelId, enabled: false, timeHHmm: '18:00' },
      update: {},
    });
  }
}
