import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { WsModule } from './ws/ws.module';
import { UploadsModule } from './uploads/uploads.module';
import { DigestModule } from './digest/digest.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ChannelsModule,
    MessagesModule,
    WsModule,
    UploadsModule,
    DigestModule,
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
