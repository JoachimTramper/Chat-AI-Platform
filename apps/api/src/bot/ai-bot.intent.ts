// apps/api/src/bot/bot.intent.ts
export type BotMode =
  | 'command'
  | 'since_last_read'
  | 'summary'
  | 'digest'
  | 'chat';

export type BotIntent = {
  mentioned: boolean;
  cleaned: string; // mention stripped
  isCommand: boolean;
  commandName: string | null; // without "!"
  wantsSummary: boolean;
  wantsSinceLastRead: boolean;
  wantsDigest: boolean;
};

const SUMMARY_RE =
  /\b(samenvat|samenvatting|samenvatten|summary|summarize|tldr)\b/i;

const SINCE_LAST_READ_RE =
  /\b(what did i miss|since last read|wat heb ik gemist|wat mis ik|bijgepraat)\b/i;

// you can decide command name later; MVP supports "!digest" or "mention + digest"
const DIGEST_RE = /\b(digest|dagoverzicht|daily digest)\b/i;

export function parseBotIntent(rawText: string, botName: string): BotIntent {
  const text = (rawText ?? '').trim();

  const mentionToken = `@${botName}`;
  const mentioned = text.includes(mentionToken);

  // Strip mention(s) for intent detection / LLM prompt cleanliness
  const cleaned = text.replaceAll(mentionToken, '').trim();
  const lower = cleaned.toLowerCase();

  const isCommand = text.startsWith('!');
  const commandName = isCommand
    ? (text.slice(1).trim().split(/\s+/)[0]?.toLowerCase() ?? null)
    : null;

  const wantsSummary = SUMMARY_RE.test(lower);
  const wantsSinceLastRead = SINCE_LAST_READ_RE.test(lower);
  const wantsDigest = DIGEST_RE.test(lower) || commandName === 'digest';

  return {
    mentioned,
    cleaned,
    isCommand,
    commandName,
    wantsSummary,
    wantsSinceLastRead,
    wantsDigest,
  };
}

export function resolveBotMode(
  intent: BotIntent,
  hasEffectiveLastRead: boolean,
): BotMode {
  // Commands always deterministic
  if (intent.isCommand) return 'command';

  // Mention required for non-command chat modes (keeps current behavior)
  // Mode selection priority: since_last_read > summary > digest > chat
  if (intent.wantsSinceLastRead && hasEffectiveLastRead)
    return 'since_last_read';
  if (intent.wantsSummary) return 'summary';
  if (intent.wantsDigest) return 'digest';
  return 'chat';
}
