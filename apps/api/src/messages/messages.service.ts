// apps/api/src/messages/messages.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private ws: WsGateway,
  ) {}

  async list(channelId: string, take = 50, cursor?: string) {
    // safe limit
    const safeTake = Math.min(Math.max(take, 1), 100);

    return this.prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: safeTake,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { author: { select: { id: true, displayName: true } } },
    });
  }

  async create(channelId: string, authorId: string, content?: string) {
    // check if channel exists
    const exists = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!exists) throw new NotFoundException('Channel not found');

    // create message
    const msg = await this.prisma.message.create({
      data: { channelId, authorId, content: content ?? '' },
    });

    // realtime push via gateway (fire-and-forget)
    try {
      void this.ws.emitMessageCreated({ id: msg.id });
    } catch (e) {
      console.warn('emitMessageCreated failed:', e);
    }

    return msg;
  }
}
