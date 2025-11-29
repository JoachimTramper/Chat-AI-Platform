"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  me,
  logout,
  createChannel,
  listDirectChannels,
  listChannelsWithUnread,
  getOrCreateDirectChannel,
  updateAvatar,
  uploadAvatarFile,
  uploadMessageFile,
} from "@/lib/api";
import {
  ensureNotificationPermission,
  showBrowserNotification,
} from "@/lib/notifications";

import type { ChannelWithUnread, Message, Me } from "./types";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";
import { Sidebar } from "./components/Sidebar";
import { ChatHeader } from "./components/ChatHeader";
import { ChannelSearch } from "./components/ChannelSearch";
import { useMessages } from "./hooks/useMessages";
import { useTyping } from "./hooks/useTyping";
import { usePresence } from "./hooks/usePresence";
import { useUnread } from "./hooks/useUnread";
import {
  extractMentionUserIds,
  formatDateTime,
  formatLastOnline,
  mergeChannelsById,
  type MentionCandidate,
} from "./utils/utils";

type ReplyTarget = {
  id: string;
  authorName: string;
  content: string | null;
};

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [channels, setChannels] = useState<ChannelWithUnread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(
    null
  );

  // auth guard
  useEffect(() => {
    me()
      .then((u) => setUser(u as Me))
      .catch(() => {
        setUser(null);
        router.replace("/login");
      });
  }, [router]);

  // initial channels + active
  useEffect(() => {
    (async () => {
      try {
        const items = await listChannelsWithUnread();
        if (!items || items.length === 0) {
          const c = await createChannel("general");
          const next = await listChannelsWithUnread();
          setChannels(mergeChannelsById([], next));
          setActive(next[0]?.id ?? c.id);
          return;
        }
        setChannels(mergeChannelsById([], items));
        setActive(items[0]?.id ?? null);
      } catch (e) {
        console.error("Failed to load channels with unread:", e);
      }
    })();
  }, []);

  // hooks
  const {
    msgs,
    listRef,
    send,
    edit,
    remove,
    loadOlder,
    loadingOlder,
    hasMore,
    lastReadMessageIdByOthers,
  } = useMessages(active, user?.sub, {
    resolveDisplayName,
    onIncomingMessage: (msg) => {
      if (!user) return;

      // skip own messages
      if (msg.authorId === user.sub) return;

      const isDifferentChannel = msg.channelId !== active;

      const isMentioned = msg.mentions?.some((m) => m.userId === user.sub);

      if (isMentioned && isDifferentChannel) {
        showBrowserNotification({
          title: `${msg.author.displayName} mentioned you`,
          body: msg.content ?? "(no text)",
          icon: msg.author.avatarUrl ?? undefined,
        });
      }
    },
  });

  const { label: typingLabel, emitTyping } = useTyping(active, user?.sub);
  const { othersOnline, recently } = usePresence(user?.sub);
  useUnread({ active, myId: user?.sub, setChannels });

  // --- displayName resolver (for "Message deleted by …") ---
  const idToNameRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();

    // 1) self
    if (user) map.set(user.sub, user.displayName);

    // 2) presence
    othersOnline.forEach((u) => map.set(u.id, u.displayName));
    recently.forEach((u) => map.set(u.id, u.displayName));

    // 3) names from messages (authors / previous deletes)
    msgs.forEach((m) => {
      map.set(m.author.id, m.author.displayName);
      if (m.deletedBy) map.set(m.deletedBy.id, m.deletedBy.displayName);
    });

    // 4) DM members (if present on channels)
    channels.forEach((c) =>
      c.members?.forEach((m) => map.set(m.id, m.displayName))
    );

    idToNameRef.current = map;
  }, [user, othersOnline, recently, msgs, channels]);

  function resolveDisplayName(id: string) {
    return idToNameRef.current.get(id);
  }

  // DMs list enrich (preserve members)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const dms = await listDirectChannels();
        const normalized = dms.map((dm) => {
          const other = dm.members?.find((m) => m.id !== user.sub);
          return {
            id: dm.id,
            name: other?.displayName || dm.name || "Direct",
            isDirect: true,
            members: dm.members ?? [],
          } as ChannelWithUnread;
        });

        setChannels((prev) => mergeChannelsById(prev, normalized));
      } catch (e) {
        console.error("Failed to load DMs:", e);
      }
    })();
  }, [user]);

  // helpers
  const canSend = useMemo(
    () => Boolean(user?.sub && active && text.trim()),
    [user, active, text]
  );

  async function onCreateChannel() {
    if (!newChannel.trim()) return;
    try {
      setCreating(true);
      const c = await createChannel(newChannel.trim());
      setChannels((prev) => [...prev, c]);
      setActive(c.id);
      setNewChannel("");
    } finally {
      setCreating(false);
    }
  }

  async function handleSend(files: File[] = []) {
    if (!active) return;

    const trimmed = text.trim();
    const hasText = trimmed.length > 0;
    const hasFiles = files.length > 0;

    // Niets te versturen → stoppen
    if (!hasText && !hasFiles) return;

    try {
      const mentions = extractMentionUserIds(text, mentionCandidates);

      // 1) Upload alle files
      let attachments: Array<{
        url: string;
        fileName: string;
        mimeType: string;
        size: number;
      }> = [];

      if (files.length > 0) {
        const uploaded = await Promise.all(
          files.map((f) => uploadMessageFile(f))
        );

        attachments = uploaded.map((a) => ({
          url: a.url,
          fileName: a.fileName,
          mimeType: a.mimeType,
          size: a.size,
        }));
      }

      // 2) Message versturen via hook, NIET direct sendMessage
      await send(
        trimmed || undefined,
        replyTo?.id ?? undefined,
        mentions,
        attachments
      );

      setText("");
      setReplyTo(null);
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  }

  function startEdit(m: Message) {
    if (m.deletedAt) return;
    setEditingId(m.id);
    setEditText(m.content ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(channelId: string, messageId: string) {
    const t = editText.trim();
    if (!t) return;
    try {
      await edit(messageId, t);
      setEditingId(null);
      setEditText("");
    } catch (e) {
      console.error("Failed to save edit:", e);
    }
  }

  async function removeMessage(channelId: string, messageId: string) {
    if (!user) return;
    try {
      await remove(messageId, { id: user.sub, displayName: user.displayName });
    } catch (e) {
      console.error("Failed to delete message:", e);
    }
  }

  function handleReply(message: Message) {
    setReplyTo({
      id: message.id,
      authorName: message.author.displayName,
      content: message.content ?? null,
    });
  }

  function handleTypingInput(v: string) {
    setText(v);
    if (active && user) emitTyping(active);
  }

  function handleLogout() {
    logout();
    setUser(null);
    setActive(null);
    router.push("/login");
  }

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop <= 32 && !loadingOlder && hasMore) {
      loadOlder();
    }
  }

  async function openDM(otherUserId: string) {
    try {
      const dm = await getOrCreateDirectChannel(otherUserId);
      const other = dm.members?.find((m: any) => m.id !== user?.sub);
      const label = other?.displayName || dm.name || "Direct";
      setChannels((prev) =>
        prev.some((c) => c.id === dm.id)
          ? prev
          : [
              ...prev,
              {
                id: dm.id,
                name: label,
                isDirect: true,
                members: dm.members ?? [],
              } as ChannelWithUnread,
            ]
      );
      setActive(dm.id);
    } catch (e) {
      console.error("Failed to open DM:", e);
    }
  }

  async function handleAvatarFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatarUploading(true);
      const updated = await uploadAvatarFile(file);
      setUser(updated as Me);
    } catch (err) {
      console.error("Failed to upload avatar:", err);
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  async function handleRemoveAvatar() {
    try {
      const updated = await updateAvatar();
      setUser(updated as Me);
    } catch (err) {
      console.error("Failed to remove avatar:", err);
    }
  }

  if (!user) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <a href="/login" className="underline">
          Sign in
        </a>
      </div>
    );
  }

  const activeChannel = channels.find((c) => c.id === active);
  const regularChannels = channels.filter((c) => !c.isDirect);
  const dmChannels = channels.filter((c) => c.isDirect);

  // Presence info for active DM
  const dmPeer =
    activeChannel && activeChannel.isDirect && user
      ? (() => {
          const member = activeChannel.members?.find((m) => m.id !== user.sub);
          if (!member) return null;

          const onlineEntry = othersOnline.find((u) => u.id === member.id);
          const recent = recently.find((u) => u.id === member.id);

          let status: "online" | "idle" | "offline" = "offline";
          if (onlineEntry) {
            status = onlineEntry.status === "idle" ? "idle" : "online";
          } else if (recent) {
            status = "offline";
          }

          const statusText =
            status === "online"
              ? "Online"
              : status === "idle"
                ? "Idle"
                : recent
                  ? formatLastOnline(recent.lastSeen)
                  : "Offline";

          return {
            id: member.id,
            displayName: member.displayName,
            avatarUrl:
              member.avatarUrl ??
              onlineEntry?.avatarUrl ??
              recent?.avatarUrl ??
              null,
            isOnline: status === "online" || status === "idle",
            isIdle: status === "idle",
            statusText,
          };
        })()
      : null;

  const mentionCandidates: MentionCandidate[] =
    activeChannel?.members && activeChannel.members.length > 0
      ? activeChannel.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
        }))
      : [
          { id: user.sub, displayName: user.displayName },
          ...othersOnline.map((u) => ({
            id: u.id,
            displayName: u.displayName,
          })),
          ...recently.map((u) => ({
            id: u.id,
            displayName: u.displayName,
          })),
        ];

  return (
    <div className="h-dvh overflow-hidden flex flex-col">
      {/* header + avatar button */}
      <ChatHeader
        user={user}
        activeChannel={activeChannel}
        fileInputRef={fileInputRef}
        avatarUploading={avatarUploading}
        onAvatarChange={handleAvatarFileChange}
        onRemoveAvatar={handleRemoveAvatar}
        onLogout={handleLogout}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        dmPeer={dmPeer}
      />

      {/* Enable notifications button */}
      <div className="px-3 py-2 border-b bg-white">
        <button
          onClick={() => ensureNotificationPermission()}
          className="text-xs text-blue-600 underline"
        >
          Enable notifications
        </button>
      </div>

      {/* main layout */}
      <div className="flex-1 min-h-0 flex">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/30 z-10 md:hidden"
          />
        )}

        {/* Sidebar */}
        <div
          className={`
    ${sidebarOpen ? "fixed inset-y-0 left-0 z-20 w-64 bg-white block" : "hidden"}
    md:static md:block md:w-72 md:border-r
  `}
        >
          <Sidebar
            regularChannels={regularChannels}
            dmChannels={dmChannels}
            active={active}
            setActive={(id) => {
              setActive(id);
              setSidebarOpen(false);
            }}
            newChannel={newChannel}
            setNewChannel={setNewChannel}
            creating={creating}
            onCreateChannel={onCreateChannel}
            othersOnline={othersOnline}
            recently={recently}
            openDM={openDM}
            formatLastOnline={formatLastOnline}
            meId={user.sub}
          />
        </div>

        {/* Main */}
        <main className="flex-1 grid grid-rows-[auto_1fr_auto] min-h-0">
          {/* Search bar */}
          <div className="px-3 md:px-4 py-2 border-b bg-white">
            {active && (
              <ChannelSearch
                channelId={active}
                onJumpToMessage={(messageId) => {
                  setScrollToMessageId(messageId);
                }}
              />
            )}
          </div>

          {/* Messages */}
          <MessageList
            msgs={msgs}
            meId={user.sub}
            channelId={active!}
            listRef={listRef}
            editingId={editingId}
            editText={editText}
            setEditText={setEditText}
            onStartEdit={(m) => startEdit(m)}
            onSaveEdit={(m) => active && saveEdit(active, m.id)}
            onCancelEdit={cancelEdit}
            onDelete={(m) => active && removeMessage(active, m.id)}
            onReply={(m) => handleReply(m)}
            formatDateTime={formatDateTime}
            onScroll={handleScroll}
            isDirect={activeChannel?.isDirect ?? false}
            lastReadMessageIdByOthers={lastReadMessageIdByOthers}
            scrollToMessageId={scrollToMessageId}
            onScrolledToMessage={() => setScrollToMessageId(null)}
          />

          {/* Typing indicator */}
          {typingLabel && (
            <div className="px-3 md:px-4 py-1 text-sm text-gray-600 shrink-0 bg-white border-t">
              {typingLabel}
            </div>
          )}

          {/* Composer */}
          <Composer
            value={text}
            onChange={handleTypingInput}
            onSend={handleSend}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            mentionCandidates={mentionCandidates}
          />
        </main>
      </div>
    </div>
  );
}
