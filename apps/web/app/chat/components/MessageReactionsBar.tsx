"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../types";
import { reactToMessage, unreactToMessage } from "@/lib/api";

// lazy load (client-only) emoji picker
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

type Props = {
  message: Message;
  meId: string;
  channelId: string;
  forceShow?: boolean;
};

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🔥"];

type Reaction = { emoji: string; userId: string };

export function MessageReactionsBar({
  message,
  meId,
  channelId,
  forceShow = false,
}: Props) {
  const [loadingEmoji, setLoadingEmoji] = useState<string | null>(null);

  // optimistic local state
  const [localReactions, setLocalReactions] = useState<Reaction[]>(
    (message.reactions as any) ?? []
  );

  // picker state
  const [pickerOpen, setPickerOpen] = useState(false);

  // refs for "outside click" handling
  const pickerWrapRef = useRef<HTMLDivElement | null>(null); // plus button wrapper
  const pickerContentRef = useRef<HTMLDivElement | null>(null); // desktop picker container
  const mobileSheetRef = useRef<HTMLDivElement | null>(null); // mobile sheet container (optional but nice)

  useEffect(() => {
    setLocalReactions((message.reactions as any) ?? []);
  }, [message.reactions]);

  // close picker on outside click / escape
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!pickerOpen) return;
      const target = e.target as Node;

      // click inside plus button area OR inside picker content (desktop) OR inside mobile sheet
      if (
        pickerWrapRef.current?.contains(target) ||
        pickerContentRef.current?.contains(target) ||
        mobileSheetRef.current?.contains(target)
      ) {
        return;
      }

      setPickerOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (!pickerOpen) return;
      if (e.key === "Escape") setPickerOpen(false);
    }

    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  // prevent background scroll when mobile sheet is open
  useEffect(() => {
    if (!pickerOpen) return;
    if (window.matchMedia("(min-width: 768px)").matches) return; // only mobile

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pickerOpen]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { emoji: string; count: number; mine: boolean }
    >();

    for (const r of localReactions ?? []) {
      const cur = map.get(r.emoji) ?? {
        emoji: r.emoji,
        count: 0,
        mine: false,
      };
      cur.count += 1;
      if (r.userId === meId) cur.mine = true;
      map.set(r.emoji, cur);
    }

    return Array.from(map.values());
  }, [localReactions, meId]);

  async function toggleReaction(emoji: string) {
    if (!meId) return;

    const mine = (localReactions ?? []).some(
      (r) => r.emoji === emoji && r.userId === meId
    );

    const prev = localReactions;

    // optimistic update
    setLocalReactions((cur) => {
      if (mine) {
        return cur.filter((r) => !(r.emoji === emoji && r.userId === meId));
      }
      return [...cur, { emoji, userId: meId }];
    });

    setLoadingEmoji(emoji);
    try {
      if (mine) await unreactToMessage(channelId, message.id, emoji);
      else await reactToMessage(channelId, message.id, emoji);
    } catch (e) {
      console.error("Failed to toggle reaction", e);
      setLocalReactions(prev);
    } finally {
      setLoadingEmoji(null);
    }
  }

  // chips stay visible if there are reactions
  const showChips = grouped.length > 0;

  // quick picker row only on hover (desktop) or forceShow (mobile long-press menu)
  const quickVisibilityClass = forceShow
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto";

  return (
    <div className="relative z-20 inline-flex flex-col items-start">
      {/* ROW: chips + quick + plus */}
      <div className="inline-flex items-center gap-1">
        {/* CHIPS (stay visible) */}
        {showChips && (
          <div className="flex items-center gap-1 rounded-full bg-neutral-100/80 backdrop-blur px-2 py-1 shadow-sm">
            {grouped.map(({ emoji, count, mine }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggleReaction(emoji)}
                disabled={loadingEmoji === emoji}
                className={`
                  text-xs px-2 py-1 rounded-full border flex items-center gap-1
                  transition disabled:opacity-40
                  ${
                    mine
                      ? "bg-neutral-200 border-neutral-300"
                      : "bg-white border-neutral-200 hover:bg-neutral-100"
                  }
                `}
                title={mine ? "Remove reaction" : "Add reaction"}
              >
                <span>{emoji}</span>
                <span className="text-[11px] text-neutral-600">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* QUICK + PLUS (hover/forceShow) */}
        <div
          className={`
            ml-1 flex items-center gap-1
            rounded-full bg-neutral-100/80 backdrop-blur
            px-2 py-1 shadow-sm
            transition-opacity
            ${quickVisibilityClass}
          `}
        >
          {QUICK_EMOJIS.map((emoji) => {
            const mine = grouped.some((g) => g.emoji === emoji && g.mine);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => toggleReaction(emoji)}
                disabled={loadingEmoji === emoji}
                className={`
                  text-[20px] md:text-[18px]
                  transition leading-none
                  disabled:opacity-40
                  ${
                    mine
                      ? "text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-800"
                  }
                `}
                aria-label={`React with ${emoji}`}
                title={emoji}
              >
                {emoji}
              </button>
            );
          })}

          {/* PLUS button */}
          <div className="relative" ref={pickerWrapRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={loadingEmoji !== null}
              className="
                ml-1 inline-flex items-center justify-center
                h-7 w-7 rounded-full border
                bg-white/90 hover:bg-neutral-100
                text-sm leading-none
                disabled:opacity-40
              "
              title="More emojis"
              aria-label="More emojis"
            >
              ＋
            </button>
          </div>
        </div>
      </div>

      {/* DESKTOP: FLOW PICKER */}
      {pickerOpen && (
        <div ref={pickerContentRef} className="hidden md:block mt-2">
          <div className="w-[360px] max-w-[90vw] rounded-lg border bg-white shadow-lg p-2">
            <div className="max-h-[420px] overflow-auto">
              <EmojiPicker
                onEmojiClick={(emojiData: any) => {
                  toggleReaction(emojiData.emoji);
                  setPickerOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM SHEET */}
      {pickerOpen && (
        <div className="md:hidden fixed inset-0 z-[999]">
          {/* overlay */}
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close emoji picker"
            onClick={() => setPickerOpen(false)}
          />
          {/* sheet */}
          <div
            ref={mobileSheetRef}
            className="absolute left-0 right-0 bottom-0 rounded-t-2xl bg-white shadow-2xl border-t"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-medium text-sm">Choose an emoji</div>
              <button
                type="button"
                className="text-sm text-neutral-600 hover:text-neutral-900"
                onClick={() => setPickerOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-2 max-h-[70vh] overflow-auto">
              <EmojiPicker
                onEmojiClick={(emojiData: any) => {
                  toggleReaction(emojiData.emoji);
                  setPickerOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
