// apps/api/src/bot/ai-bot.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DigestModule } from '../digest/digest.module';
import { AiBotService } from './ai-bot.service';

@Module({
  imports: [PrismaModule, forwardRef(() => DigestModule)],
  providers: [AiBotService],
  exports: [AiBotService],
})
export class BotModule {}
