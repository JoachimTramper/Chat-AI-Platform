// apps/api/src/bot/bot.format.ts
type FormatMsg = {
  createdAt: Date | string;
  content: string | null;
  author: { displayName: string };
  parent?: {
    id: string;
    author?: { displayName?: string | null } | null;
  } | null;
  mentions?: Array<{ user?: { displayName?: string | null } | null }> | null;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatTimestamp(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function formatHistoryLine(m: FormatMsg): string {
  const dt =
    typeof m.createdAt === 'string' ? new Date(m.createdAt) : m.createdAt;
  const ts = formatTimestamp(dt);

  const author = m.author?.displayName ?? 'Someone';
  const content = (m.content ?? '').replace(/\s+/g, ' ').trim();

  const replyTo = m.parent?.author?.displayName
    ? ` (reply to ${m.parent.author.displayName})`
    : '';
  const mentionNames =
    (m.mentions ?? [])
      .map((x) => x?.user?.displayName)
      .filter(Boolean)
      .map((n) => `@${n}`)
      .join(' ') || '';

  const suffix = mentionNames ? ` ${mentionNames}` : '';

  return `[${ts}] ${author}${replyTo}: ${content}${suffix}`.trim();
}
