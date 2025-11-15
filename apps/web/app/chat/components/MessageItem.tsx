"use client";

import type { Message } from "../types";
import { Avatar } from "./Avatar";

export function MessageItem({
  m,
  isMe,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  editText,
  setEditText,
  formatDateTime,
}: {
  m: Message;
  isMe: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  editText: string;
  setEditText: (v: string) => void;
  formatDateTime: (iso: string) => string;
}) {
  const isDeleted = !!m.deletedAt;
  const isEdited =
    !!m.updatedAt &&
    new Date(m.updatedAt).getTime() > new Date(m.createdAt).getTime();

  return (
    <div className="group flex gap-3 px-2 py-2 rounded-md hover:bg-gray-50">
      {/* Avatar links */}
      <Avatar
        name={m.author.displayName}
        avatarUrl={m.author.avatarUrl ?? null}
        size={32}
      />

      {/* Tekst rechts */}
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
          <div className="text-sm mt-1 whitespace-pre-wrap">{m.content}</div>
        )}

        {!isDeleted && isMe && !isEditing && (
          <div className="mt-1 hidden gap-2 group-hover:flex">
            <button
              className="text-xs text-blue-600 hover:underline"
              onClick={onStartEdit}
            >
              Edit
            </button>
            <button
              className="text-xs text-red-600 hover:underline"
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
