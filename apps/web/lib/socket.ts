// lib/socket.ts
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function buildSocket(token: string) {
  const url =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://localhost:3000";

  return io(url, {
    transports: ["websocket"],
    autoConnect: false,
    auth: { token: `Bearer ${token}` },
    extraHeaders: { Authorization: `Bearer ${token}` }, // fallback
  });
}

export function getSocket(): Socket {
  if (!socket) {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken") || ""
        : "";
    if (!token) throw new Error("Socket requested before token is available");
    socket = buildSocket(token);
    socket.connect();

    socket.on("connect_error", (err) =>
      console.warn("[socket] connect_error:", err.message)
    );
    socket.on("disconnect", (reason) =>
      console.log("[socket] disconnect:", reason)
    );
  }
  return socket;
}

// call when token changes (login / logout / refresh)
export function refreshSocketAuth(newToken: string | null) {
  if (socket) {
    try {
      socket.off(); // release listeners, React hooks will re-register them
      socket.disconnect();
    } catch {}
    socket = null;
  }
  if (newToken) localStorage.setItem("accessToken", newToken);
  else localStorage.removeItem("accessToken");
}
