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
import { TypingIndicator } from "./components/TypingIndicator";
import { SearchModal } from "./components/SearchModal";
import { MobileChatTitleBubble } from "./components/MobileChatTitleBubble";

import { useMessages } from "./hooks/useMessages";
import { useTyping } from "./hooks/useTyping";
import { usePresence } from "./hooks/usePresence";
import { useUnread } from "./hooks/useUnread";
import { useMobileSidebar } from "./hooks/useMobileSidebar";
import { useDmPeer } from "./hooks/useDmPeer";
import { useMentionCandidates } from "./hooks/useMentionCandidates";

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
  const [searchOpen, setSearchOpen] = useState(false);

  useMobileSidebar(sidebarOpen, setSidebarOpen);

  // auth guard
  useEffect(() => {
    me()
      .then((u) => setUser(u as Me))
      .catch(() => {
        setUser(null);
        router.replace("/login");
      });
  }, [router]);

  // initial channels + active (read-only)
  useEffect(() => {
    (async () => {
      try {
        const items = await listChannelsWithUnread();
        setChannels(mergeChannelsById([], items ?? []));
        setActive(items?.[0]?.id ?? null);
      } catch (e) {
        console.error("Failed to load channels with unread:", e);
      }
    })();
  }, []);

  const activeChannel = channels.find((c) => c.id === active);

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
    retrySend,
  } = useMessages(active, user?.sub, {
    lastReadSnapshot: activeChannel?.lastRead ?? null,
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

  // keep bottom in view when viewport changes (e.g. mobile keyboard opens)
  useEffect(() => {
    const handleResize = () => {
      const el = listRef.current;
      if (!el) return;

      // scroll to bottom when the viewport changes
      el.scrollTop = el.scrollHeight;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [listRef]);

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

  const regularChannels = channels.filter((c) => !c.isDirect);
  const dmChannels = channels.filter((c) => c.isDirect);

  const dmPeer = useDmPeer({
    activeChannel,
    myId: user?.sub,
    othersOnline,
    recently,
  });

  const mentionCandidates = useMentionCandidates({
    activeChannel,
    user,
    othersOnline,
    recently,
  });

  if (!user) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <a href="/login" className="underline">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col">
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
        onEnableNotifications={() => ensureNotificationPermission()}
        onOpenSearch={() => setSearchOpen(true)}
      />
      {/* main layout */}
      <div className="flex-1 min-h-0 flex relative md:bg-neutral-200">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={`
            absolute inset-y-0 left-0 z-50 w-64 bg-neutral-200
            transform transition-transform duration-200 ease-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            md:static md:translate-x-0 md:w-72 md:bg-neutral-200 md:h-full md:block
            border-r border-neutral-300/50 md:border-r-0
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
            isAdmin={user.role === "ADMIN"}
          />
        </div>

        {/* Main */}
        <main
          className="
            flex-1 flex flex-col min-h-0 min-w-0
            bg-[url('/BackgroundMessages.png')]
            bg-repeat
            bg-[length:350px_350px]

            md:rounded-tl-2xl
            md:border md:border-neutral-300
            md:overflow-hidden
            md:relative md:z-10

            md:shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]
          "
        >
          {/* Scroll area (messages) */}
          <div className="flex-1 min-h-0 relative">
            {/* MOBILE ONLY: overlay title bubble */}
            <div className="md:hidden absolute top-0 left-0 right-0 z-30">
              <MobileChatTitleBubble
                activeChannel={activeChannel}
                dmPeer={dmPeer}
              />
            </div>
            {/* Messages scroll behind it */}
            <div className="h-full pt-16 md:pt-0 flex flex-col">
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
                loadingOlder={loadingOlder}
                onRetrySend={retrySend}
              />
            </div>
          </div>
          {/* Sticky footer: typing + composer */}
          <div className="sticky bottom-0 z-20">
            <TypingIndicator label={typingLabel} />
            <Composer
              value={text}
              onChange={handleTypingInput}
              onSend={handleSend}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              mentionCandidates={mentionCandidates}
            />
          </div>
        </main>
      </div>
      {/* Search modal */}
      <SearchModal
        open={searchOpen}
        channelId={active}
        activeChannel={activeChannel}
        dmPeerName={dmPeer?.displayName ?? null}
        onClose={() => setSearchOpen(false)}
        onJumpToMessage={(messageId) => {
          setSearchOpen(false);
          setScrollToMessageId(messageId);
        }}
      />
    </div>
  );
}
