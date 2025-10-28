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
} from "@/lib/api";
import { getSocket } from "@/lib/socket";

type Channel = { id: string; name: string };
type Message = {
  id: string;
  content: string | null;
  authorId: string;
  createdAt: string;
  author: { id: string; displayName: string };
};
type Me = { sub: string; email: string; displayName: string };
type OnlineUser = { id: string; displayName: string };

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
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
      const cs = await listChannels();
      if (!cs || cs.length === 0) {
        const c = await createChannel("general");
        setChannels([c]);
        setActive(c.id);
        return;
      }
      setChannels(cs);
      if (cs[0]) setActive(cs[0].id);
    })();
  }, []);

  // Load messages for active channel
  useEffect(() => {
    if (!active) return;
    listMessages(active).then((ms) => setMsgs(ms.reverse()));
  }, [active]);

  // Realtime: messages
  useEffect(() => {
    // wait for user (token) and catch missing token
    if (!active || !user) return;
    let s;
    try {
      s = getSocket();
    } catch {
      return; // no token yet, try again later
    }

    const onCreated = (payload: any) => {
      if (payload?.channelId !== active) return;

      const authorId = payload.author?.id ?? payload.authorId ?? "unknown";
      const displayName =
        payload.author?.displayName ?? payload.authorDisplayName ?? "Someone";
      const createdAt =
        typeof payload.createdAt === "string"
          ? payload.createdAt
          : new Date().toISOString();

      setMsgs((prev) => [
        ...prev,
        {
          id: payload.id ?? Math.random().toString(36),
          content: payload.content ?? "",
          authorId,
          createdAt,
          author: { id: authorId, displayName },
        },
      ]);
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
    // start when user/token is available
    if (!user) return;
    let s;
    try {
      s = getSocket();
    } catch {
      return;
    }

    const onSnapshot = (p: { online: OnlineUser[] }) => {
      setOnline(p.online ?? []);
    };

    const onUpdate = (p: { user: OnlineUser; isOnline: boolean }) => {
      setOnline((prev) => {
        const exists = prev.some((u) => u.id === p.user.id);
        if (p.isOnline && !exists) return [...prev, p.user];
        if (!p.isOnline && exists)
          return prev.filter((u) => u.id !== p.user.id);
        return prev;
      });
    };

    s.on("presence.snapshot", onSnapshot);
    s.on("presence.update", onUpdate);

    return () => {
      s.off("presence.snapshot", onSnapshot);
      s.off("presence.update", onUpdate);
    };
  }, [user]); // listen again once user is available

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

  return (
    <div className="grid grid-rows-[48px_1fr] min-h-dvh">
      {/* Top bar */}
      <header className="border-b px-3 flex items-center justify-between">
        <div className="font-medium">Chat</div>
        <button className="text-sm underline" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <div className="grid grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="border-r p-3 space-y-4">
          <div>
            <h2 className="font-semibold">Channels</h2>
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
                className="border rounded flex-1 p-2"
                placeholder="New channel…"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                disabled={creating}
              />
              <button
                className="border rounded px-3"
                disabled={creating || !newChannel.trim()}
              >
                Add
              </button>
            </form>

            <div className="mt-2 space-y-1">
              {channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className={`block w-full text-left px-2 py-1 rounded ${active === c.id ? "bg-gray-200" : "hover:bg-gray-100"}`}
                >
                  #{c.name}
                </button>
              ))}
            </div>
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
                    <span>{u.displayName}</span>
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
                <div className="text-sm text-gray-500">
                  {m.author.displayName} •{" "}
                  {new Date(m.createdAt).toLocaleTimeString()}
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
