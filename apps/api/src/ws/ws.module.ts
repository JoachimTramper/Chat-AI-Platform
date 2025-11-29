// apps/api/src/ws/ws.module.ts
import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PresenceService } from './presence.service';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [WsGateway, PresenceService],
  exports: [WsGateway, PresenceService],
})
export class WsModule {}
