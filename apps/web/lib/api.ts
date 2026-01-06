// lib/api.ts
import axios from "axios";
import { refreshSocketAuth } from "@/lib/socket";
import type { Message } from "@/app/chat/types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000",
});

const TOKEN_KEY = "accessToken";
let CURRENT_TOKEN: string | null = null; // per-tab in-memory cache

// ---- Token helpers ----
export function setToken(token: string | null) {
  CURRENT_TOKEN = token;
  if (typeof window !== "undefined") {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  }
  api.defaults.headers.common.Authorization = token ? `Bearer ${token}` : "";
  // keep socket auth in sync
  refreshSocketAuth(token);
}

export function getToken() {
  if (CURRENT_TOKEN) return CURRENT_TOKEN;
  if (typeof window !== "undefined") {
    CURRENT_TOKEN = sessionStorage.getItem(TOKEN_KEY);
    return CURRENT_TOKEN;
  }
  return null;
}

// init on load (hydrate default header)
if (typeof window !== "undefined") {
  const t = getToken();
  if (t) api.defaults.headers.common.Authorization = `Bearer ${t}`;
}

// ---- Interceptors ----
// Always attach latest token (belt)
api.interceptors.request.use((config) => {
  const token = CURRENT_TOKEN ?? getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto logout on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) setToken(null);
    return Promise.reject(err);
  }
);

// ---- Auth ----
export async function register(
  email: string,
  password: string,
  displayName: string,
  inviteCode?: string
) {
  const { data } = await api.post("/auth/register", {
    email,
    password,
    displayName,
    inviteCode: inviteCode?.trim() || undefined,
  });
  setToken(data.accessToken);
  return data;
}

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  setToken(data.accessToken);
  return data;
}

export type MeResponse = {
  sub: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  role: "USER" | "ADMIN";

  bot?: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
};

export async function me() {
  const { data } = await api.get("/auth/me");
  return data as MeResponse;
}

export async function updateAvatar() {
  const token = getToken();

  const { data } = await api.patch(
    "/auth/me/avatar",
    undefined,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  );

  return data as MeResponse;
}

export async function uploadAvatarFile(file: File) {
  const form = new FormData();
  form.append("file", file);

  const { data } = await api.post("/auth/me/avatar/upload", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data as MeResponse;
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

export async function listMessages(
  channelId: string,
  opts?: { take?: number; cursor?: string }
): Promise<Message[]> {
  const params = new URLSearchParams();
  if (opts?.take) params.set("take", String(opts.take));
  if (opts?.cursor) params.set("cursor", opts.cursor);

  const qs = params.toString();
  const { data } = await api.get(
    `/channels/${channelId}/messages${qs ? `?${qs}` : ""}`
  );
  return data as Message[];
}

// Search messages in a channel
export async function searchMessages(
  channelId: string,
  opts: { query: string; take?: number; cursor?: string }
): Promise<Message[]> {
  const params = new URLSearchParams();
  params.set("query", opts.query);
  if (opts.take) params.set("take", String(opts.take));
  if (opts.cursor) params.set("cursor", opts.cursor);

  const qs = params.toString();
  const { data } = await api.get(
    `/channels/${channelId}/messages/search${qs ? `?${qs}` : ""}`
  );

  return data as Message[];
}

export async function sendMessage(
  channelId: string,
  content?: string,
  replyToMessageId?: string,
  mentionUserIds: string[] = [],
  attachments: Array<any> = [],
  lastReadOverride?: string | null
) {
  const { data } = await api.post(`/channels/${channelId}/messages`, {
    content,
    replyToMessageId,
    mentionUserIds,
    attachments,
    lastReadOverride,
  });
  return data as Message;
}

// Explicitly pass Authorization for PATCH/DELETE to avoid any interceptor/import drift.
export async function updateMessage(
  channelId: string,
  messageId: string,
  content: string
) {
  const token = getToken();
  const { data } = await api.patch(
    `/channels/${channelId}/messages/${messageId}`,
    { content },
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  );
  return data as {
    id: string;
    channelId: string;
    content: string;
    updatedAt: string;
    authorId: string;
    author: { id: string; displayName: string };
  };
}

export async function deleteMessage(channelId: string, messageId: string) {
  const token = getToken();
  await api.delete(
    `/channels/${channelId}/messages/${messageId}`,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  );
}

// reactions
export async function reactToMessage(
  channelId: string,
  messageId: string,
  emoji: string
) {
  const { data } = await api.post(
    `/channels/${channelId}/messages/${messageId}/reactions`,
    { emoji }
  );
  return data as { ok: true };
}

export async function unreactToMessage(
  channelId: string,
  messageId: string,
  emoji: string
) {
  // axios DELETE with body → via { data: ... }
  const { data } = await api.delete(
    `/channels/${channelId}/messages/${messageId}/reactions`,
    { data: { emoji } }
  );
  return data as { ok: true } | undefined;
}

// attachments
export async function uploadMessageFile(file: File) {
  const form = new FormData();
  form.append("file", file);

  const { data } = await api.post("/uploads/message", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data as {
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
  };
}

// ---- Direct Messages ----
export async function listDirectChannels() {
  const { data } = await api.get("/channels/direct");
  return data as Array<{
    id: string;
    name: string;
    isDirect: boolean;
    members: { id: string; displayName: string; avatarUrl: string | null }[];
  }>;
}

export async function getOrCreateDirectChannel(userId: string) {
  const { data } = await api.get(`/channels/direct/${userId}`);
  return data as {
    id: string;
    name: string;
    members: { id: string; displayName: string; avatarUrl: string | null }[];
  };
}

// Mark channel as read
export async function markChannelRead(channelId: string) {
  const { data } = await api.post(`/channels/${channelId}/read`);
  return data;
}

// Channels with unread counts
export async function listChannelsWithUnread() {
  const { data } = await api.get(`/channels/with-unread`);
  return data as Array<{
    id: string;
    name: string;
    isDirect: boolean;
    unread: number;
    lastRead: string | null;
  }>;
}
