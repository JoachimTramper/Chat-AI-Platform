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

export function useMessages(
  active: string | null,
  userId?: string,
  opts?: { resolveDisplayName?: ResolveDisplayName }
) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const ready = !!(active && userId);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // keep latest resolver & userId in refs (avoid changing effect deps length)
  const resolveNameRef = useRef<ResolveDisplayName | undefined>(undefined);
  useEffect(() => {
    resolveNameRef.current = opts?.resolveDisplayName;
  }, [opts?.resolveDisplayName]);

  const userIdRef = useRef<string | undefined>(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Load initial messages + mark read, and scroll to bottom after load
  useEffect(() => {
    if (!ready) return;

    (async () => {
      const ms = await listMessages(active!);
      setMsgs(ms.reverse());
      await markChannelRead(active!);

      // Scroll naar onderen zodra de nieuwe berichten staan
      // één frame wachten zodat de DOM geüpdatet is
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
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

  // Realtime message events (deps length stays constant)
  useEffect(() => {
    if (!ready) return;
    const s = getSocket();

    const onCreated = (p: any) => {
      const channelId = p?.channelId ?? p?.channel?.id ?? p?.channel_id;
      if (channelId !== active) return;
      setMsgs((prev) => [
        ...prev,
        {
          id: p.id,
          content: p.content ?? "",
          authorId: p.authorId ?? p?.author?.id ?? "unknown",
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
        },
      ]);
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

    s.on("message.created", onCreated);
    s.on("message.updated", onUpdated);
    s.on("message.deleted", onDeleted);
    return () => {
      s.off("message.created", onCreated);
      s.off("message.updated", onUpdated);
      s.off("message.deleted", onDeleted);
    };
  }, [ready, active]); // ← constant deps

  // Auto-scroll at bottom on new messages
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  // Actions with optimistic UI
  const send = async (text: string) => {
    if (!active) return;
    await sendMessage(active, text);
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
    edit,
    remove,
    loadOlder,
    loadingOlder,
    hasMore,
    ready,
  };
}
