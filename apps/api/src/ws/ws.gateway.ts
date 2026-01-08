// apps/api/src/ws/ws.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { PresenceService } from './presence.service';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { GENERAL_CHANNEL_ID } from '../channels.constants';

type JwtPayload = { sub: string; email: string };
type PresenceStatus = 'online' | 'idle' | 'offline';

@WebSocketGateway({ cors: { origin: '*' } })
export class WsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer() server: Server;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private presence: PresenceService,
  ) {}

  // presence state (sockets ↔ users)
  private socketToUser = new Map<string, { userId: string }>(); // socket.id -> userId
  private userToSockets = new Map<string, Set<string>>(); // userId -> set(socket.id)

  // idle check timer + last emitted status per user
  private idleTimer: NodeJS.Timeout | null = null;
  private lastEmittedStatus = new Map<string, PresenceStatus>();

  // welcomed users per channel
  private welcomed = new Set<string>(); // `${channelId}:${userId}`

  // ---- lifecycle: idle-check interval ----
  onModuleInit() {
    // every 30s check if someone has gone from online → idle
    this.idleTimer = setInterval(() => {
      this.checkIdleTransitions().catch((err) =>
        console.warn('[presence] idle check failed', err),
      );
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private async checkIdleTransitions() {
    // presence service returns: [{ userId, status }]
    const entries = this.presence.getOnlineWithStatus();

    for (const entry of entries) {
      const { userId, status } = entry; // status: 'online' | 'idle'
      const prev = this.lastEmittedStatus.get(userId);

      // only broadcast if status has actually changed
      if (prev !== status) {
        await this.broadcastPresenceUpdate(userId);
      }
    }

    // offline transitions are already handled in handleDisconnect
  }

  // ---- helpers ----

  private async getUserSafe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        lastSeen: true,
        avatarUrl: true,
      },
    });
  }

  private async canAccessChannel(channelId: string, userId: string) {
    if (channelId === GENERAL_CHANNEL_ID) return true;

    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        isDirect: true,
        members: { where: { id: userId }, select: { id: true } },
      },
    });

    if (!ch) return false;

    // If it’s a DM (or any private channel), require membership
    if (ch.isDirect) return ch.members.length > 0;

    // If you have other non-DM private channels later, adjust here.
    return true;
  }

  private async sendPresenceSnapshot(to: Socket) {
    // current online users + their status from PresenceService
    const onlineWithStatus = this.presence.getOnlineWithStatus();
    const onlineUserIds = onlineWithStatus.map((o) => o.userId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: onlineUserIds } },
      select: {
        id: true,
        displayName: true,
        lastSeen: true,
        avatarUrl: true,
      },
      orderBy: { displayName: 'asc' },
    });

    const online = users.map((u) => {
      const st = onlineWithStatus.find((o) => o.userId === u.id);
      const status: PresenceStatus = st?.status ?? 'online';
      return {
        id: u.id,
        displayName: u.displayName,
        lastSeen: u.lastSeen,
        avatarUrl: u.avatarUrl ?? null,
        status, // 'online' | 'idle'
      };
    });

    // recent offline users
    const recently = await this.prisma.user.findMany({
      where: { id: { notIn: onlineUserIds }, lastSeen: { not: null } },
      select: {
        id: true,
        displayName: true,
        lastSeen: true,
        avatarUrl: true,
      },
      orderBy: { lastSeen: 'desc' },
      take: 20,
    });

    to.emit('presence.snapshot', {
      online,
      recently: recently.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        lastSeen: u.lastSeen,
        avatarUrl: u.avatarUrl ?? null,
      })),
    });
  }

  private async getBotUserId() {
    const bot = await this.prisma.user.findFirst({
      where: { email: 'bot@ai.local' },
      select: { id: true },
    });
    return bot?.id ?? null;
  }

  private async hasWelcomeMessage(
    channelId: string,
    userId: string,
    botId: string,
  ) {
    const exists = await this.prisma.message.findFirst({
      where: {
        channelId,
        authorId: botId,
        content: { contains: `[welcome:${userId}]` },
        deletedAt: null,
      },
      select: { id: true },
    });
    return !!exists;
  }

  private async postWelcome(channelId: string, userId: string, botId: string) {
    const user = await this.getUserSafe(userId);
    if (!user) return;

    const msg = await this.prisma.message.create({
      data: {
        channelId,
        authorId: botId,
        content: `👋 Welcome ${user.displayName}! Type \`!help\` for commands. [welcome: ${userId}]`,
      },
      select: {
        id: true,
        channelId: true,
        content: true,
        createdAt: true,
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    // send realtime to everyone who has general open
    this.server.to(`view:${channelId}`).emit('message.created', {
      id: msg.id,
      channelId: msg.channelId,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      author: {
        id: msg.author.id,
        displayName: msg.author.displayName,
        avatarUrl: msg.author.avatarUrl ?? null,
      },
    });
  }

  private async broadcastPresenceUpdate(userId: string) {
    const user = await this.getUserSafe(userId);
    if (!user) return;

    const status = this.presence.getStatus(userId) as PresenceStatus; // 'online' | 'idle' | 'offline'

    // remember status so we only send on change during idle check
    this.lastEmittedStatus.set(userId, status);

    this.server.emit('presence.update', {
      user: {
        id: user.id,
        displayName: user.displayName,
        lastSeen: user.lastSeen,
        avatarUrl: user.avatarUrl ?? null,
      },
      status,
      isOnline: status === 'online' || status === 'idle', // backward compatible
    });
  }

  // ---- socket connect / disconnect ----

  async handleConnection(client: Socket) {
    try {
      const raw =
        (client.handshake.auth as any)?.token ||
        (client.handshake.headers['authorization'] as string | undefined);

      const token = raw?.startsWith('Bearer ') ? raw.slice(7) : raw || '';
      if (!token) throw new Error('Missing token');

      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_SECRET!,
      }) as JwtPayload;

      (client as any).user = payload;

      const userId = payload.sub;

      client.join(`user:${userId}`);

      const memberChannels = await this.prisma.channel.findMany({
        where: { members: { some: { id: userId } } },
        select: { id: true },
      });

      client.join(memberChannels.map((c) => `chan:${c.id}`));

      // track socket
      this.socketToUser.set(client.id, { userId });

      const set = this.userToSockets.get(userId) ?? new Set<string>();
      const wasOffline = set.size === 0;
      set.add(client.id);
      this.userToSockets.set(userId, set);

      // presence → online + activity
      this.presence.markOnline(userId);

      // snapshot to this client
      await this.sendPresenceSnapshot(client);

      // just came online? broadcast
      if (wasOffline) {
        await this.broadcastPresenceUpdate(userId);
      }
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const entry = this.socketToUser.get(client.id);
    if (!entry) return;

    const { userId } = entry;
    this.socketToUser.delete(client.id);

    const set = this.userToSockets.get(userId);
    if (!set) return;

    set.delete(client.id);

    if (set.size === 0) {
      // fully offline
      this.userToSockets.delete(userId);

      this.presence.markOffline(userId);
      this.lastEmittedStatus.set(userId, 'offline');

      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastSeen: new Date() },
        });
      } catch (e) {
        console.warn('[presence] failed to update lastSeen', e);
      }

      await this.broadcastPresenceUpdate(userId);
    } else {
      this.userToSockets.set(userId, set);
    }
  }

  // ---- channel join / leave ----
  @SubscribeMessage('channel.join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const u = (client as any).user as JwtPayload | undefined;
    if (!u) return;

    const channelId = body?.channelId;
    if (!channelId) return;

    const ok = await this.canAccessChannel(channelId, u.sub);
    if (!ok) return { ok: false, error: 'FORBIDDEN' };

    client.join(`chan:${channelId}`);
    client.join(`view:${channelId}`);

    // keep your GENERAL membership connect if you want unread to work
    if (channelId === GENERAL_CHANNEL_ID) {
      await this.prisma.channel
        .update({
          where: { id: channelId },
          data: { members: { connect: { id: u.sub } } },
        })
        .catch(() => {});
    }

    // welcome logic only in general
    if (channelId !== GENERAL_CHANNEL_ID) return { ok: true };

    // quick per-connection guard
    const key = `${channelId}:${u.sub}`;
    if (this.welcomed.has(key)) return { ok: true };
    this.welcomed.add(key);

    // DB-guard (persists well after server restart)
    const botId = await this.getBotUserId();
    if (!botId) return { ok: true }; // no bot → no welcome

    const alreadyWelcomed = await this.hasWelcomeMessage(
      channelId,
      u.sub,
      botId,
    );
    if (!alreadyWelcomed) {
      await this.postWelcome(channelId, u.sub, botId);
    }

    return { ok: true };
  }

  @SubscribeMessage('channel.leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const u = (client as any).user as JwtPayload | undefined;
    if (!u) return;

    const channelId = body?.channelId;
    if (!channelId) return;

    client.leave(`view:${channelId}`);
    client.leave(`chan:${channelId}`);
    return { ok: true };
  }

  // ---- typing (activity) ----

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; isTyping: boolean },
  ) {
    const u = (client as any).user as JwtPayload | undefined;
    if (!u) return;

    const channelId = body?.channelId;
    if (!channelId) return;

    const ok = await this.canAccessChannel(channelId, u.sub);
    if (!ok) return;

    const user = await this.getUserSafe(u.sub);
    if (!user) return;

    this.presence.touch(u.sub);
    await this.broadcastPresenceUpdate(u.sub);

    // Prefer client.to() so the sender doesn't receive their own typing event
    client.to(`view:${channelId}`).emit('typing', {
      channelId,
      userId: user.id,
      displayName: user.displayName,
      isTyping: !!body.isTyping,
    });
  }
}
