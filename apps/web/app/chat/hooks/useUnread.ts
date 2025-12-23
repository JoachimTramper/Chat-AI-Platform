"use client";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import type { ChannelWithUnread } from "../types";

export function useUnread({
  active,
  myId,
  setChannels,
}: {
  active: string | null;
  myId?: string;
  setChannels: React.Dispatch<React.SetStateAction<ChannelWithUnread[]>>;
}) {
  // 1) Reset unread to 0 when opening/switching channel
  useEffect(() => {
    if (!active) return;
    setChannels((prev) =>
      prev.map((c) => (c.id === active ? { ...c, unread: 0 } : c))
    );
  }, [active, setChannels]);

  // 2) Realtime unread updates
  useEffect(() => {
    const s = (() => {
      try {
        return getSocket();
      } catch {
        return null;
      }
    })();
    if (!s) return;

    // a) message.created (fallback)

    const onCreated = (payload: any) => {
      const channelId =
        payload?.channelId ?? payload?.channel?.id ?? payload?.channel_id;
      const authorId =
        payload?.author?.id ?? payload?.authorId ?? payload?.userId;
      if (!channelId) return;

      // active channel stays at 0
      if (channelId === active) {
        setChannels((prev) =>
          prev.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c))
        );
        return;
      }

      // ignore my own messages
      if (authorId && myId && authorId === myId) return;

      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
        )
      );
    };

    // b) channel.unread (PRIMARY)

    const onUnread = (payload: any) => {
      const channelId = payload?.channelId;
      const delta = payload?.delta ?? 1;
      if (!channelId) return;

      // active channel stays at 0
      if (channelId === active) {
        setChannels((prev) =>
          prev.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c))
        );
        return;
      }

      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, unread: (c.unread ?? 0) + delta } : c
        )
      );
    };

    s.on("channel.unread", onUnread);

    return () => {
      s.off("channel.unread", onUnread);
    };
  }, [active, myId, setChannels]);
}
