// apps/api/src/digest/digest.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DigestService } from './digest.service';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class DigestCron {
  private readonly logger = new Logger(DigestCron.name);

  constructor(
    private digest: DigestService,
    private messages: MessagesService,
  ) {}

  @Cron('* * * * *') // every minute
  async tick() {
    const now = new Date();
    const nowHHmm = this.digest.nowHHmm(now);

    const enabled = await this.digest.listEnabled();

    for (const s of enabled) {
      if (s.timeHHmm !== nowHHmm) continue;
      if (this.digest.hasRunTodayAt(s.lastRunAt ?? null, s.timeHHmm, now))
        continue;

      try {
        // 👇 NEW: skip if nothing to summarize
        const hasMessages = await this.messages.hasMessagesInLastHours(
          s.channelId,
          24,
        );

        if (!hasMessages) {
          this.logger.log(
            `Digest skipped (no messages): channel=${s.channelId}`,
          );

          // mark as ran to avoid retry every minute
          await this.digest.markRan(s.channelId);
          continue;
        }

        // hergebruik on-demand digest
        await this.messages.postDigestToChannel(s.channelId, { hours: 24 });
        await this.digest.markRan(s.channelId);

        this.logger.log(`Digest posted: channel=${s.channelId} at=${nowHHmm}`);
      } catch (e: any) {
        this.logger.warn(
          `Digest failed: channel=${s.channelId} err=${e?.message ?? e}`,
        );
      }
    }
  }
}
