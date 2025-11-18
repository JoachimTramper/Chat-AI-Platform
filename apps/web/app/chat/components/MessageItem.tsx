"use client";

import type { Message } from "../types";
import { Avatar } from "./Avatar";
import { MessageReactionsBar } from "./MessageReactionsBar";

export function MessageItem({
  m,
  meId,
  channelId,
  isMe,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  editText,
  setEditText,
  formatDateTime,
  showSeen,
}: {
  m: Message;
  meId: string;
  channelId: string;
  isMe: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  editText: string;
  setEditText: (v: string) => void;
  formatDateTime: (iso: string) => string;
  showSeen?: boolean;
}) {
  const isDeleted = !!m.deletedAt;
  const isEdited =
    !!m.updatedAt &&
    new Date(m.updatedAt).getTime() > new Date(m.createdAt).getTime();

  return (
    <div className="group flex gap-3 px-2 py-2 rounded-md hover:bg-gray-50">
      {/* Avatar left */}
      <Avatar
        name={m.author.displayName}
        avatarUrl={m.author.avatarUrl ?? null}
        size={32}
      />

      {/* Text right */}
      <div className="flex-1">
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span className="font-medium text-gray-700">
            {m.author.displayName}
          </span>
          <span>•</span>
          <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
          {isEdited && !isDeleted && (
            <span className="italic text-gray-400">(edited)</span>
          )}
        </div>

        {/* content / editing / deleted */}
        {isDeleted ? (
          <div className="text-sm text-gray-400 italic">
            Message deleted
            {m.deletedBy?.displayName ? ` by ${m.deletedBy.displayName}` : ""}.
          </div>
        ) : isEditing ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              className="border rounded px-2 py-1 text-sm flex-1"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              autoFocus
            />
            <button
              className="text-sm border rounded px-2 py-1 hover:bg-gray-100"
              onClick={onSaveEdit}
            >
              Save
            </button>
            <button
              className="text-sm border rounded px-2 py-1 hover:bg-gray-100"
              onClick={onCancelEdit}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-end gap-2">
            <div className="text-sm whitespace-pre-wrap flex-1">
              {m.content}
            </div>

            {/* Sent */}
            {isMe && !isDeleted && (
              <div className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0">
                <span aria-hidden>{showSeen ? "✓✓" : "✓"}</span>
                <span className="hidden sm:inline">
                  {showSeen ? "Seen" : "Sent"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
