// lib/socket.ts
import { io, type Socket } from "socket.io-client";

const TOKEN_KEY = "accessToken";
let socket: Socket | null = null;

// Get token from sessionStorage (per-tab, not shared like localStorage)
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

// Build a new socket.io connection instance
function buildSocket(): Socket {
  const url =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://localhost:3000";

  // Important:
  // - No extra Authorization header (prevents session leaking between tabs)
  // - auth.token should be the raw JWT (no "Bearer " prefix)
  return io(url, {
    transports: ["websocket"],
    autoConnect: false,
    auth: { token: getToken() || "" },
  });
}

// Retrieve or create the socket instance
export function getSocket(): Socket {
  if (socket) return socket;

  const t = getToken();
  if (!t) throw new Error("Socket requested before token is available");

  socket = buildSocket();

  // Make sure the latest token is applied before connecting
  socket.auth = { token: t };
  socket.connect();

  // Log connection errors for debugging
  socket.on("connect_error", (err) => {
    console.warn("[socket] connect_error:", err?.message);
  });

  socket.on("disconnect", (reason) => {});

  // Always update auth token before automatic reconnects
  socket.io.on("reconnect_attempt", () => {
    socket!.auth = { token: getToken() || "" };
  });

  return socket;
}

/**
 * Call this after login, logout, or token refresh.
 * - Disconnects the existing socket so React hooks can re-register listeners.
 * - Token storage (sessionStorage) is managed in api.ts:setToken.
 */
export function refreshSocketAuth(_newToken: string | null) {
  if (socket) {
    try {
      socket.off(); // remove all listeners
      socket.disconnect(); // close the current connection
    } catch {}
    socket = null;
  }
  // No token writing here; api.ts handles that.
}
