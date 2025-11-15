"use client";

import type { RefObject, UIEvent } from "react";
import type { Message } from "../types";
import { MessageItem } from "./MessageItem";

type Props = {
  msgs: Message[];
  meId: string;
  listRef: RefObject<HTMLDivElement | null>;
  editingId: string | null;
  editText: string;
  setEditText: (v: string) => void;
  onStartEdit: (m: Message) => void;
  onSaveEdit: (m: Message) => void;
  onCancelEdit: () => void;
  onDelete: (m: Message) => void;
  formatDateTime: (iso: string) => string;
  // 👇 nieuwe prop:
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
};

export function MessageList({
  msgs,
  meId,
  listRef,
  editingId,
  editText,
  setEditText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  formatDateTime,
  onScroll,
}: Props) {
  return (
    <div
      ref={listRef}
      onScroll={onScroll}
      className="flex-1 overflow-auto p-4 space-y-3"
    >
      {msgs.map((m) => (
        <MessageItem
          key={m.id}
          m={m}
          isMe={m.authorId === meId}
          isEditing={editingId === m.id}
          onStartEdit={() => onStartEdit(m)}
          onSaveEdit={() => onSaveEdit(m)}
          onCancelEdit={onCancelEdit}
          onDelete={() => onDelete(m)}
          editText={editText}
          setEditText={setEditText}
          formatDateTime={formatDateTime}
        />
      ))}
    </div>
  );
}
