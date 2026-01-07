"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../types";
import { reactToMessage, unreactToMessage } from "@/lib/api";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react-dom";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

type Props = {
  message: Message;
  meId: string;
  channelId: string;
  forceShow?: boolean;
};

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🔥"];
type Reaction = { emoji: string; userId: string };

function isDomElement(el: unknown): el is Element {
  return !!el && typeof (el as Element).contains === "function";
}

export function MessageReactionsBar({
  message,
  meId,
  channelId,
  forceShow = false,
}: Props) {
  const [loadingEmoji, setLoadingEmoji] = useState<string | null>(null);

  const [localReactions, setLocalReactions] = useState<Reaction[]>(
    ((message.reactions as any) ?? []) as Reaction[]
  );

  const [pickerOpen, setPickerOpen] = useState(false);

  const mobileSheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalReactions((((message.reactions as any) ?? []) as Reaction[]) ?? []);
  }, [message.reactions]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { emoji: string; count: number; mine: boolean }
    >();
    for (const r of localReactions ?? []) {
      const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
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

    setLocalReactions((cur) => {
      if (mine)
        return cur.filter((r) => !(r.emoji === emoji && r.userId === meId));
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

  const showChips = grouped.length > 0;

  const quickVisibilityClass = forceShow
    ? "max-h-14 opacity-100 mt-0.5 pointer-events-auto"
    : "max-h-0 opacity-0 mt-0 pointer-events-none md:group-hover:max-h-14 md:group-hover:opacity-100 md:group-hover:mt-0.5 md:group-hover:pointer-events-auto";

  // Floating UI for desktop picker (flip/shift)
  const { x, y, strategy, refs, update } = useFloating({
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!pickerOpen) return;
      const target = e.target as Node;

      const refEl = refs.reference.current;
      const floatEl = refs.floating.current;

      if (isDomElement(refEl) && refEl.contains(target)) return;
      if (floatEl && floatEl.contains(target)) return;
      if (mobileSheetRef.current?.contains(target)) return;

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
  }, [pickerOpen, refs.reference, refs.floating]);

  useEffect(() => {
    if (!pickerOpen) return;
    if (window.matchMedia("(min-width: 768px)").matches) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (pickerOpen) update();
  }, [pickerOpen, update]);

  return (
    <div className="relative z-20 inline-flex flex-col items-start">
      {/* REACTION CHIPS — geen outer bubble, wél wrap */}
      {showChips && (
        <div className="flex flex-wrap items-center gap-1">
          {grouped.map(({ emoji, count, mine }) => (
            <button
              key={emoji}
              type="button"
              onClick={() => toggleReaction(emoji)}
              disabled={loadingEmoji === emoji}
              className={`
                inline-flex items-center gap-1
                rounded-full border
                px-2 py-[2px]
                text-xs leading-none
                shadow-sm
                transition disabled:opacity-40
                ${
                  mine
                    ? "bg-neutral-200 border-neutral-300"
                    : "bg-white border-neutral-200 hover:bg-neutral-100"
                }
              `}
              title={mine ? "Remove reaction" : "Add reaction"}
            >
              <span className="text-[14px] leading-none">{emoji}</span>
              <span className="text-[11px] text-neutral-600">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* QUICK BAR */}
      <div
        className={`w-full overflow-hidden transition-all duration-150 ${quickVisibilityClass}`}
      >
        <div
          className="
      inline-flex items-center gap-1
      rounded-full bg-neutral-100/80 backdrop-blur
      px-2 py-1 shadow-sm
    "
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
            text-[18px] md:text-[18px]
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
          <button
            ref={refs.setReference}
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

      {/* DESKTOP PICKER */}
      {pickerOpen && (
        <div className="hidden md:block">
          <div
            ref={refs.setFloating}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
              zIndex: 1000,
            }}
            className="w-[360px] max-w-[90vw] rounded-lg border bg-white shadow-lg p-2"
          >
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
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close emoji picker"
            onClick={() => setPickerOpen(false)}
          />
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
