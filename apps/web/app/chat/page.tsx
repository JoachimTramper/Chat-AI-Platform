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
} from "@/lib/api";

import type { ChannelWithUnread, Message, Me } from "./types";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";
import { Sidebar } from "./components/Sidebar";
import { useMessages } from "./hooks/useMessages";
import { useTyping } from "./hooks/useTyping";
import { usePresence } from "./hooks/usePresence";
import { useUnread } from "./hooks/useUnread";
import { Avatar } from "./components/Avatar";

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
          setChannels(mergeById([], next));
          setActive(next[0]?.id ?? c.id);
          return;
        }
        setChannels(mergeById([], items));
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
          };
        });
        setChannels((prev) => {
          const ids = new Set(prev.map((c) => c.id));
          return [...prev, ...normalized.filter((n) => !ids.has(n.id))];
        });
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

  const formatLastOnline = (d?: string | null) => {
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
  };

  const formatDateTime = (iso: string) => {
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
  };

  function mergeById(prev: ChannelWithUnread[], next: ChannelWithUnread[]) {
    const byId = new Map(prev.map((x) => [x.id, x]));
    for (const it of next) {
      const old = byId.get(it.id);
      byId.set(it.id, old ? { ...old, ...it } : it);
    }
    return Array.from(byId.values());
  }

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

  async function handleSend() {
    if (!canSend || !active) return;
    try {
      await send(text.trim());
      setText("");
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
              },
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

  return (
    <div className="h-dvh overflow-hidden flex flex-col">
      {/* header + avatar button */}
      <header className="border-b bg-gray-50 px-3 md:px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold min-w-0">
          {/* mobile menu-button */}
          <button
            type="button"
            className="md:hidden mr-1 text-xl"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>

          {activeChannel?.isDirect ? (
            <>
              <span aria-hidden className="hidden sm:inline">
                💬
              </span>
              <span className="truncate max-w-[60vw] md:max-w-none">
                Direct message with {activeChannel?.name ?? "Unknown"}
              </span>
            </>
          ) : (
            <>
              <span aria-hidden className="hidden sm:inline">
                #
              </span>
              <span className="truncate max-w-[60vw] md:max-w-none">
                {activeChannel?.name ?? "Chat"}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-gray-100"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
          >
            <Avatar
              name={user.displayName}
              avatarUrl={user.avatarUrl}
              size={28}
            />
            <span className="hidden sm:inline text-sm text-gray-700">
              {avatarUploading ? "Uploading..." : user.displayName}
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFileChange}
          />

          <button
            type="button"
            className="text-xs text-gray-500 hover:underline"
            onClick={handleRemoveAvatar}
          >
            Remove avatar
          </button>

          <button
            className="text-sm text-gray-600 hover:text-red-600 underline-offset-2 hover:underline"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

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
              setSidebarOpen(false); // close when selecting channel on mobile
            }}
            newChannel={newChannel}
            setNewChannel={setNewChannel}
            creating={creating}
            onCreateChannel={onCreateChannel}
            othersOnline={othersOnline}
            recently={recently}
            openDM={openDM}
            formatLastOnline={formatLastOnline}
          />
        </div>

        {/* Main */}
        <main className="flex-1 grid grid-rows-[1fr_auto] min-h-0">
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
            formatDateTime={formatDateTime}
            onScroll={handleScroll}
            isDirect={activeChannel?.isDirect ?? false}
            lastReadMessageIdByOthers={lastReadMessageIdByOthers}
          />

          {typingLabel && (
            <div className="px-3 md:px-4 py-1 text-sm text-gray-600 shrink-0 bg-white border-t">
              {typingLabel}
            </div>
          )}

          <Composer
            value={text}
            onChange={handleTypingInput}
            onSend={handleSend}
          />
        </main>
      </div>
    </div>
  );
}
