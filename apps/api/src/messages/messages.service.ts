// apps/api/src/messages/messages.service.ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';
import { AiBotService } from '../bot/ai-bot.service';
import { AI_BOT_USER_ID } from '../bot/ai-bot.constants';
import { formatHistoryLine } from '../bot/ai-bot.format';
import { GENERAL_CHANNEL_ID } from '../channels.constants';

const MAX_MESSAGE_LEN = 5000;

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private ws: WsGateway,
    private aiBot: AiBotService,
  ) {}

  async list(channelId: string, userId: string, take = 50, cursor?: string) {
    await this.assertCanAccessChannel(channelId, userId);

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
        attachments: true,
      },
    });
  }

  async search(
    channelId: string,
    userId: string,
    query: string,
    take = 50,
    cursor?: string,
  ) {
    await this.assertCanAccessChannel(channelId, userId);

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
    attachments: {
      url: string;
      fileName: string;
      mimeType: string;
      size: number;
    }[] = [],
    lastReadOverride?: string | null,
  ) {
    // 1) access control (BESTAAT + MEMBERSHIP)
    await this.assertCanAccessChannel(channelId, authorId);

    // 1b) content length guard
    const cleanContent = (content ?? '').trim();
    if (cleanContent.length > MAX_MESSAGE_LEN) {
      throw new ForbiddenException(
        `Message too long (max ${MAX_MESSAGE_LEN} chars)`,
      );
    }

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

    // 2c) Check if bot is mentioned
    const isBotMentioned = cleanMentions.includes(AI_BOT_USER_ID);

    // 3) create message (incl. parent, author, reactions, mentions, attachments)
    const msg = await this.prisma.message.create({
      data: {
        channelId,
        authorId,
        content: cleanContent,
        parentId,
        mentions: {
          create: cleanMentions.map((userId) => ({ userId })),
        },
        attachments: {
          create: attachments.map((a) => ({
            url: a.url,
            fileName: a.fileName,
            mimeType: a.mimeType,
            size: a.size,
          })),
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
        attachments: true,
      },
    });

    const room = `chan:${channelId}`;
    const sockets = await this.ws.server.in(room).fetchSockets();

    // 4) realtime push (full payload incl. parent + reactions + mentions + attachments)
    this.ws.server.to(`chan:${channelId}`).emit('message.created', {
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
      mentions: msg.mentions.map((m) => ({
        userId: m.userId,
        user: {
          id: m.user.id,
          displayName: m.user.displayName,
          avatarUrl: m.user.avatarUrl ?? null,
        },
      })),
      attachments: msg.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
      })),
    });

    // 4b) unread push (to user-rooms, for everyone except the sender)
    const ch = await this.prisma.channel.findUnique({
      where: { id: msg.channelId },
      select: { members: { select: { id: true } } },
    });

    for (const m of ch?.members ?? []) {
      if (m.id === msg.authorId) continue;

      const uroom = `user:${m.id}`;
      const usockets = await this.ws.server.in(uroom).fetchSockets();

      this.ws.server.to(uroom).emit('channel.unread', {
        channelId: msg.channelId,
        delta: 1,
        messageId: msg.id,
        at: msg.createdAt.toISOString(),
      });
    }

    const text = (msg.content ?? '').trim();
    const isCommand = text.startsWith('!');
    const isGeneral = msg.channelId === GENERAL_CHANNEL_ID;
    const botMentionedInSavedMsg = msg.mentions?.some(
      (m) =>
        m.user?.id === AI_BOT_USER_ID || (m as any).userId === AI_BOT_USER_ID,
    );

    // 5) if bot mentioned, generate reply async
    if (
      isGeneral &&
      (isCommand || botMentionedInSavedMsg) &&
      msg.authorId !== AI_BOT_USER_ID
    ) {
      void (async () => {
        // bot typing ON
        this.ws.server.to(`view:${msg.channelId}`).emit('typing', {
          channelId: msg.channelId,
          userId: AI_BOT_USER_ID,
          displayName: 'BambooBob',
          isTyping: true,
        });

        try {
          // ---- determine intent from user text ----
          const cleanedUser = (msg.content ?? '')
            .replaceAll(`@BambooBob`, '')
            .trim()
            .toLowerCase();

          const wantsSummary =
            cleanedUser.includes('samenvat') ||
            cleanedUser.includes('samenvatting') ||
            cleanedUser.includes('samenvatten') ||
            cleanedUser.includes('summarize') ||
            cleanedUser.includes('summary') ||
            cleanedUser.includes('tldr');

          const wantsSinceLastRead =
            cleanedUser.includes('wat heb ik gemist') ||
            cleanedUser.includes('wat mis ik') ||
            cleanedUser.includes('since last read') ||
            cleanedUser.includes('what did i miss') ||
            cleanedUser.includes('missed') ||
            cleanedUser.includes('did i miss') ||
            cleanedUser.includes('miss something');

          // ---- resolve lastRead ----
          const read = await this.prisma.channelRead.findUnique({
            where: {
              userId_channelId: {
                userId: msg.authorId,
                channelId: msg.channelId,
              },
            },
            select: { lastRead: true },
          });

          const overrideDate =
            typeof lastReadOverride === 'string' && lastReadOverride
              ? new Date(lastReadOverride)
              : null;

          const lastRead = overrideDate ?? read?.lastRead ?? null;
          const cutoff = msg.createdAt;

          // ---- build NOT clause ----
          const notClause: any[] = [{ id: msg.id }];
          if (wantsSinceLastRead) {
            notClause.push({ authorId: msg.authorId }); // exclude requester
            notClause.push({ authorId: AI_BOT_USER_ID }); // exclude bot's own messages
          }

          // ---- fetch context ----
          const whereBase: any = {
            channelId: msg.channelId,
            deletedAt: null,
            NOT: notClause,
          };

          const where = wantsSummary
            ? {
                ...whereBase,
                // summary = "recent chat", so just cap at cutoff (no lastRead filter)
                createdAt: { lte: cutoff },
              }
            : lastRead
              ? {
                  ...whereBase,
                  // since-last-read = only unread window
                  createdAt: { gt: lastRead, lte: cutoff },
                }
              : {
                  ...whereBase,
                  // no lastRead known -> fallback to recent chat too
                  createdAt: { lte: cutoff },
                };

          // For summary we need the *latest* 50 (desc), then reverse for chronological prompt
          const raw = await this.prisma.message.findMany({
            where,
            orderBy: { createdAt: wantsSummary ? 'desc' : 'asc' },
            take: 50,
            select: {
              createdAt: true,
              content: true,
              author: { select: { displayName: true } },
              parent: {
                select: {
                  author: { select: { displayName: true } },
                },
              },
              mentions: {
                select: {
                  user: { select: { displayName: true } },
                },
              },
            },
          });

          const context = wantsSummary ? raw.reverse() : raw;

          // ---- build history ----
          const history = context
            .map((m) => formatHistoryLine(m as any))
            .join('\n');

          // ---- call AI bot ----
          const botReply = await this.aiBot.onUserMessage({
            channelId: msg.channelId,
            authorId: msg.authorId,
            content: msg.content ?? '',
            isBotMentioned: isCommand ? false : botMentionedInSavedMsg,
            history,
            lastRead,
            lastReadOverride: overrideDate,
          });

          if (!botReply?.reply?.trim()) {
            return;
          }

          // ---- mark as read ONLY for "what did I miss" ----
          if (wantsSinceLastRead) {
            await this.prisma.channelRead.upsert({
              where: {
                userId_channelId: {
                  userId: msg.authorId,
                  channelId: msg.channelId,
                },
              },
              update: { lastRead: cutoff },
              create: {
                userId: msg.authorId,
                channelId: msg.channelId,
                lastRead: cutoff,
              },
            });
          }

          // send bot reply as a real chat message
          await this.createBotMessage(msg.channelId, botReply.reply, undefined);
        } catch (err) {
          console.warn('[bot] failed to generate reply', err);
        } finally {
          // bot typing OFF
          this.ws.server.to(`view:${msg.channelId}`).emit('typing', {
            channelId: msg.channelId,
            userId: AI_BOT_USER_ID,
            displayName: 'BambooBob',
            isTyping: false,
          });
        }
      })();
    }

    return msg;
  }

  // on-demand digest posting
  async postDigestToChannel(
    channelId: string,
    opts?: { hours?: number },
  ): Promise<{ ok: true; messageId: string }> {
    const hours = opts?.hours ?? 24;

    // Generate digest text using the bot (single source of truth)
    const digestText = await this.aiBot.generateDigestForChannel(
      channelId,
      hours,
    );

    // Post as bot message
    const msg = await this.createBotMessage(channelId, digestText);

    return { ok: true, messageId: msg.id };
  }

  // check if there are messages (non-bot) in last N hours
  async hasMessagesInLastHours(
    channelId: string,
    hours: number,
  ): Promise<boolean> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const count = await this.prisma.message.count({
      where: {
        channelId,
        deletedAt: null,
        authorId: { not: AI_BOT_USER_ID },
        createdAt: { gte: since },
      },
    });

    return count > 0;
  }

  // helper to create bot message
  private async createBotMessage(
    channelId: string,
    content: string,
    markReadForUserId?: string,
  ) {
    const msg = await this.prisma.message.create({
      data: {
        channelId,
        authorId: AI_BOT_USER_ID,
        content: content ?? '',
      },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    // mark as read for the user who triggered the bot
    if (markReadForUserId) {
      await this.prisma.channelRead.upsert({
        where: {
          userId_channelId: {
            userId: markReadForUserId,
            channelId,
          },
        },
        update: { lastRead: msg.createdAt },
        create: {
          userId: markReadForUserId,
          channelId,
          lastRead: msg.createdAt,
        },
      });
    }

    this.ws.server.to(`chan:${channelId}`).emit('message.created', {
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
      parent: null,
      reactions: [],
      mentions: [],
      attachments: [],
    });

    return msg;
  }

  // helper to assert channel access

  private async assertCanAccessChannel(channelId: string, userId: string) {
    if (channelId === GENERAL_CHANNEL_ID) return;

    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        isDirect: true,
        members: { where: { id: userId }, select: { id: true } },
      },
    });

    if (!ch) throw new NotFoundException('Channel not found');

    if (ch.isDirect && ch.members.length === 0) {
      throw new ForbiddenException('Not a channel member');
    }
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

    // channel access check (DM/private)
    await this.assertCanAccessChannel(msg.channelId, userId);

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

    const cleanContent = (content ?? '').trim();
    if (cleanContent.length > MAX_MESSAGE_LEN) {
      throw new ForbiddenException(
        `Message too long (max ${MAX_MESSAGE_LEN} chars)`,
      );
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: cleanContent },
      select: { id: true, channelId: true, content: true, updatedAt: true },
    });

    // realtime: minimal payload is enough
    this.ws.server.to(`chan:${channelId}`).emit('message.updated', {
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

    this.ws.server.to(`chan:${channelId}`).emit('message.deleted', {
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

    await this.assertCanAccessChannel(msg.channelId, userId);

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
    this.ws.server.to(`chan:${msg.channelId}`).emit('message.added', {
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

    await this.assertCanAccessChannel(msg.channelId, userId);

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

    this.ws.server.to(`chan:${msg.channelId}`).emit('message.removed', {
      messageId,
      channelId: msg.channelId,
      emoji: trimmed,
      userId,
    });

    return { ok: true };
  }
}
