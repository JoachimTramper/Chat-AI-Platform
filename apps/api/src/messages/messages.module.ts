// apps/api/src/messages/messages.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WsModule } from '../ws/ws.module';
import { BotModule } from '../bot/ai-bot.module';

@Module({
  imports: [PrismaModule, WsModule, forwardRef(() => BotModule)],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
