"use client";
import React from "react";

type ComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
};

export function Composer({ value, onChange, onSend }: ComposerProps) {
  const canSend = !!value.trim();

  return (
    <div className="border-t p-3 flex gap-2 shrink-0 bg-white">
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
      >
        Send
      </button>
    </div>
  );
}
