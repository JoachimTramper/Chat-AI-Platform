"use client";
import { useEffect, useRef, useState } from "react";
import {
  listMessages,
  markChannelRead,
  sendMessage,
  updateMessage,
  deleteMessage,
} from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message } from "../types";

type ResolveDisplayName = (id: string) => string | undefined;

type UseMessagesOptions = {
  resolveDisplayName?: ResolveDisplayName;
  onIncomingMessage?: (msg: Message) => void;
  lastReadSnapshot?: string | null;
};

export function useMessages(
  active: string | null,
  userId?: string,
  opts?: UseMessagesOptions
) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const ready = !!(active && userId);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastReadMessageIdByOthers, setLastReadMessageIdByOthers] = useState<
    string | null
  >(null);
  const lastReadSnapshotRef = useRef<string | null>(null);
  const nearBottomRef = useRef(false);

  const isWhatDidIMiss = (text?: string) => {
    const t = (text ?? "").toLowerCase();
    return (
      t.includes("what did i miss") ||
      t.includes("since last read") ||
      t.includes("wat heb ik gemist") ||
      t.includes("wat mis ik")
    );
  };

  // keep latest resolver & userId in refs (avoid changing effect deps length)
  const resolveNameRef = useRef<ResolveDisplayName | undefined>(undefined);
  useEffect(() => {
    resolveNameRef.current = opts?.resolveDisplayName;
  }, [opts?.resolveDisplayName]);

  const userIdRef = useRef<string | undefined>(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // keep latest onIncomingMessage in a ref as well
  const onIncomingRef = useRef<((msg: Message) => void) | undefined>(undefined);
  useEffect(() => {
    onIncomingRef.current = opts?.onIncomingMessage;
  }, [opts?.onIncomingMessage]);

  const snapshotForChannelRef = useRef<string | null>(null);

  // initial load
  useEffect(() => {
    if (!ready || !active) return;

    (async () => {
      try {
        // snapshot only once per channel open
        if (snapshotForChannelRef.current !== active) {
          snapshotForChannelRef.current = active;
          lastReadSnapshotRef.current = opts?.lastReadSnapshot ?? null;
        }

        const raw = await listMessages(active);

        const normalized = raw.reverse().map((m: any) => ({
          ...m,
          reactions: m.reactions
            ? m.reactions.map((r: any) => ({
                emoji: r.emoji,
                userId: r.userId ?? r.user?.id,
              }))
            : [],
          mentions: m.mentions
            ? m.mentions.map((mm: any) => ({
                userId: mm.userId ?? mm.user?.id,
                user: mm.user
                  ? {
                      id: mm.user.id,
                      displayName: mm.user.displayName,
                      avatarUrl: mm.user.avatarUrl ?? null,
                    }
                  : undefined,
              }))
            : [],
        }));

        setMsgs(normalized);

        requestAnimationFrame(() => {
          const el = listRef.current;
          if (!el) return;

          el.scrollTop = el.scrollHeight;

          nearBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 64;

          if (nearBottomRef.current) {
            markChannelRead(active).catch((err) => {
              console.warn("markChannelRead failed (ignored):", err);
            });
          }
        });
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    })();
  }, [ready, active]);

  const loadOlder = async () => {
    if (!active || loadingOlder || !hasMore || msgs.length === 0) return;
    setLoadingOlder(true);
    try {
      const firstId = msgs[0]?.id;
      if (!firstId) return;

      const older = await listMessages(active, { cursor: firstId, take: 50 });
      const batch = older.reverse();
      if (batch.length === 0) setHasMore(false);

      setMsgs((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of batch) byId.set(m.id, byId.get(m.id) ?? m);
        return Array.from(byId.values()).sort(
          (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)
        );
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  // join/leave on active change
  useEffect(() => {
    if (!ready || !active) return;

    const s = getSocket();

    const join = () => {
      s.emit("channel.join", { channelId: active });
    };

    join(); // join immediately
    s.on("connect", join); // re-join after reconnect

    return () => {
      s.off("connect", join);
      try {
        s.emit("channel.leave", { channelId: active });
      } catch {}
    };
  }, [ready, active]);

  // Realtime message events (deps length stays constant)
  useEffect(() => {
    if (!ready) return;
    const s = getSocket();

    const onCreated = (p: any) => {
      const channelId = p?.channelId ?? p?.channel?.id ?? p?.channel_id;

      const normalized: Message = {
        id: p.id,
        content: p.content ?? "",
        authorId: p.authorId ?? p?.author?.id ?? "unknown",
        channelId,
        createdAt:
          typeof p.createdAt === "string"
            ? p.createdAt
            : (p?.created_at ?? new Date().toISOString()),
        updatedAt: p.updatedAt,
        deletedAt: p.deletedAt ?? null,
        deletedBy: p.deletedBy ?? null,
        author: p.author
          ? {
              id: p.author.id,
              displayName: p.author.displayName,
              avatarUrl: p.author.avatarUrl ?? null,
            }
          : {
              id: p.authorId ?? "unknown",
              displayName: p?.author?.displayName ?? "Someone",
              avatarUrl: null,
            },
        reactions: [],
        parent: p.parent
          ? {
              id: p.parent.id,
              content: p.parent.content,
              author: {
                id: p.parent.author.id,
                displayName: p.parent.author.displayName,
              },
            }
          : null,
        mentions: p.mentions
          ? p.mentions.map((mm: any) => ({
              userId: mm.userId ?? mm.user?.id,
              user: mm.user
                ? {
                    id: mm.user.id,
                    displayName: mm.user.displayName,
                    avatarUrl: mm.user.avatarUrl ?? null,
                  }
                : undefined,
            }))
          : [],
        attachments: p.attachments
          ? p.attachments.map((a: any) => ({
              id: a.id,
              url: a.url,
              fileName: a.fileName,
              mimeType: a.mimeType,
              size: a.size,
            }))
          : [],
      };

      // only add to the UI if this is the active channel
      if (channelId === active) {
        setMsgs((prev) => [...prev, normalized]);
      }

      // but ALWAYS let the callback run (for notifications etc.)
      if (onIncomingRef.current) {
        onIncomingRef.current(normalized);
      }
    };

    const onUpdated = (p: any) => {
      if (p.channelId !== active) return;
      setMsgs((prev) =>
        prev.map((m) =>
          m.id === p.id
            ? { ...m, content: p.content ?? null, updatedAt: p.updatedAt }
            : m
        )
      );
    };

    const onDeleted = (p: any) => {
      if (p.channelId !== active) return;

      const displayName =
        p.deletedBy?.displayName ??
        (p.deletedById ? resolveNameRef.current?.(p.deletedById) : undefined) ??
        (p.deletedById &&
        userIdRef.current &&
        p.deletedById === userIdRef.current
          ? "You"
          : undefined) ??
        "Unknown";

      setMsgs((prev) =>
        prev.map((m) =>
          m.id === p.id
            ? {
                ...m,
                deletedAt: p.deletedAt,
                deletedBy: p.deletedBy
                  ? {
                      id: p.deletedBy.id,
                      displayName: p.deletedBy.displayName,
                      avatarUrl: p.deletedBy.avatarUrl ?? null,
                    }
                  : p.deletedById
                    ? {
                        id: p.deletedById,
                        displayName,
                        avatarUrl: null,
                      }
                    : null,
                content: null,
              }
            : m
        )
      );
    };

    const onReactionAdded = (p: any) => {
      if (p.channelId !== active) return;

      setMsgs((prev) =>
        prev.map((m) => {
          if (m.id !== p.messageId) return m;

          const reactions = m.reactions ?? [];
          const already = reactions.some(
            (r) => r.emoji === p.emoji && r.userId === p.userId
          );
          if (already) return m;

          return {
            ...m,
            reactions: [...reactions, { emoji: p.emoji, userId: p.userId }],
          };
        })
      );
    };

    const onReactionRemoved = (p: any) => {
      if (p.channelId !== active) return;

      setMsgs((prev) =>
        prev.map((m) => {
          if (m.id !== p.messageId) return m;

          const reactions = m.reactions ?? [];
          const next = reactions.filter(
            (r) => !(r.emoji === p.emoji && r.userId === p.userId)
          );

          return { ...m, reactions: next };
        })
      );
    };

    const onRead = (p: any) => {
      if (p.channelId !== active) return;
      if (p.userId === userIdRef.current) return;

      if (p.messageId) {
        setLastReadMessageIdByOthers(p.messageId);
      }
    };

    s.on("message.read", onRead);
    s.on("message.created", onCreated);
    s.on("message.updated", onUpdated);
    s.on("message.deleted", onDeleted);
    s.on("message.added", onReactionAdded);
    s.on("message.removed", onReactionRemoved);

    return () => {
      s.off("message.read", onRead);
      s.off("message.created", onCreated);
      s.off("message.updated", onUpdated);
      s.off("message.deleted", onDeleted);
      s.off("message.added", onReactionAdded);
      s.off("message.removed", onReactionRemoved);
    };
  }, [ready, active]);

  // track near-bottom state
  useEffect(() => {
    if (!ready || !active) return;

    const el = listRef.current;
    if (!el) return;

    const updateNearBottom = () => {
      const wasNearBottom = nearBottomRef.current;
      const isNearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 64;

      nearBottomRef.current = isNearBottom;

      // transition: false → true
      if (!wasNearBottom && isNearBottom) {
        markChannelRead(active).catch(() => {});
      }
    };

    el.addEventListener("scroll", updateNearBottom);
    updateNearBottom(); // initial check

    return () => {
      el.removeEventListener("scroll", updateNearBottom);
    };
  }, [ready, active]);

  // auto-scroll at bottom on new messages
  useEffect(() => {
    const el = listRef.current;
    if (!el || !ready || !active) return;

    if (!nearBottomRef.current) return;

    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });

    markChannelRead(active).catch((err) => {
      console.error("Failed to mark channel read:", err);
    });
  }, [msgs, ready, active]);

  // mark as read on window focus or tab visibility
  useEffect(() => {
    if (!ready || !active) return;

    const markIfAtBottom = () => {
      if (!nearBottomRef.current) return;
      markChannelRead(active).catch(() => {});
    };

    const onVis = () => {
      if (document.visibilityState === "visible") markIfAtBottom();
    };

    window.addEventListener("focus", markIfAtBottom);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", markIfAtBottom);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready, active]);

  // SEND + failed fallback
  const send = async (
    text?: string,
    replyToMessageId?: string,
    mentionUserIds: string[] = [],
    attachments: Array<{
      url: string;
      fileName: string;
      mimeType: string;
      size: number;
    }> = []
  ) => {
    if (!active || !userIdRef.current) return;

    const advanceSnapshot = isWhatDidIMiss(text);

    try {
      const sent = await sendMessage(
        active,
        text,
        replyToMessageId,
        mentionUserIds,
        attachments,
        lastReadSnapshotRef.current
      );

      if (advanceSnapshot) {
        lastReadSnapshotRef.current = sent.createdAt;
      }
    } catch (err) {
      console.error("Failed to send message:", err);

      const failedId = `local-failed-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

      const displayName = resolveNameRef.current?.(userIdRef.current) ?? "You";

      const failedMessage: Message = {
        id: failedId,
        channelId: active,
        content: text ?? "(no content)",
        authorId: userIdRef.current,
        createdAt: new Date().toISOString(),
        updatedAt: undefined,
        deletedAt: null,
        deletedBy: null,
        author: {
          id: userIdRef.current,
          displayName,
          avatarUrl: null,
        },
        reactions: [],
        parent: undefined,
        mentions: [],
        attachments: attachments.map((a, idx) => ({
          id: `local-attach-${idx}`,
          url: a.url,
          fileName: a.fileName,
          mimeType: a.mimeType,
          size: a.size,
        })),
        failed: true,
        pending: false,
      };

      setMsgs((prev) => [...prev, failedMessage]);
    }
  };

  // RETRY for failed messages
  const retrySend = async (failedMessageId: string) => {
    const failed = msgs.find((m) => m.id === failedMessageId && m.failed);
    if (!failed || !active || !userIdRef.current) return;

    // remove the failed bubble
    setMsgs((prev) => prev.filter((m) => m.id !== failedMessageId));

    // resend with original payload
    await send(
      failed.content ?? undefined,
      failed.parent?.id,
      failed.mentions?.map((mm: any) => mm.userId) ?? [],
      (failed.attachments ?? []).map((a: any) => ({
        url: a.url,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
      }))
    );
  };

  const edit = async (messageId: string, text: string) => {
    const prev = msgs.find((m) => m.id === messageId);
    if (!prev || !active) return;
    const optimistic = {
      ...prev,
      content: text,
      updatedAt: new Date().toISOString(),
    };
    setMsgs((curr) => curr.map((m) => (m.id === messageId ? optimistic : m)));
    try {
      await updateMessage(active, messageId, text);
    } catch (e) {
      setMsgs((curr) => curr.map((m) => (m.id === messageId ? prev : m)));
      throw e;
    }
  };

  const remove = async (
    messageId: string,
    actor: { id: string; displayName: string }
  ) => {
    const prev = msgs.find((m) => m.id === messageId);
    if (!prev || !active) return;
    const optimistic = {
      ...prev,
      deletedAt: new Date().toISOString(),
      deletedBy: {
        id: actor.id,
        displayName: actor.displayName,
        avatarUrl: prev.deletedBy?.avatarUrl ?? prev.author.avatarUrl ?? null,
      },
      content: null,
    };

    setMsgs((curr) => curr.map((m) => (m.id === messageId ? optimistic : m)));
    try {
      await deleteMessage(active, messageId);
    } catch (e) {
      setMsgs((curr) => curr.map((m) => (m.id === messageId ? prev : m)));
      throw e;
    }
  };

  return {
    msgs,
    setMsgs,
    listRef,
    send,
    retrySend,
    edit,
    remove,
    loadOlder,
    loadingOlder,
    hasMore,
    ready,
    lastReadMessageIdByOthers,
  };
}
