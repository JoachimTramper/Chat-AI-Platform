// apps/api/src/channels/channels.service.ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

@Injectable()
export class ChannelsService {
  constructor(
    private prisma: PrismaService,
    private ws: WsGateway,
  ) {}

  list() {
    return this.prisma.channel.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  create(name: string, isDirect = false) {
    return this.prisma.channel.create({ data: { name, isDirect } });
  }

  // ===== UNREAD / READ =====

  /**
   * Mark channel as read up to "now" for the authenticated user.
   */
  async markRead(meId: string | undefined, channelId: string | undefined) {
    if (!meId) throw new UnauthorizedException('Missing auth user');
    if (!channelId) throw new NotFoundException('Missing channel id');

    // Check that channel exists
    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, isDirect: true },
    });
    if (!ch) throw new NotFoundException('Channel not found');

    // pick the latest existing message timestamp in this channel
    const latest = await this.prisma.message.findFirst({
      where: { channelId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const at = latest?.createdAt ?? new Date();

    // Update ChannelRead
    await this.prisma.channelRead.upsert({
      where: { userId_channelId: { userId: meId, channelId } },
      update: { lastRead: at },
      create: { userId: meId, channelId, lastRead: at },
    });

    // Only for DM channels, emit a "message.read" event
    if (ch.isDirect) {
      const lastMsg = await this.prisma.message.findFirst({
        where: {
          channelId,
          NOT: { authorId: meId },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (lastMsg) {
        this.ws.server.emit('message.read', {
          channelId,
          userId: meId,
          messageId: lastMsg.id,
          at: at.toISOString(),
        });
      }
    }

    return { ok: true, channelId, lastRead: at.toISOString() };
  }

  /**
   * Return channels with unread counters for the authenticated user.
   * unread = messages created after lastRead and NOT authored by me.
   */
  async listWithUnread(meId: string | undefined) {
    if (!meId) throw new UnauthorizedException('Missing auth user');

    const [channels, reads] = await Promise.all([
      this.prisma.channel.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          members: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.channelRead.findMany({
        where: { userId: meId },
        select: { channelId: true, lastRead: true },
      }),
    ]);

    const lastReadByChannel = new Map<string, Date>();
    for (const r of reads) lastReadByChannel.set(r.channelId, r.lastRead);

    const result = await Promise.all(
      channels.map(async (c) => {
        const lastReadDate = lastReadByChannel.get(c.id) ?? null;

        // unread: if never read -> count all (except mine)
        const unread = await this.prisma.message.count({
          where: {
            channelId: c.id,
            ...(lastReadDate ? { createdAt: { gt: lastReadDate } } : {}),
            NOT: { authorId: meId },
            deletedAt: null,
          },
        });

        // DM: name = displayName of other member
        let name = c.name;
        if (c.isDirect) {
          const other = c.members.find((m) => m.id !== meId);
          name = other?.displayName ?? 'Direct';
        }

        return {
          id: c.id,
          name,
          isDirect: c.isDirect,
          unread,
          lastRead: lastReadDate ? lastReadDate.toISOString() : null,
        };
      }),
    );

    return result;
  }

  // ===== DIRECT MESSAGES =====

  private dmKeyFor(a: string, b: string) {
    return [a, b].sort().join('_');
  }

  async getOrCreateDirectChannel(
    meId: string | undefined,
    otherUserId: string | undefined,
  ) {
    if (!meId) throw new UnauthorizedException('Missing auth user');
    if (!otherUserId) throw new NotFoundException('Missing other user id');
    if (meId === otherUserId)
      throw new ForbiddenException('Cannot DM yourself');

    const [me, other] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: meId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: otherUserId },
        select: { id: true, displayName: true },
      }),
    ]);
    if (!me || !other) throw new NotFoundException('User not found');

    const key = this.dmKeyFor(meId, otherUserId);

    const existing = await this.prisma.channel.findUnique({
      where: { dmKey: key },
      include: { members: { select: { id: true, displayName: true } } },
    });
    if (existing) return existing;

    return this.prisma.channel.create({
      data: {
        name: 'Direct message',
        isDirect: true,
        dmKey: key,
        members: { connect: [{ id: meId }, { id: otherUserId }] },
      },
      include: { members: { select: { id: true, displayName: true } } },
    });
  }

  async listMyDirectChannels(meId: string | undefined) {
    if (!meId) throw new UnauthorizedException('Missing auth user');
    return this.prisma.channel.findMany({
      where: { isDirect: true, members: { some: { id: meId } } },
      include: { members: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
