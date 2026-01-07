"use client";

import { useRef, useState } from "react";
import type React from "react";
import type { Message } from "../types";
import { Avatar } from "./Avatar";
import { resolveFileUrl } from "@/lib/files";
import { MessageReactionsBar } from "./MessageReactionsBar";

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
  isLastOwn,
  onRetry,
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
  isLastOwn?: boolean;
  onRetry?: () => void;
}) {
  const isDeleted = !!m.deletedAt;
  const isEdited =
    !!m.updatedAt &&
    new Date(m.updatedAt).getTime() > new Date(m.createdAt).getTime();

  const isMentioned =
    !isMe &&
    !!m.mentions?.some((mm: any) => mm.userId === meId || mm.user?.id === meId);

  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouchPointer = (e: React.PointerEvent) => e.pointerType === "touch";
  const isDmMine = isDirect && isMe;

  const openMenu = () => {
    if (isDeleted) return;
    setMenuOpen(true);
  };

  const closeMenu = () => setMenuOpen(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isTouchPointer(e)) return;
    if (e.button !== 0) return;

    longPressTimer.current = setTimeout(() => {
      openMenu();
    }, 400);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isTouchPointer(e)) return;
    clearLongPress();
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    if (!isTouchPointer(e)) return;
    clearLongPress();
  };

  const hasReactions = (m.reactions?.length ?? 0) > 0;

  return (
    <div
      className={`group flex gap-3 px-2 py-px rounded-md hover:bg-gray-50 ${
        isDmMine ? "flex-row-reverse" : ""
      }`}
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
        <div
          className={`text-xs text-gray-500 flex items-center gap-2 flex-wrap ${
            isDmMine ? "justify-end" : ""
          }`}
        >
          <span className="font-medium text-gray-700">
            {m.author.displayName}
          </span>
          <span>•</span>
          <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
          {isEdited && !isDeleted && (
            <span className="italic text-gray-400">(edited)</span>
          )}

          {/* Badge when mentioned */}
          {isMentioned && (
            <>
              <span>•</span>
              <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-medium">
                Mentions you
              </span>
            </>
          )}
        </div>

        {/* Reply preview */}
        {m.parent && !isDeleted && (
          <div
            className={`
              mt-1 mb-1 flex
              ${isDmMine ? "justify-end" : ""}
            `}
          >
            <div
              className="
                max-w-[80%] rounded-lg border border-neutral-200/70
                bg-white/80 px-3 py-1.5 text-xs text-neutral-600 shadow-sm
                backdrop-blur-sm
              "
            >
              <div className="font-medium text-neutral-800 truncate">
                Replying to {m.parent.author.displayName}
              </div>
              {m.parent.content && (
                <div className="text-[11px] text-neutral-500">
                  {m.parent.content.length > 80
                    ? `${m.parent.content.slice(0, 80)}…`
                    : m.parent.content}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content / Editing / Failed / Deleted */}
        {isDeleted ? (
          <div className="text-sm text-gray-400 italic">
            Message deleted
            {m.deletedBy?.displayName ? ` by ${m.deletedBy.displayName}` : ""}
          </div>
        ) : m.failed ? (
          // Failed State
          <div
            className={`mt-1 flex items-end gap-2 ${
              isDmMine ? "justify-end" : ""
            }`}
          >
            <div className="max-w-[80%]">
              <button
                type="button"
                onClick={onRetry}
                className="
                  inline-flex flex-col items-start max-w-full text-sm
                  px-3 py-2 rounded-2xl border shadow-sm
                  bg-red-50 border-red-300 text-red-700
                  hover:bg-red-100 hover:border-red-400
                  text-left
                "
                title="Tap to retry sending this message"
              >
                <div className="font-semibold text-red-700 mb-0.5">
                  ⚠ Failed to send — tap to retry
                </div>
                {m.content && (
                  <div className="whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                )}
              </button>
            </div>
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
            <div
              className={`flex items-end gap-2 ${isDmMine ? "justify-end" : ""}`}
            >
              {/* Sent/Seen LEFT of bubble, DM only */}
              {isMe && isDirect && !isDeleted && (showSeen || isLastOwn) && (
                <div className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0 mb-1">
                  <span aria-hidden>{showSeen ? "✓✓" : "✓"}</span>
                  <span className="hidden sm:inline">
                    {showSeen ? "Seen" : "Sent"}
                  </span>
                </div>
              )}

              {/* wider on small screens, on sm+ again 80% */}
              <div className="max-w-[92%] sm:max-w-[80%] relative inline-block">
                <div
                  className={`
                    inline-flex min-w-fit items-center max-w-full
                    text-sm whitespace-pre-wrap
                    px-3 py-2 rounded-2xl
                    transition-shadow
                    ${isMe ? "bg-teal-200 shadow" : "bg-white border border-gray-200 shadow"}
                  `}
                >
                  {m.content}
                </div>

                {/* reactions: always left-aligned, anchored to bubble */}
                {!isDeleted && !m.failed && (
                  <div
                    className={[
                      menuOpen || hasReactions
                        ? "mt-[2px] flex"
                        : "hidden md:group-hover:flex md:mt-[2px]",
                    ].join(" ")}
                  >
                    <MessageReactionsBar
                      message={m}
                      meId={meId}
                      channelId={channelId}
                      forceShow={menuOpen}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            {!isDeleted &&
              !m.failed &&
              m.attachments &&
              m.attachments.length > 0 && (
                <div
                  className={`
                    mt-2 flex flex-col gap-1
                    ${isDmMine ? "items-end" : ""}
                  `}
                >
                  {m.attachments.map((att) => {
                    const isImage = att.mimeType.startsWith("image/");
                    const url = resolveFileUrl(att.url);

                    return (
                      <div
                        key={att.id}
                        className="inline-flex items-center gap-2 text-xs text-gray-600"
                      >
                        {isImage ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="border rounded-md overflow-hidden max-w-xs hover:border-gray-400"
                          >
                            <img
                              src={url}
                              alt={att.fileName}
                              className="max-h-40 w-auto object-cover block"
                            />
                          </a>
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className={`
                              inline-flex items-center gap-2 px-2 py-1 border rounded-md hover:bg-gray-50
                              ${isDmMine ? "justify-end text-right" : ""}
                            `}
                          >
                            <span className="text-[11px] font-medium truncate max-w-[10rem]">
                              {att.fileName}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {(att.size / 1024).toFixed(1)} KB
                            </span>
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            {/* actions below message */}
            {!isDeleted && (
              <>
                {/* Desktop: hover actions */}
                <div
                  className={`
                    mt-0 hidden gap-2 text-xs text-gray-500 md:group-hover:flex
                    ${isDmMine ? "justify-end" : ""}
                  `}
                >
                  {isMe && !m.failed && (
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

                {/* Context / long-press menu (mobile only) */}
                {menuOpen && (
                  <div
                    className="
                      md:hidden
                      mt-0 inline-flex gap-2 text-xs text-gray-700 bg-white border rounded shadow px-2 py-1 z-10
                      transition-all duration-150 origin-top-left
                      animate-[fadeInScale_150ms_ease-out]
                    "
                  >
                    {isMe && !m.failed && (
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
