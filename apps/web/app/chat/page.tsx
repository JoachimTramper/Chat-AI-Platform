"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listChannels,
  listMessages,
  me,
  sendMessage,
  logout,
  createChannel,
  listDirectChannels,
  markChannelRead,
  listChannelsWithUnread,
} from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { getOrCreateDirectChannel } from "@/lib/api";
import { MessageCircle } from "lucide-react";

type Channel = {
  id: string;
  name: string;
  isDirect?: boolean;
  members?: Array<{ id: string; displayName: string }>;
};
type Message = {
  id: string;
  content: string | null;
  authorId: string;
  createdAt: string;
  author: { id: string; displayName: string };
};
type Me = { sub: string; email: string; displayName: string };
type OnlineUser = { id: string; displayName: string; lastSeen?: string | null };
type ChannelWithUnread = Channel & { unread?: number };

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [channels, setChannels] = useState<ChannelWithUnread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [creating, setCreating] = useState(false);

  // typing: userId -> { name, ts }
  const [typing, setTyping] = useState<
    Record<string, { name: string; ts: number }>
  >({});
  // presence: list of online users
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [recently, setRecently] = useState<OnlineUser[]>([]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth guard
  useEffect(() => {
    me()
      .then((u) => setUser(u as Me))
      .catch(() => {
        setUser(null);
        router.replace("/login");
      });
  }, [router]);

  // Load channels (create "general" if none)
  useEffect(() => {
    (async () => {
      try {
        const items = await listChannelsWithUnread();

        if (!items || items.length === 0) {
          const c = await createChannel("general");
          const next = await listChannelsWithUnread();

          setChannels((prev) => {
            const byId = new Map(prev.map((x) => [x.id, x]));
            for (const it of next) {
              const old = byId.get(it.id);
              byId.set(it.id, old ? { ...old, ...it } : it);
            }
            return Array.from(byId.values());
          });

          setActive(next[0]?.id ?? c.id);
          return;
        }

        setChannels((prev) => {
          const byId = new Map(prev.map((x) => [x.id, x]));
          for (const it of items) {
            const old = byId.get(it.id);
            byId.set(it.id, old ? { ...old, ...it } : it);
          }
          return Array.from(byId.values());
        });

        setActive(items[0]?.id ?? null);
      } catch (e) {
        console.error("Failed to load channels with unread:", e);
      }
    })();
  }, []);

  // Load messages for active channel
  useEffect(() => {
    if (!active || !user) return;
    (async () => {
      try {
        const ms = await listMessages(active);
        setMsgs(ms.reverse());
        await markChannelRead(active);
        // reset unread in UI
        setChannels((prev) =>
          prev.map((c) => (c.id === active ? { ...c, unread: 0 } : c))
        );
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    })();
  }, [active, user]);

  // Realtime: messages
  useEffect(() => {
    if (!user) return;
    let s;
    try {
      s = getSocket();
    } catch {
      return;
    }

    const onCreated = (payload: any) => {
      const channelId =
        payload?.channelId ?? payload?.channel?.id ?? payload?.channel_id;

      const authorId =
        payload?.author?.id ?? payload?.authorId ?? payload?.userId;

      if (!channelId) return;

      // Active channel: show message and keep unread at 0
      if (channelId === active) {
        const displayName =
          payload?.author?.displayName ??
          payload?.authorDisplayName ??
          "Someone";
        const createdAt =
          typeof payload?.createdAt === "string"
            ? payload.createdAt
            : (payload?.created_at ?? new Date().toISOString());

        setMsgs((prev) => [
          ...prev,
          {
            id: payload.id ?? Math.random().toString(36),
            content: payload.content ?? "",
            authorId: authorId ?? "unknown",
            createdAt,
            author: { id: authorId ?? "unknown", displayName },
          },
        ]);

        setChannels((prev) =>
          prev.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c))
        );
        return;
      }

      // Other channel: unread++ (unless it's my own message)
      if (authorId !== user.sub) {
        setChannels((prev) => {
          const exists = prev.some((c) => c.id === channelId);
          if (!exists) {
            // Directly visible with unread: 1 (placeholder)
            return [
              ...prev,
              {
                id: channelId,
                name:
                  payload?.channel?.name ??
                  payload?.author?.displayName ??
                  "Direct",
                isDirect: !!(payload?.channel?.isDirect ?? payload?.isDirect),
                unread: 1,
              },
            ];
          }
          return prev.map((c) =>
            c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
          );
        });
      }
    };

    s.on("message.created", onCreated);
    return () => {
      s.off("message.created", onCreated);
    };
  }, [active, user]);

  // Realtime: typing (store names + timestamps)
  useEffect(() => {
    if (!active || !user) return;
    let s;
    try {
      s = getSocket();
    } catch {
      return;
    }

    const onTyping = (p: {
      channelId: string;
      userId: string;
      displayName: string;
      isTyping: boolean;
    }) => {
      if (p.channelId !== active) return;
      if (p.userId === user.sub) return; // ignore self

      setTyping((prev) => {
        const next = { ...prev };
        if (p.isTyping) {
          next[p.userId] = { name: p.displayName, ts: Date.now() };
        } else {
          delete next[p.userId];
        }
        return next;
      });
    };

    s.on("typing", onTyping);

    // Auto-expire after ~3s without updates
    const interval = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        const next: Record<string, { name: string; ts: number }> = {};
        for (const [uid, info] of Object.entries(prev)) {
          if (now - info.ts < 3000) next[uid] = info;
        }
        return next;
      });
    }, 1000);

    return () => {
      s.off("typing", onTyping);
      clearInterval(interval);
    };
  }, [active, user]);

  // Realtime: presence (snapshot + updates)
  useEffect(() => {
    if (!user) return;
    let s;
    try {
      s = getSocket();
    } catch {
      return;
    }

    const onSnapshot = (p: {
      online: OnlineUser[];
      recently?: OnlineUser[];
    }) => {
      setOnline(p.online ?? []);
      setRecently(p.recently ?? []);
    };

    const onUpdate = (p: { user: OnlineUser; isOnline: boolean }) => {
      // online list update
      setOnline((prev) => {
        const exists = prev.some((u) => u.id === p.user.id);
        if (p.isOnline) {
          if (!exists) return [...prev, p.user];
          return prev.map((u) => (u.id === p.user.id ? p.user : u));
        } else {
          return prev.filter((u) => u.id !== p.user.id);
        }
      });
      // recently list update
      setRecently((prev) => {
        if (p.isOnline) {
          // became online -> remove from recently
          return prev.filter((u) => u.id !== p.user.id);
        } else {
          // became offline -> insert/sort by lastSeen desc
          const others = prev.filter((u) => u.id !== p.user.id);
          const next = [p.user, ...others];
          return next
            .sort(
              (a, b) =>
                new Date(b.lastSeen || 0).getTime() -
                new Date(a.lastSeen || 0).getTime()
            )
            .slice(0, 20);
        }
      });
    };

    s.on("presence.snapshot", onSnapshot);
    s.on("presence.update", onUpdate);
    return () => {
      s.off("presence.snapshot", onSnapshot);
      s.off("presence.update", onUpdate);
    };
  }, [user]);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [msgs]);

  const canSend = useMemo(
    () => Boolean(user?.sub && active && text.trim()),
    [user, active, text]
  );

  // Load Direct Message channels and merge into channels list
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

  async function handleSend() {
    if (!canSend) return;
    try {
      await sendMessage(active!, text.trim()); // auteur via JWT
      setText("");
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  }

  // Emit typing with debounce
  function handleTypingInput(v: string) {
    setText(v);
    if (!active || !user) return;

    let s;
    try {
      s = getSocket(); // try/catch, so there's no error if token missing
    } catch {
      return;
    }

    s.emit("typing", { channelId: active, isTyping: true });

    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => {
      try {
        s.emit("typing", { channelId: active, isTyping: false });
      } catch {}
    }, 1500);
  }

  function formatLastOnline(d?: string | null) {
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

  function formatDateTime(iso: string) {
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

  function handleLogout() {
    try {
      getSocket().disconnect();
    } catch {}
    logout(); // makes sure that socket auth is also cleared
    setMsgs([]);
    setUser(null);
    setActive(null);
    router.push("/login");
  }

  async function openDM(otherUserId: string) {
    try {
      const dm = await getOrCreateDirectChannel(otherUserId);
      const other = dm.members?.find((m: any) => m.id !== user?.sub);
      const label = other?.displayName || dm.name || "Direct";

      setChannels((prev) => {
        if (prev.some((c) => c.id === dm.id)) return prev;
        return [...prev, { id: dm.id, name: label, isDirect: true }];
      });
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

  // Typing label
  const typingNames = Object.values(typing).map((t) => t.name);
  let typingLabel = "";
  if (typingNames.length === 1) typingLabel = `${typingNames[0]} is typing…`;
  else if (typingNames.length === 2)
    typingLabel = `${typingNames[0]} and ${typingNames[1]} are typing…`;
  else if (typingNames.length >= 3)
    typingLabel = `${typingNames[0]}, ${typingNames[1]} and others are typing…`;

  const othersOnline = online.filter((u) => u.id !== user.sub);

  const activeChannel = channels.find((c) => c.id === active);
  const headerTitle = activeChannel
    ? activeChannel.isDirect
      ? `Direct with ${activeChannel.name}`
      : `#${activeChannel.name}`
    : "Chat";

  const regularChannels: ChannelWithUnread[] = channels.filter(
    (c) => !c.isDirect
  );

  const dmChannels: ChannelWithUnread[] = channels.filter((c) => c.isDirect);

  return (
    <div className="grid grid-rows-[48px_1fr] min-h-dvh">
      {/* Top bar */}
      <header className="border-b bg-gray-50 px-4 py-2 flex items-center justify-between">
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

      <div className="grid grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="border-r p-3 space-y-4">
          <div className="space-y-6">
            {/* Channels header + add form */}
            <section>
              <h2 className="font-semibold text-xs uppercase tracking-wide text-gray-500">
                Channels
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newChannel.trim()) return;
                  (async () => {
                    try {
                      setCreating(true);
                      const c = await createChannel(newChannel.trim());
                      setChannels((prev) => [...prev, c]);
                      setActive(c.id);
                      setNewChannel("");
                    } finally {
                      setCreating(false);
                    }
                  })();
                }}
                className="mt-2 flex gap-2"
              >
                <input
                  className="border rounded flex-1 px-2 py-1 text-sm"
                  placeholder="New channel…"
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                  disabled={creating}
                />
                <button
                  className="border rounded px-3 text-sm hover:bg-gray-50 disabled:opacity-50"
                  disabled={creating || !newChannel.trim()}
                >
                  Add
                </button>
              </form>

              {/* Regular channels */}
              <div className="mt-2 space-y-1">
                {regularChannels.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActive(c.id)}
                    className={`flex items-center justify-between w-full text-left px-2 py-1 rounded text-sm border
      ${
        active === c.id
          ? "bg-blue-50 text-blue-700 border-blue-200 font-medium"
          : "hover:bg-gray-100 border-transparent"
      }`}
                  >
                    <span>#{c.name}</span>
                    {(c.unread ?? 0) > 0 && (
                      <span
                        className="ml-auto inline-flex items-center justify-center rounded-full
               bg-blue-500 text-white text-[10px] font-semibold
               min-w-4 h-4 px-[5px] leading-none shadow-sm"
                      >
                        {c.unread}
                      </span>
                    )}
                  </button>
                ))}

                {regularChannels.length === 0 && (
                  <div className="text-sm text-gray-500 mt-1">
                    No channels yet
                  </div>
                )}
              </div>
            </section>

            {/* Direct Messages */}
            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wide text-gray-500">
                Direct Messages
              </h3>
              <div className="mt-2 space-y-1">
                {dmChannels.length === 0 ? (
                  <div className="text-sm text-gray-500">No DMs yet</div>
                ) : (
                  dmChannels.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActive(c.id)}
                      className={`flex items-center justify-between w-full text-left px-2 py-1 rounded text-sm border
    ${
      active === c.id
        ? "bg-blue-50 text-blue-700 border-blue-200 font-medium"
        : "hover:bg-gray-100 border-transparent"
    }`}
                    >
                      <span>💬 {c.name}</span>
                      {(c.unread ?? 0) > 0 && (
                        <span
                          className="ml-auto inline-flex items-center justify-center rounded-full
               bg-blue-500 text-white text-[10px] font-semibold
               min-w-4 h-4 px-[5px] leading-none shadow-sm"
                        >
                          {c.unread}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Online users */}
          <div>
            <h3 className="font-semibold">Online ({othersOnline.length})</h3>
            <div className="mt-1 space-y-1">
              {othersOnline.length === 0 ? (
                <div className="text-sm text-gray-500">No one else online</div>
              ) : (
                othersOnline.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 text-sm">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    <span className="flex items-center gap-2">
                      {u.displayName}
                      <button
                        className="p-1 text-gray-500 hover:text-blue-500"
                        onClick={() => openDM(u.id)}
                        title={`Message ${u.displayName}`}
                        aria-label={`Message ${u.displayName}`}
                      >
                        <MessageCircle size={16} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Offline users */}
          <div className="mt-6">
            <h3 className="font-semibold">Offline ({recently.length})</h3>
            <div className="mt-1 space-y-2">
              {recently.length === 0 ? (
                <div className="text-sm text-gray-500">No offline users</div>
              ) : (
                recently
                  .filter((u) => u.id !== user.sub)
                  .map((u) => (
                    <div
                      key={u.id}
                      className="text-sm border-b border-gray-100 pb-1 last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                          <span className="font-medium">{u.displayName}</span>
                        </div>
                        <button
                          className="p-1 text-gray-400 hover:text-blue-500"
                          title={`Message ${u.displayName}`}
                          onClick={() => openDM(u.id)}
                        >
                          <MessageCircle size={16} />
                        </button>
                      </div>
                      <div className="ml-4 text-xs text-gray-500">
                        {formatLastOnline(u.lastSeen)}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex flex-col">
          <div className="flex-1 overflow-auto p-4 space-y-3" ref={listRef}>
            {msgs.map((m) => (
              <div key={m.id}>
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">
                    {m.author.displayName}
                  </span>
                  {" • "}
                  <time dateTime={m.createdAt}>
                    {formatDateTime(m.createdAt)}
                  </time>
                </div>
                <div>{m.content}</div>
              </div>
            ))}
          </div>

          {/* Typing indicator */}
          {typingLabel && (
            <div className="px-4 py-1 text-sm text-gray-600">{typingLabel}</div>
          )}

          <div className="border-t p-3 flex gap-2">
            <input
              className="border rounded flex-1 p-2"
              placeholder="Type a message…"
              value={text}
              onChange={(e) => handleTypingInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button
              className="border rounded px-4"
              disabled={!canSend}
              onClick={handleSend}
            >
              Send
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
