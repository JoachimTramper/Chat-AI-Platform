// app/chat/types.ts
export type Channel = {
  id: string;
  name: string;
  isDirect?: boolean;
  members?: Array<{
    id: string;
    displayName: string;
    avatarUrl: string | null;
  }>;
};

export type MessageReaction = {
  emoji: string;
  userId: string;
};

export type Message = {
  id: string;
  content: string | null;
  authorId: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  deletedBy?: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  reactions?: MessageReaction[];
};

import type { MeResponse } from "@/lib/api";
export type Me = MeResponse;

export type OnlineUser = {
  id: string;
  displayName: string;
  lastSeen?: string | null;
  avatarUrl: string | null;
};

export type ChannelWithUnread = Channel & { unread?: number };
