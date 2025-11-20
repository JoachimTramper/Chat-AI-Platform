"use client";

import type { RefObject, UIEvent } from "react";
import type { Message } from "../types";
import { MessageItem } from "./MessageItem";

type Props = {
  msgs: Message[];
  meId: string;
  channelId: string;
  listRef: RefObject<HTMLDivElement | null>;
  editingId: string | null;
  editText: string;
  setEditText: (v: string) => void;
  onStartEdit: (m: Message) => void;
  onSaveEdit: (m: Message) => void;
  onCancelEdit: () => void;
  onDelete: (m: Message) => void;
  formatDateTime: (iso: string) => string;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  isDirect: boolean;
  lastReadMessageIdByOthers: string | null;
  onReply: (m: Message) => void;
};

export function MessageList({
  msgs,
  meId,
  channelId,
  listRef,
  editingId,
  editText,
  setEditText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReply,
  formatDateTime,
  onScroll,
  isDirect,
  lastReadMessageIdByOthers,
}: Props) {
  const safeMsgs = msgs ?? [];

  // index of the message the other person last read
  const lastReadIndex = lastReadMessageIdByOthers
    ? safeMsgs.findIndex((m) => m.id === lastReadMessageIdByOthers)
    : -1;

  return (
    <div
      ref={listRef}
      onScroll={onScroll}
      className="flex-1 overflow-auto p-4 space-y-3"
    >
      {safeMsgs.map((m, index) => {
        // "Seen" when:
        // - DM
        // - there's a lastReadIndex
        // - this message is at or before lastReadIndex
        // - and was sent by me
        const showSeen =
          isDirect &&
          lastReadIndex >= 0 &&
          index <= lastReadIndex &&
          m.authorId === meId;

        return (
          <MessageItem
            key={m.id}
            m={m}
            meId={meId}
            channelId={channelId}
            isMe={m.authorId === meId}
            isDirect={isDirect}
            isEditing={editingId === m.id}
            onStartEdit={() => onStartEdit(m)}
            onSaveEdit={() => onSaveEdit(m)}
            onCancelEdit={onCancelEdit}
            onDelete={() => onDelete(m)}
            onReply={() => onReply(m)}
            editText={editText}
            setEditText={setEditText}
            formatDateTime={formatDateTime}
            showSeen={showSeen}
          />
        );
      })}
    </div>
  );
}
