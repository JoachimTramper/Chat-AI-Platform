// apps/api/src/digest/digest.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesModule } from '../messages/messages.module';
import { DigestService } from './digest.service';
import { DigestCron } from './digest.cron';

@Module({
  imports: [PrismaModule, forwardRef(() => MessagesModule)],
  providers: [DigestService, DigestCron],
  exports: [DigestService],
})
export class DigestModule {}
