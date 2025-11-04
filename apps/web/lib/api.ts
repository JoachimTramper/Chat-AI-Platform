import axios from "axios";
import { refreshSocketAuth } from "@/lib/socket";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000",
});

const TOKEN_KEY = "accessToken";

// Helpers
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  api.defaults.headers.common.Authorization = token ? `Bearer ${token}` : "";

  // update socket auth
  refreshSocketAuth(token);
}

export function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

// init on load
if (typeof window !== "undefined") {
  const t = getToken();
  if (t) api.defaults.headers.common.Authorization = `Bearer ${t}`;
}

// --- Axios interceptor (always attach latest token) ---
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Axios interceptor (auto logout at 401) ---
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      setToken(null);
    }
    return Promise.reject(err);
  }
);

// ---- Auth ----
export async function register(
  email: string,
  password: string,
  displayName: string
) {
  const { data } = await api.post("/auth/register", {
    email,
    password,
    displayName,
  });
  setToken(data.accessToken);
  return data;
}

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  setToken(data.accessToken);
  return data;
}

export async function me() {
  const { data } = await api.get("/auth/me");
  return data as { sub: string; email: string; displayName: string };
}

export function logout() {
  setToken(null);
}

// ---- Channels & Messages ----
export async function listChannels() {
  const { data } = await api.get("/channels");
  return data as Array<{ id: string; name: string }>;
}

export async function createChannel(name: string) {
  const { data } = await api.post("/channels", { name });
  return data as { id: string; name: string };
}

export async function listMessages(channelId: string) {
  const { data } = await api.get(`/channels/${channelId}/messages`);
  return data as Array<{
    id: string;
    content: string | null;
    authorId: string;
    createdAt: string;
    author: { id: string; displayName: string };
  }>;
}

export async function sendMessage(channelId: string, content?: string) {
  const { data } = await api.post(`/channels/${channelId}/messages`, {
    content,
  });
  return data;
}

// ---- Direct Messages ----
export async function listDirectChannels() {
  const { data } = await api.get("/channels/direct");
  return data as Array<{
    id: string;
    name: string;
    isDirect: boolean;
    members: { id: string; displayName: string }[];
  }>;
}

export async function getOrCreateDirectChannel(userId: string) {
  const { data } = await api.get(`/channels/direct/${userId}`);
  return data as {
    id: string;
    name: string;
    members: { id: string; displayName: string }[];
  };
}

// Mark a channel as read
export async function markChannelRead(channelId: string) {
  const { data } = await api.post(`/channels/${channelId}/read`);
  return data;
}

// Get channels with unread counts
export async function listChannelsWithUnread() {
  const { data } = await api.get(`/channels/with-unread`);
  return data as Array<{
    id: string;
    name: string;
    isDirect: boolean;
    unread: number;
  }>;
}
