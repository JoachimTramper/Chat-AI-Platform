"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type { Message } from "../types";
import { reactToMessage, unreactToMessage } from "@/lib/api";

type Props = {
  message: Message;
  meId: string;
  channelId: string;
};

const DEFAULT_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🔥"];

export function MessageReactionsBar({ message, meId, channelId }: Props) {
  const [loadingEmoji, setLoadingEmoji] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { emoji: string; userIds: string[]; mine: boolean }
    >();

    (message.reactions ?? []).forEach((r) => {
      const entry = map.get(r.emoji) ?? {
        emoji: r.emoji,
        userIds: [],
        mine: false,
      };
      entry.userIds.push(r.userId);
      if (r.userId === meId) entry.mine = true;
      map.set(r.emoji, entry);
    });

    return Array.from(map.values());
  }, [message.reactions, meId]);

  async function toggleReaction(emoji: string) {
    if (!meId) return;
    setLoadingEmoji(emoji);
    try {
      const mine = (message.reactions ?? []).some(
        (r) => r.emoji === emoji && r.userId === meId
      );
      if (mine) {
        await unreactToMessage(channelId, message.id, emoji);
      } else {
        await reactToMessage(channelId, message.id, emoji);
      }
      // websockets updaten de echte state
    } catch (e) {
      console.error("Failed to toggle reaction", e);
    } finally {
      setLoadingEmoji(null);
    }
  }

  const hasReactions = grouped.length > 0;

  // 👉 klik-buiten-om sluit de picker
  useEffect(() => {
    if (!showPicker) return;

    function handleClickOutside(e: MouseEvent) {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPicker]);

  return (
    <div className="mt-1 flex items-center gap-1 text-xs relative">
      {hasReactions && (
        <div className="flex flex-wrap gap-1">
          {grouped.map((g) => (
            <button
              key={g.emoji}
              type="button"
              onClick={() => toggleReaction(g.emoji)}
              disabled={loadingEmoji === g.emoji}
              className={`px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${
                g.mine
                  ? "bg-blue-100 border-blue-300 text-blue-800"
                  : "bg-gray-50 border-gray-200 text-gray-700"
              }`}
            >
              <span>{g.emoji}</span>
              <span>{g.userIds.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* + knop + picker in een wrapper met ref */}
      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="ml-1 px-1.5 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50"
        >
          +
        </button>

        {showPicker && (
          <div className="absolute left-0 mt-1 flex gap-1 rounded-md border bg-white px-2 py-1 shadow-sm z-10">
            {DEFAULT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  toggleReaction(emoji);
                  setShowPicker(false);
                }}
                disabled={loadingEmoji === emoji}
                className="text-base hover:scale-110 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
