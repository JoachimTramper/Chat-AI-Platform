"use client";

import { useRef, useState } from "react";
import type React from "react"; // 👈 nodig voor React.MouseEvent / PointerEvent
import type { Message } from "../types";
import { Avatar } from "./Avatar";

export function MessageItem({
  m,
  meId,
  channelId,
  isMe,
  isDirect,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReply,
  editText,
  setEditText,
  formatDateTime,
  showSeen,
}: {
  m: Message;
  meId: string;
  channelId: string;
  isMe: boolean;
  isDirect: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
  editText: string;
  setEditText: (v: string) => void;
  formatDateTime: (iso: string) => string;
  showSeen?: boolean;
}) {
  const isDeleted = !!m.deletedAt;
  const isEdited =
    !!m.updatedAt &&
    new Date(m.updatedAt).getTime() > new Date(m.createdAt).getTime();

  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // 👈 ipv NodeJS.Timeout

  const openMenu = () => {
    if (isDeleted) return;
    setMenuOpen(true);
  };

  const closeMenu = () => setMenuOpen(false);

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    // desktop right-click
    e.preventDefault();
    openMenu();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // long-press on touch
    if (e.pointerType === "touch") {
      longPressTimer.current = setTimeout(() => {
        openMenu();
      }, 400); // 400–500ms feels like "press & hold"
    }
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerUp = () => {
    clearLongPress();
  };

  const handlePointerLeave = () => {
    clearLongPress();
  };

  return (
    <div
      className="group flex gap-3 px-2 py-2 rounded-md hover:bg-gray-50"
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      <Avatar
        name={m.author.displayName}
        avatarUrl={m.author.avatarUrl ?? null}
        size={32}
      />

      <div className="flex-1 min-w-0">
        {/* header line */}
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

        {/* Reply preview */}
        {m.parent && !isDeleted && (
          <div className="mt-1 mb-1 border-l-2 border-gray-200 pl-2 text-xs text-gray-500">
            Replying to{" "}
            <span className="font-medium">{m.parent.author.displayName}</span>
            {m.parent.content && (
              <>
                :{" "}
                <span className="italic">
                  {m.parent.content.slice(0, 80)}
                  {m.parent.content.length > 80 ? "…" : ""}
                </span>
              </>
            )}
          </div>
        )}

        {/* Content / Editing / Deleted */}
        {isDeleted ? (
          <div className="text-sm text-gray-400 italic">
            Message deleted
            {m.deletedBy?.displayName ? ` by ${m.deletedBy.displayName}` : ""}
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
          <>
            {/* ROW: message + ticks */}
            <div className="mt-1 flex items-end gap-2">
              <div className="text-sm whitespace-pre-wrap flex-1">
                {m.content}
              </div>

              {/* Sent/Seen right aligned, DM only */}
              {isMe && isDirect && !isDeleted && (
                <div className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0">
                  <span aria-hidden>{showSeen ? "✓✓" : "✓"}</span>
                  <span className="hidden sm:inline">
                    {showSeen ? "Seen" : "Sent"}
                  </span>
                </div>
              )}
            </div>

            {/* actions under the message */}
            {!isDeleted && (
              <>
                {/* Desktop: hover actions */}
                <div className="mt-1 hidden gap-2 text-xs text-gray-500 md:group-hover:flex">
                  {isMe && (
                    <>
                      <button className="hover:underline" onClick={onStartEdit}>
                        Edit
                      </button>
                      <button className="hover:underline" onClick={onDelete}>
                        Delete
                      </button>
                    </>
                  )}
                  <button className="hover:underline" onClick={onReply}>
                    Reply
                  </button>
                </div>

                {/* Context / long-press menu (mobile + right-click) */}
                {menuOpen && (
                  <div className="mt-1 inline-flex gap-2 text-xs text-gray-700 bg-white border rounded shadow px-2 py-1 z-10">
                    {isMe && (
                      <>
                        <button
                          className="hover:underline"
                          onClick={() => {
                            onStartEdit();
                            closeMenu();
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="hover:underline text-red-600"
                          onClick={() => {
                            onDelete();
                            closeMenu();
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                    <button
                      className="hover:underline"
                      onClick={() => {
                        onReply();
                        closeMenu();
                      }}
                    >
                      Reply
                    </button>
                    <button
                      className="hover:underline text-gray-400"
                      onClick={closeMenu}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
