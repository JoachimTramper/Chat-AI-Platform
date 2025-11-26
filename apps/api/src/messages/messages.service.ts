// apps/api/src/messages/messages.service.ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private ws: WsGateway,
  ) {}

  async list(channelId: string, take = 50, cursor?: string) {
    const safeTake = Math.min(Math.max(take, 1), 100);

    return this.prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: safeTake,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        deletedBy: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },

        parent: {
          select: {
            id: true,
            content: true,
            author: {
              select: { id: true, displayName: true },
            },
          },
        },

        reactions: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },

        mentions: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  }

  async search(channelId: string, query: string, take = 50, cursor?: string) {
    const safeTake = Math.min(Math.max(take, 1), 100);

    return this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null, // exclude soft-deleted
        content: {
          not: null,
          contains: query,
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: safeTake,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        deletedBy: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        parent: {
          select: {
            id: true,
            content: true,
            author: {
              select: { id: true, displayName: true },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        mentions: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  }

  async create(
    channelId: string,
    authorId: string,
    content?: string,
    replyToMessageId?: string,
    mentionUserIds: string[] = [],
  ) {
    // 1) channel exists?
    const exists = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!exists) throw new NotFoundException('Channel not found');

    // 2) parent check (optional, for replies)
    let parentId: string | undefined = undefined;
    if (replyToMessageId) {
      const parent = await this.prisma.message.findUnique({
        where: { id: replyToMessageId },
        select: { id: true, channelId: true },
      });

      if (!parent || parent.channelId !== channelId) {
        throw new ForbiddenException('Invalid reply parent');
      }

      parentId = parent.id;
    }

    // 2b) clean mentions (remove duplicates, remove falsy)
    const cleanMentions = Array.from(new Set(mentionUserIds)).filter(Boolean);

    // 3) create message (incl. parent, author, reactions, mentions)
    const msg = await this.prisma.message.create({
      data: {
        channelId,
        authorId,
        content: content ?? '',
        parentId,
        mentions: {
          create: cleanMentions.map((userId) => ({ userId })),
        },
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        parent: {
          select: {
            id: true,
            content: true,
            author: {
              select: { id: true, displayName: true },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        // optional: return mentions directly
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // 4) realtime push (full payload incl. parent + reactions + optional mentions)
    this.ws.server.emit('message.created', {
      id: msg.id,
      channelId: msg.channelId,
      authorId: msg.authorId,
      content: msg.content ?? null,
      createdAt: msg.createdAt.toISOString(),
      author: {
        id: msg.author.id,
        displayName: msg.author.displayName,
        avatarUrl: msg.author.avatarUrl ?? null,
      },
      parent: msg.parent
        ? {
            id: msg.parent.id,
            content: msg.parent.content,
            author: {
              id: msg.parent.author.id,
              displayName: msg.parent.author.displayName,
            },
          }
        : null,
      reactions: msg.reactions.map((r) => ({
        id: r.id,
        emoji: r.emoji,
        user: {
          id: r.user.id,
          displayName: r.user.displayName,
          avatarUrl: r.user.avatarUrl ?? null,
        },
      })),
      // optional, helpful to use mentions realtime
      mentions: msg.mentions.map((m) => ({
        userId: m.userId,
        user: {
          id: m.user.id,
          displayName: m.user.displayName,
          avatarUrl: m.user.avatarUrl ?? null,
        },
      })),
    });

    return msg;
  }

  /** helper for permissions update/delete */
  private async canMutate(messageId: string, userId: string) {
    const [msg, me] = await Promise.all([
      this.prisma.message.findUnique({
        where: { id: messageId },
        select: { authorId: true, deletedAt: true, channelId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      }),
    ]);

    if (!msg) throw new NotFoundException('Message not found');
    if (msg.deletedAt) throw new ForbiddenException('Message already deleted');

    const isOwner = msg.authorId === userId;
    const isAdmin = me?.role === 'ADMIN';
    return { isOwner, isAdmin, channelId: msg.channelId };
  }

  /** edit */
  async update(messageId: string, userId: string, content: string) {
    const { isOwner, isAdmin, channelId } = await this.canMutate(
      messageId,
      userId,
    );
    if (!isOwner && !isAdmin) throw new ForbiddenException('Not allowed');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content },
      select: { id: true, channelId: true, content: true, updatedAt: true },
    });

    // realtime: minimal payload is enough
    this.ws.server.emit('message.updated', {
      id: updated.id,
      channelId,
      content: updated.content ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    });

    return updated;
  }

  /** soft-delete */
  async softDelete(messageId: string, userId: string) {
    const { isOwner, isAdmin, channelId } = await this.canMutate(
      messageId,
      userId,
    );
    if (!isOwner && !isAdmin) throw new ForbiddenException('Not allowed');

    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedById: userId, content: null },
      select: { id: true, channelId: true, deletedAt: true },
    });

    this.ws.server.emit('message.deleted', {
      id: deleted.id,
      channelId,
      deletedAt: deleted.deletedAt!.toISOString(),
      deletedById: userId,
    });

    return { ok: true };
  }

  // add reaction
  async addReaction(messageId: string, userId: string, emoji: string) {
    const trimmed = (emoji ?? '').trim();
    if (!trimmed) {
      throw new ForbiddenException('Emoji is required');
    }

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true },
    });
    if (!msg) throw new NotFoundException('Message not found');

    // Ensure the same user cannot add the same emoji reaction to the same message twice
    await this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji: trimmed,
        },
      },
      create: {
        messageId,
        userId,
        emoji: trimmed,
      },
      update: {},
    });

    // minimal realtime payload – frontend counts further itself
    this.ws.server.emit('message.added', {
      messageId,
      channelId: msg.channelId,
      emoji: trimmed,
      userId,
    });

    return { ok: true };
  }

  // remove reaction
  async removeReaction(messageId: string, userId: string, emoji: string) {
    const trimmed = (emoji ?? '').trim();
    if (!trimmed) {
      throw new ForbiddenException('Emoji is required');
    }

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true },
    });
    if (!msg) throw new NotFoundException('Message not found');

    // best-effort delete: if not found, ignore
    try {
      await this.prisma.messageReaction.delete({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji: trimmed,
          },
        },
      });
    } catch (e) {
      // ignore if not found
    }

    this.ws.server.emit('message.removed', {
      messageId,
      channelId: msg.channelId,
      emoji: trimmed,
      userId,
    });

    return { ok: true };
  }
}
