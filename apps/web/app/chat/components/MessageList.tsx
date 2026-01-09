"use client";

import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react";
import type { Message } from "../types";
import { MessageItem } from "./MessageItem";
import { dayKey, formatDayLabel } from "../utils/utils";

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
  scrollToMessageId?: string | null;
  onScrolledToMessage?: () => void;
  loadingOlder: boolean;
  onRetrySend?: (id: string) => void;
};

export function MessageList({
  msgs = [],
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
  scrollToMessageId,
  onScrolledToMessage,
  loadingOlder,
  onRetrySend,
}: Props) {
  const safeMsgs = msgs;

  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const lastReadIndex = lastReadMessageIdByOthers
    ? safeMsgs.findIndex((m) => m.id === lastReadMessageIdByOthers)
    : -1;

  // latest message from me that is up to and including lastReadIndex
  const lastMySeenIndex =
    isDirect && lastReadIndex >= 0
      ? (() => {
          for (let i = lastReadIndex; i >= 0; i--) {
            const msg = safeMsgs[i];
            if (!msg) continue;
            if (msg.authorId === meId) return i;
          }
          return -1;
        })()
      : -1;

  // latest message from me in this list
  const lastMyIndex =
    isDirect && safeMsgs.length > 0
      ? (() => {
          for (let i = safeMsgs.length - 1; i >= 0; i--) {
            const msg = safeMsgs[i];
            if (!msg) continue;
            if (msg.authorId === meId) return i;
          }
          return -1;
        })()
      : -1;

  // scroll when a jump target is set
  useEffect(() => {
    if (!scrollToMessageId) return;

    const el = messageRefs.current[scrollToMessageId];
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    // mark this message as highlighted
    setHighlightedId(scrollToMessageId);

    // let ChatPage know it's processed
    onScrolledToMessage?.();
  }, [scrollToMessageId, onScrolledToMessage]);

  // auto-clear highlight after 1.5s
  useEffect(() => {
    if (!highlightedId) return;

    const timeout = window.setTimeout(() => {
      setHighlightedId(null);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [highlightedId]);

  return (
    <div
      ref={listRef}
      onScroll={onScroll}
      className="flex-1 overflow-auto pt-16 md:pt-4 pb-28"
    >
      <div
        className={
          isDirect
            ? "w-full space-y-1 px-2 sm:px-6 lg:px-[10vw] xl:px-[15vw]"
            : "w-full space-y-1 px-2 sm:px-4 lg:px-6"
        }
      >
        {/* Loading older messages-indicator */}
        {safeMsgs.length > 0 && loadingOlder && (
          <div className="w-full text-center py-2 text-neutral-500 text-xs">
            <span className="animate-spin inline-block mr-2">↻</span>
            Loading older messages…
          </div>
        )}
        {safeMsgs.length === 0 ? (
          // empty state
          <div className="flex items-center justify-center py-10">
            <div className="max-w-sm mx-auto text-center text-sm text-neutral-700 bg-indigo-100 backdrop-blur-sm rounded-xl px-4 py-3 shadow-sm border border-neutral-200">
              <div className="text-2xl mb-1">🐦🎋</div>
              <div className="font-medium text-neutral-900 mb-1">
                Your bamboo forest is quiet…
              </div>
              <div className="text-xs text-neutral-600">
                Send the first message to get the chat going!
              </div>
            </div>
          </div>
        ) : (
          safeMsgs.map((m, index) => {
            const prev = safeMsgs[index - 1];
            const showDayDivider =
              !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);

            const showSeen = isDirect && index === lastMySeenIndex;
            const isLastOwn =
              isDirect && m.authorId === meId && index === lastMyIndex;
            const isHighlighted = highlightedId === m.id;

            return (
              <div key={m.id}>
                {showDayDivider && (
                  <div className="-mt-0 my-2 md:my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-neutral-300/70" />
                    <div className="text-[11px] px-2 py-1 rounded-full bg-white/70 border border-neutral-300 text-neutral-700">
                      {formatDayLabel(m.createdAt)}
                    </div>
                    <div className="h-px flex-1 bg-neutral-300/70" />
                  </div>
                )}

                <div
                  ref={(el) => {
                    messageRefs.current[m.id] = el;
                  }}
                  className={
                    isHighlighted
                      ? "ring-2 ring-blue-400 bg-blue-50 rounded-md"
                      : ""
                  }
                >
                  <MessageItem
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
                    isLastOwn={isLastOwn}
                    onRetry={() => onRetrySend?.(m.id)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
