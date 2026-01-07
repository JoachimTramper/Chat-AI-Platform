"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import type { Me, ChannelWithUnread } from "../types";
import { usePresence } from "../hooks/usePresence";
import { Search, Menu, ChevronDown } from "lucide-react";
import Link from "next/link";

type DmPeer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  isIdle: boolean;
  statusText: string;
};

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
  dmPeer?: DmPeer | null;
  onEnableNotifications: () => void;
  onOpenSearch: () => void;
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
  dmPeer,
  onEnableNotifications,
  onOpenSearch,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const { online } = usePresence(user.sub);
  const mePresence = online.find((u) => u.id === user.sub);

  const myStatus = mePresence
    ? { isOnline: true, isIdle: mePresence.status === "idle" }
    : { isOnline: false, isIdle: false };

  const myStatusLabel = myStatus.isOnline
    ? myStatus.isIdle
      ? "Idle"
      : "Online"
    : "Offline";

  function toggleMenu() {
    setMenuOpen((v) => !v);
  }

  function handleChangeAvatar() {
    fileInputRef.current?.click();
    setMenuOpen(false);
  }

  function handleRemoveAvatar() {
    onRemoveAvatar();
    setMenuOpen(false);
  }

  function handleEnableNotificationsClick() {
    onEnableNotifications();
    setMenuOpen(false);
  }

  function handleLogoutClick() {
    onLogout();
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const root = menuRef.current;
      if (!root) return;

      const target = event.target as Node | null;
      if (target && !root.contains(target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [menuOpen]);

  const isDm = !!activeChannel?.isDirect && !!dmPeer;

  return (
    <>
      <header className="relative z-40 border-b border-neutral-300 md:border-b-0 bg-neutral-200 backdrop-blur-sm px-3 sm:px-4 py-2 flex items-center">
        {/* LEFT: hamburger (mobile) + desktop logo */}
        <div className="flex items-center gap-2 min-w-0">
          {/* mobile menu-button */}
          <button
            type="button"
            className="md:hidden mr-1 h-8 w-8 flex items-center justify-center rounded hover:bg-neutral-100"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <Menu size={20} className="text-neutral-700" />
          </button>

          {/* desktop logo + name (unchanged feel) */}
          <Link
            href="/chat"
            className="hidden md:flex items-center gap-2 min-w-0"
          >
            <img
              src="/LogoHeader.png"
              alt="Bamboo Comms"
              className="h-8 w-auto shrink-0"
            />
            <span className="font-bondi text-3xl font-medium tracking-wide text-neutral-800 truncate">
              Bamboo Comms
            </span>
          </Link>
        </div>

        {/* MOBILE: centered logo (only on mobile) */}
        <Link
          href="/chat"
          className="md:hidden absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
          aria-label="Bamboo Comms"
        >
          <img
            src="/LogoHeader.png"
            alt="Bamboo Comms"
            className="h-8 w-auto"
          />
        </Link>

        {/* DESKTOP ONLY: centered title (channel or DM) */}
        <div
          className="
            hidden md:flex
            absolute left-1/2 -translate-x-1/2
            items-center gap-2
            min-w-0 max-w-[62%] lg:max-w-[55%]
            pointer-events-none
            z-0
          "
        >
          {isDm ? (
            <>
              <div className="relative shrink-0">
                <Avatar
                  name={dmPeer!.displayName}
                  avatarUrl={dmPeer!.avatarUrl}
                  size={28}
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-neutral-200 ${
                    dmPeer!.isOnline
                      ? dmPeer!.isIdle
                        ? "bg-yellow-400"
                        : "bg-green-500"
                      : "bg-neutral-300"
                  }`}
                />
              </div>

              <div className="min-w-0 leading-tight text-center">
                <div className="text-sm font-semibold truncate text-neutral-900">
                  {dmPeer!.displayName}
                </div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {dmPeer!.statusText}
                </div>
              </div>
            </>
          ) : (
            <div className="min-w-0 text-center">
              <div className="text-sm font-semibold truncate text-neutral-900">
                #{activeChannel?.name ?? "Chat"}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: search + avatar + dropdown (unchanged) */}
        <div className="relative z-10 ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-600"
            aria-label="Search"
          >
            <Search size={18} strokeWidth={2} />
          </button>

          <div ref={menuRef} className="relative flex items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onAvatarChange}
            />

            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-neutral-100"
              onClick={toggleMenu}
              disabled={avatarUploading}
            >
              <div className="relative">
                <Avatar
                  name={user.displayName}
                  avatarUrl={user.avatarUrl}
                  size={28}
                />
                <span
                  className={`
                    absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-white
                    ${
                      myStatus.isOnline
                        ? myStatus.isIdle
                          ? "bg-yellow-400"
                          : "bg-green-500"
                        : "bg-neutral-300"
                    }
                  `}
                />
              </div>

              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-sm text-neutral-700 font-medium truncate max-w-[120px]">
                  {avatarUploading ? "Uploading..." : user.displayName}
                </span>
                <span className="text-xs text-neutral-500">
                  {myStatusLabel}
                </span>
              </div>

              <ChevronDown size={16} className="text-neutral-500" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-md border border-neutral-200 bg-white shadow-md text-sm z-50">
                <div className="px-3 py-2 border-b border-neutral-200">
                  <div className="text-xs text-neutral-500">Signed in as</div>
                  <div className="font-medium truncate text-neutral-900">
                    {user.displayName}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleChangeAvatar}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-xs text-neutral-700"
                >
                  Change avatar
                </button>

                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-xs text-neutral-600"
                >
                  Remove avatar
                </button>

                <button
                  type="button"
                  onClick={handleEnableNotificationsClick}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-xs text-neutral-700"
                >
                  Enable notifications
                </button>

                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="w-full text-left px-3 py-2 hover:bg-red-50 text-xs text-red-600 border-t border-neutral-200"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
