"use client";

import { useMemo } from "react";
import type { ChannelWithUnread, Me, OnlineUser } from "../types";

type MentionCandidate = { id: string; displayName: string };

type Opts = {
  activeChannel: ChannelWithUnread | undefined;
  user?: Me | null;
  othersOnline: OnlineUser[];
  recently: OnlineUser[];
};

export function useMentionCandidates({
  activeChannel,
  user,
  othersOnline,
  recently,
}: Opts) {
  return useMemo<MentionCandidate[]>(() => {
    const base: MentionCandidate[] = (() => {
      if (activeChannel?.members?.length) {
        return activeChannel.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
        }));
      }

      if (!user) return [];

      return [
        { id: user.sub, displayName: user.displayName },
        ...othersOnline.map((u) => ({ id: u.id, displayName: u.displayName })),
        ...recently.map((u) => ({ id: u.id, displayName: u.displayName })),
      ];
    })();

    const myId = user?.sub;
    const isDirect = !!activeChannel?.isDirect;

    // bot mentionable in channels only (not DMs), self never
    const bot = user?.bot ?? null;

    const withBot: MentionCandidate[] = [
      ...(isDirect || !bot
        ? []
        : [{ id: bot.id, displayName: bot.displayName }]),
      ...base.filter((c) => c.id !== myId),
    ];

    // dedupe on id (so it doesn't appear twice if it's in members)
    const seen = new Set<string>();
    return withBot.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [activeChannel, user, othersOnline, recently]);
}
