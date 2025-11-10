"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  me,
  logout,
  createChannel,
  listDirectChannels,
  listChannelsWithUnread,
  getOrCreateDirectChannel,
} from "@/lib/api";

import type { ChannelWithUnread, Message, Me } from "./types";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";
import { Sidebar } from "./components/Sidebar";
import { useMessages } from "./hooks/useMessages";
import { useTyping } from "./hooks/useTyping";
import { usePresence } from "./hooks/usePresence";
import { useUnread } from "./hooks/useUnread";

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
  const { msgs, listRef, send, edit, remove } = useMessages(active, user?.sub, {
    resolveDisplayName,
  });
  const {
    typing,
    label: typingLabel,
    emitTyping,
  } = useTyping(active, user?.sub);
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
            members: dm.members ?? [], // keep members to resolve display names
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
                members: dm.members ?? [], // keep members here too
              },
            ]
      );
      setActive(dm.id);
    } catch (e) {
      console.error("Failed to open DM:", e);
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
    <div className="h-dvh overflow-hidden grid grid-rows-[48px_1fr]">
      <header className="sticky top-0 z-10 border-b bg-gray-50 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold">
          {activeChannel?.isDirect ? (
            <>
              <span aria-hidden>💬</span>
              <span>
                Direct message with {activeChannel?.name ?? "Unknown"}
              </span>
            </>
          ) : (
            <>
              <span aria-hidden>#</span>
              <span>{activeChannel?.name ?? "Chat"}</span>
            </>
          )}
        </div>
        <button
          className="text-sm text-gray-600 hover:text-red-600 underline-offset-2 hover:underline"
          onClick={handleLogout}
        >
          Logout
        </button>
      </header>

      <div className="grid grid-cols-[280px_1fr] min-h-0">
        <Sidebar
          regularChannels={regularChannels}
          dmChannels={dmChannels}
          active={active}
          setActive={(id) => setActive(id)}
          newChannel={newChannel}
          setNewChannel={setNewChannel}
          creating={creating}
          onCreateChannel={onCreateChannel}
          othersOnline={othersOnline}
          recently={recently}
          openDM={openDM}
          formatLastOnline={formatLastOnline}
        />

        <main className="grid grid-rows-[1fr_auto] min-h-0">
          <MessageList
            msgs={msgs}
            meId={user.sub}
            listRef={listRef}
            editingId={editingId}
            editText={editText}
            setEditText={setEditText}
            onStartEdit={(m) => startEdit(m)}
            onSaveEdit={(m) => active && saveEdit(active, m.id)}
            onCancelEdit={cancelEdit}
            onDelete={(m) => active && removeMessage(active, m.id)}
            formatDateTime={(iso) => {
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
            }}
          />

          {typingLabel && (
            <div className="px-4 py-1 text-sm text-gray-600 shrink-0 bg-white border-t">
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
