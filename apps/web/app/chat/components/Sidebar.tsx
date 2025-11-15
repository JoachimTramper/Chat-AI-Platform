"use client";

import type { ChannelWithUnread, OnlineUser } from "../types";
import { MessageCircle } from "lucide-react";
import { Avatar } from "./Avatar";

export function Sidebar({
  regularChannels,
  dmChannels,
  active,
  setActive,
  newChannel,
  setNewChannel,
  creating,
  onCreateChannel,
  othersOnline,
  recently,
  openDM,
  formatLastOnline,
}: {
  regularChannels: ChannelWithUnread[];
  dmChannels: ChannelWithUnread[];
  active: string | null;
  setActive: (id: string) => void;
  newChannel: string;
  setNewChannel: (v: string) => void;
  creating: boolean;
  onCreateChannel: () => Promise<void> | void;
  othersOnline: OnlineUser[];
  recently: OnlineUser[];
  openDM: (id: string) => Promise<void> | void;
  formatLastOnline: (d?: string | null) => string;
}) {
  return (
    <aside className="border-r p-3 space-y-4 overflow-auto min-h-0">
      <div className="space-y-6">
        {/* Channels */}
        <section>
          <h2 className="font-semibold text-xs uppercase tracking-wide text-gray-500">
            Channels
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreateChannel();
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
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-semibold min-w-4 h-4 px-[5px] leading-none shadow-sm">
                    {c.unread}
                  </span>
                )}
              </button>
            ))}
            {regularChannels.length === 0 && (
              <div className="text-sm text-gray-500 mt-1">No channels yet</div>
            )}
          </div>
        </section>

        {/* DMs */}
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
                    <span className="ml-auto inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-semibold min-w-4 h-4 px-[5px] leading-none shadow-sm">
                      {c.unread}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Online */}
      <div>
        <h3 className="font-semibold">Online ({othersOnline.length})</h3>
        <div className="mt-1 space-y-1">
          {othersOnline.length === 0 ? (
            <div className="text-sm text-gray-500">No one else online</div>
          ) : (
            othersOnline.map((u) => (
              <div key={u.id} className="flex items-center gap-2 text-sm">
                <Avatar
                  name={u.displayName}
                  avatarUrl={u.avatarUrl ?? null}
                  size={20}
                />
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

      {/* Offline */}
      <div className="mt-6">
        <h3 className="font-semibold">Offline ({recently.length})</h3>
        <div className="mt-1 space-y-2">
          {recently.length === 0 ? (
            <div className="text-sm text-gray-500">No offline users</div>
          ) : (
            recently.map((u) => (
              <div
                key={u.id}
                className="text-sm border-b border-gray-100 pb-1 last:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={u.displayName}
                      avatarUrl={u.avatarUrl ?? null}
                      size={20}
                    />
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
                <div className="ml-8 text-xs text-gray-500">
                  {formatLastOnline(u.lastSeen)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
