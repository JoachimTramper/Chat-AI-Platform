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

  // List ONLY channels where the authenticated user is a member.

  list(meId: string | undefined) {
    if (!meId) throw new UnauthorizedException('Missing auth user');

    return this.prisma.channel.findMany({
      where: { members: { some: { id: meId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Create a new channel (admin only, enforced in controller)
  async create(name: string, isDirect = false) {
    return this.prisma.channel.create({
      data: { name, isDirect },
    });
  }

  // ===== UNREAD / READ =====

  // Mark channel as read up to latest message time (or now).
  // Requires membership.
  async markRead(meId: string | undefined, channelId: string | undefined) {
    if (!meId) throw new UnauthorizedException('Missing auth user');
    if (!channelId) throw new NotFoundException('Missing channel id');

    // Membership check + fetch channel
    const ch = await this.prisma.channel.findFirst({
      where: { id: channelId, members: { some: { id: meId } } },
      select: { id: true, isDirect: true },
    });
    if (!ch) throw new ForbiddenException('Not a channel member');

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
          deletedAt: null,
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

  async listWithUnread(meId: string | undefined) {
    if (!meId) throw new UnauthorizedException('Missing auth user');

    const channels = await this.prisma.channel.findMany({
      where: { members: { some: { id: meId } } },
      orderBy: { createdAt: 'desc' },
      include: {
        members: { select: { id: true, displayName: true } },
      },
    });

    const reads = await this.prisma.channelRead.findMany({
      where: { userId: meId },
      select: { channelId: true, lastRead: true },
    });

    const lastReadByChannel = new Map(
      reads.map((r) => [r.channelId, r.lastRead]),
    );

    // find channels without a read record
    const missing = channels
      .filter((c) => !lastReadByChannel.has(c.id))
      .map((c) => c.id);

    // initialize ChannelRead so unread starts at 0
    if (missing.length) {
      const latest = await this.prisma.message.groupBy({
        by: ['channelId'],
        where: { channelId: { in: missing }, deletedAt: null },
        _max: { createdAt: true },
      });

      const latestMap = new Map(
        latest.map((x) => [x.channelId, x._max.createdAt ?? new Date()]),
      );

      await this.prisma.channelRead.createMany({
        data: missing.map((channelId) => ({
          userId: meId,
          channelId,
          lastRead: latestMap.get(channelId) ?? new Date(),
        })),
        skipDuplicates: true,
      });

      for (const channelId of missing) {
        lastReadByChannel.set(
          channelId,
          latestMap.get(channelId) ?? new Date(),
        );
      }
    }

    // calculate unread normally (lastRead is never null anymore)
    const result = await Promise.all(
      channels.map(async (c) => {
        const lastReadDate = lastReadByChannel.get(c.id)!;

        const unread = await this.prisma.message.count({
          where: {
            channelId: c.id,
            createdAt: { gt: lastReadDate },
            NOT: { authorId: meId },
            deletedAt: null,
          },
        });

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
          lastRead: lastReadDate.toISOString(),
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

    const channel = await this.prisma.channel.create({
      data: {
        name: 'Direct message',
        isDirect: true,
        dmKey: key,
        members: { connect: [{ id: meId }, { id: otherUserId }] },
      },
      include: { members: { select: { id: true, displayName: true } } },
    });

    // start at 0 unread for both users
    await this.prisma.channelRead.createMany({
      data: [
        { userId: meId, channelId: channel.id, lastRead: new Date() },
        { userId: otherUserId, channelId: channel.id, lastRead: new Date() },
      ],
      skipDuplicates: true,
    });

    return channel;
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
