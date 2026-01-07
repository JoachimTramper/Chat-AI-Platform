"use client";

import { Avatar } from "./Avatar";
import type { ChannelWithUnread } from "../types";

type DmPeer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  isIdle: boolean;
  statusText: string;
};

type Props = {
  activeChannel: ChannelWithUnread | undefined;
  dmPeer?: DmPeer | null;
};

export function MobileChatTitleBubble({ activeChannel, dmPeer }: Props) {
  const isDm = !!activeChannel?.isDirect && !!dmPeer;

  return (
    <div className="md:hidden px-3 sm:px-4 py-2">
      <div className="flex justify-center">
        <div className="relative max-w-full">
          <div
            className="
              inline-flex items-center gap-2
              rounded-full
              border border-neutral-300
              bg-white/90
              backdrop-blur
              px-2.5 py-0.5
              shadow-sm
              max-w-full
            "
          >
            {isDm ? (
              <>
                <div className="relative shrink-0">
                  <Avatar
                    name={dmPeer!.displayName}
                    avatarUrl={dmPeer!.avatarUrl}
                    size={22}
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white ${
                      dmPeer!.isOnline
                        ? dmPeer!.isIdle
                          ? "bg-yellow-400"
                          : "bg-green-500"
                        : "bg-neutral-300"
                    }`}
                  />
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="text-xs font-semibold text-neutral-900 truncate max-w-[70vw]">
                    {dmPeer!.displayName}
                  </div>
                  <div className="text-[11px] text-neutral-500 truncate max-w-[70vw]">
                    {dmPeer!.statusText}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs font-semibold text-neutral-900 truncate max-w-[80vw]">
                #{activeChannel?.name ?? "Chat"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
