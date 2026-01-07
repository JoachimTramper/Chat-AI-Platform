"use client";
import React, { useMemo, useState, useRef } from "react";
import { Paperclip, X } from "lucide-react";

type ReplyTarget = {
  id: string;
  authorName: string;
  content?: string | null;
};

type MentionCandidate = {
  id: string;
  displayName: string;
};

type ComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: (files: File[]) => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  mentionCandidates?: MentionCandidate[];
};

export function Composer({
  value,
  onChange,
  onSend,
  replyTo,
  onCancelReply,
  mentionCandidates = [],
}: ComposerProps) {
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionList, setShowMentionList] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSend = !!value.trim() || files.length > 0;

  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleChange(v: string) {
    onChange(v);

    if (!mentionCandidates.length) {
      setShowMentionList(false);
      return;
    }

    const at = v.lastIndexOf("@");
    if (at === -1) {
      setShowMentionList(false);
      setMentionQuery("");
      return;
    }

    const q = v.slice(at + 1);

    if (q === "") {
      setMentionQuery("");
      setShowMentionList(true); // only '@' → show all candidates
      return;
    }

    // only a–z0–9_ in the query
    if (/^[A-Za-z0-9_]+$/.test(q)) {
      setMentionQuery(q);
      setShowMentionList(true);
    } else {
      setShowMentionList(false);
      setMentionQuery("");
    }
  }

  const filteredMentionCandidates = useMemo(() => {
    if (!showMentionList) return [];
    if (!mentionQuery) return mentionCandidates.slice(0, 20);

    const q = mentionQuery.toLowerCase();
    return mentionCandidates
      .filter((u) => u.displayName.toLowerCase().includes(q))
      .slice(0, 20);
  }, [showMentionList, mentionQuery, mentionCandidates]);

  function handleSelectMention(user: MentionCandidate) {
    const v = value;
    const at = v.lastIndexOf("@");
    if (at === -1) return;

    const before = v.slice(0, at);
    const after = v.slice(at + 1 + mentionQuery.length);

    const insert = `@${user.displayName} `;
    const next = `${before}${insert}${after}`;

    onChange(next);
    setShowMentionList(false);
    setMentionQuery("");

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + insert.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function handleSendClick() {
    if (!canSend) return;

    setShowMentionList(false);
    setMentionQuery("");

    onSend(files);
    setFiles([]); // reset selected files after sending
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendClick();
    } else if (e.key === "Escape") {
      setShowMentionList(false);
      setMentionQuery("");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setFiles((prev) => [...prev, ...selected]);
    // reset so you can select the same file again later
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }
  return (
    <div className="px-3 sm:px-4 py-2 bg-transparent">
      {/* Reply bar */}
      {replyTo && (
        <div className="mb-2 flex px-3 sm:px-4">
          <div
            className="
              max-w-[80%] w-full
              rounded-lg border border-neutral-200/70
              bg-white/80 px-3 py-2
              text-xs text-neutral-700
              shadow-sm backdrop-blur-sm
            "
          >
            <div className="font-medium text-neutral-900 truncate">
              Replying to {replyTo.authorName}
            </div>

            {replyTo.content && (
              <div className="text-[11px] text-neutral-500">
                {replyTo.content.length > 80
                  ? `${replyTo.content.slice(0, 80)}…`
                  : replyTo.content}
              </div>
            )}

            {onCancelReply && (
              <button
                type="button"
                onClick={onCancelReply}
                className="text-[11px] text-neutral-500 hover:text-neutral-700 underline"
              >
                Cancel reply
              </button>
            )}
          </div>
        </div>
      )}

      {/* Files preview */}
      {files.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-2 text-xs text-neutral-700">
          {files.map((file, idx) => {
            const isImage = file.type.startsWith("image/");
            return (
              <div
                key={idx}
                className="flex items-center gap-2 border border-neutral-300 rounded px-2 py-1 bg-white/80 backdrop-blur-sm"
              >
                <span className="text-[10px]">{isImage ? "🖼" : "📄"}</span>
                <span className="max-w-[140px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input + send */}
      <div className="p-3 flex gap-2 shrink-0 items-center bg-transparent">
        {/* hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Input + attach in één blok */}
        <div className="relative flex-1">
          {showMentionList && filteredMentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-56 max-h-48 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow text-sm z-10">
              {filteredMentionCandidates.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="block w-full text-left px-2 py-1 hover:bg-neutral-100"
                  onClick={() => handleSelectMention(u)}
                >
                  {u.displayName}
                </button>
              ))}
            </div>
          )}

          {/* Wrapper that takes over the border / background */}
          <div className="flex items-center gap-2 border border-neutral-300 rounded-xl bg-white px-2 py-1 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500">
            {/* Attach icon in the input bar */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center h-8 w-8 rounded-full text-neutral-500 hover:bg-neutral-100"
              title="Attach files"
            >
              <Paperclip size={18} strokeWidth={2} />
            </button>

            {/* The actual input, transparent within the wrapper */}
            <input
              ref={inputRef}
              className="flex-1 bg-transparent border-none outline-none text-sm text-neutral-900 placeholder:text-neutral-500"
              placeholder="Type a message…"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {/* Send button */}
        <button
          className="
            inline-flex items-center justify-center h-9 px-4 rounded-full text-sm font-medium
          bg-indigo-600 text-white border border-transparent
            shadow-sm hover:bg-indigo-500 hover:shadow-md
            transition-colors transition-shadow
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
            disabled:opacity-70 disabled:cursor-not-allowed
          "
          disabled={!canSend}
          onClick={handleSendClick}
          type="button"
        >
          Send
        </button>
      </div>
    </div>
  );
}
