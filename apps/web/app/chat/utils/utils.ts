// apps/web/app/chat/chatUtils.ts
import type { ChannelWithUnread } from "../types";

export type MentionCandidate = {
  id: string;
  displayName: string;
};

export function formatLastOnline(d?: string | null): string {
  if (!d) return "";
  const then = new Date(d).getTime();
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return "Last online just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return `Last online ${m} min${m !== 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Last online ${h} hour${h !== 1 ? "s" : ""} ago`;
  const dys = Math.floor(h / 24);
  if (dys < 7) return `Last online ${dys} day${dys !== 1 ? "s" : ""} ago`;
  const dt = new Date(d);
  return `Last online ${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

export function mergeChannelsById(
  prev: ChannelWithUnread[],
  next: ChannelWithUnread[]
): ChannelWithUnread[] {
  const byId = new Map(prev.map((x) => [x.id, x]));
  for (const it of next) {
    const old = byId.get(it.id);
    byId.set(it.id, old ? { ...old, ...it } : it);
  }
  return Array.from(byId.values());
}

export function extractMentionUserIds(
  content: string,
  candidates: MentionCandidate[]
): string[] {
  if (!candidates.length || !content) return [];

  const regex = /@([A-Za-z0-9_]+)/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(content)) !== null) {
    const username = match[1];
    if (username) {
      names.add(username);
    }
  }

  if (names.size === 0) return [];

  const byName = new Map(
    candidates.map((m) => [m.displayName.toLowerCase(), m.id])
  );

  const ids: string[] = [];
  for (const name of names) {
    const id = byName.get(name.toLowerCase());
    if (id) ids.push(id);
  }
  return ids;
}
