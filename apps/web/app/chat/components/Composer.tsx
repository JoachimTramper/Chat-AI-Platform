"use client";
import React from "react";

type ReplyTarget = {
  id: string;
  authorName: string;
  content?: string | null;
};

type ComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
};

export function Composer({
  value,
  onChange,
  onSend,
  replyTo,
  onCancelReply,
}: ComposerProps) {
  const canSend = !!value.trim();

  return (
    <div className="border-t bg-white">
      {/* Reply bar above the input */}
      {replyTo && (
        <div className="px-3 pt-2 pb-1 text-xs text-gray-600 flex items-start gap-2 border-b">
          <div className="flex-1 min-w-0">
            <div className="font-medium">Replying to {replyTo.authorName}</div>
            {replyTo.content && (
              <div className="truncate text-gray-500 italic">
                {replyTo.content}
              </div>
            )}
          </div>
          {onCancelReply && (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-700 text-xs px-1"
              onClick={onCancelReply}
              aria-label="Cancel reply"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Input + send button */}
      <div className="p-3 flex gap-2 shrink-0">
        <input
          className="border rounded flex-1 p-2"
          placeholder="Type a message…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
        />
        <button
          className="border rounded px-4"
          disabled={!canSend}
          onClick={onSend}
          type="button"
        >
          Send
        </button>
      </div>
    </div>
  );
}
