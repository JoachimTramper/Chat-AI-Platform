"use client";

import { Avatar } from "./Avatar";
import type { Me, ChannelWithUnread } from "../types";

type Props = {
  user: Me;
  activeChannel: ChannelWithUnread | undefined;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  avatarUploading: boolean;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
  onLogout: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
};

export function ChatHeader({
  user,
  activeChannel,
  fileInputRef,
  avatarUploading,
  onAvatarChange,
  onRemoveAvatar,
  onLogout,
  sidebarOpen,
  setSidebarOpen,
}: Props) {
  return (
    <header className="border-b bg-gray-50 px-3 md:px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-base font-semibold min-w-0">
        {/* mobile menu-button */}
        <button
          type="button"
          className="md:hidden mr-1 text-xl"
          onClick={() => setSidebarOpen(!sidebarOpen)}
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
          onChange={onAvatarChange}
        />

        <button
          type="button"
          className="text-xs text-gray-500 hover:underline"
          onClick={onRemoveAvatar}
        >
          Remove avatar
        </button>

        <button
          className="text-sm text-gray-600 hover:text-red-600 underline-offset-2 hover:underline"
          onClick={onLogout}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
