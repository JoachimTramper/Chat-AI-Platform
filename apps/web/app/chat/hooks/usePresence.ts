"use client";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { OnlineUser } from "../types";

type SnapshotPayload = {
  online: (OnlineUser & { status?: "online" | "idle" })[];
  recently?: OnlineUser[];
};

type UpdatePayload = {
  user: OnlineUser;
  status?: "online" | "idle" | "offline";
  isOnline?: boolean; // for backwards compatibility
};

export function usePresence(myId?: string) {
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [recently, setRecently] = useState<OnlineUser[]>([]);

  useEffect(() => {
    const s = (() => {
      try {
        return getSocket();
      } catch {
        return null;
      }
    })();
    if (!s) return;

    const onSnapshot = (p: SnapshotPayload) => {
      // snapshot gives all online users + status (online/idle)
      setOnline(p.online ?? []);
      setRecently(p.recently ?? []);
    };

    const onUpdate = (p: UpdatePayload) => {
      const { user, status, isOnline } = p;

      // Determine if this user is online/idle or truly offline
      const consideredOnline =
        status === "online" ||
        status === "idle" ||
        (status === undefined && isOnline); // fallback

      // ---- update online[] ----
      setOnline((prev) => {
        const exists = prev.some((u) => u.id === user.id);

        if (consideredOnline) {
          const nextUser: OnlineUser = {
            ...user,
            status: status === "idle" ? "idle" : "online",
          };

          if (exists) {
            return prev.map((u) => (u.id === user.id ? nextUser : u));
          }
          return [...prev, nextUser];
        }

        // offline → remove from online list
        return prev.filter((u) => u.id !== user.id);
      });

      // ---- update recently[] ----
      setRecently((prev) => {
        // if user is (again) online/idle → remove from recently
        if (consideredOnline) {
          return prev.filter((u) => u.id !== user.id);
        }

        // truly offline → add to recently
        const others = prev.filter((u) => u.id !== user.id);
        const next = [user, ...others];

        // sort by lastSeen, most recent first
        return next
          .sort(
            (a, b) =>
              new Date(b.lastSeen || 0).getTime() -
              new Date(a.lastSeen || 0).getTime()
          )
          .slice(0, 20);
      });
    };

    s.on("presence.snapshot", onSnapshot);
    s.on("presence.update", onUpdate);

    return () => {
      s.off("presence.snapshot", onSnapshot);
      s.off("presence.update", onUpdate);
    };
  }, []);

  // filter yourself out for "othersOnline"
  const othersOnline = online.filter((u) => u.id !== myId);

  return { online, recently, othersOnline };
}
