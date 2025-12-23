"use client";

import { useEffect, useRef, useState } from "react";
import { searchMessages } from "@/lib/api";
import type { Message } from "@/app/chat/types";

type SearchResult = Message;

type ChannelSearchProps = {
  channelId: string;
  onJumpToMessage?: (messageId: string) => void;
};

export function ChannelSearch({
  channelId,
  onJumpToMessage,
}: ChannelSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // root ref for click-outside behavior
  const containerRef = useRef<HTMLDivElement | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const msgs = await searchMessages(channelId, {
        query: trimmed,
        take: 50,
      });

      setResults(Array.isArray(msgs) ? msgs : []);
    } catch (err) {
      console.error("[ChannelSearch] search error:", err);
      setError("Search failed, please try again.");
    } finally {
      setLoading(false);
    }
  }

  const list = results ?? [];
  const hasResults = list.length > 0;

  // Close results when clicking/tapping outside
  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const root = containerRef.current;
      if (!root) return;

      const target = event.target as Node | null;
      if (target && !root.contains(target)) {
        // Hide results + "no results" state
        setResults([]);
        setHasSearched(false);
        // we laten de query zelf staan, zodat je makkelijk opnieuw kunt zoeken
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(id);
  }, [channelId]);

  return (
    <div ref={containerRef}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          className="flex-1 border rounded px-2 py-1 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in this channel…"
        />
        <button
          type="submit"
          className="
    px-3 py-1.5 text-sm rounded-lg
    bg-indigo-600 text-white font-medium
    shadow-2xl hover:bg-indigo-500 hover:shadow-md
    border border-transparent
    transition-colors transition-shadow
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
    disabled:opacity-70 disabled:cursor-not-allowed
  "
          disabled={loading}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <div className="text-xs text-red-500 mb-2">{error}</div>}

      {/* No results state */}
      {!loading && !error && hasSearched && !hasResults && (
        <div className="text-xs text-gray-500">
          No results found for <span className="font-mono">"{query}"</span>.
        </div>
      )}

      {/* Results list */}
      {hasResults && (
        <div className="mt-3 border rounded p-2 max-h-72 overflow-y-auto bg-gray-50">
          <div className="text-xs text-gray-500 mb-1">
            {list.length} result{list.length === 1 ? "" : "s"}
          </div>
          <ul className="space-y-2 text-sm">
            {list.map((m) => (
              <li
                key={m.id}
                className="border-b pb-2 last:border-b-0 cursor-pointer"
                onClick={() => {
                  if (onJumpToMessage) {
                    onJumpToMessage(m.id);
                  }
                }}
              >
                <div className="text-xs text-gray-500 mb-0.5">
                  {m.author.displayName} ·{" "}
                  {new Date(m.createdAt).toLocaleString()}
                </div>

                <div>
                  {m.content || <i className="text-gray-400">(no text)</i>}
                </div>

                {m.parent && (
                  <div className="mt-1 text-[11px] text-gray-500">
                    Replying to {m.parent.author.displayName}:{" "}
                    <q>{m.parent.content}</q>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
