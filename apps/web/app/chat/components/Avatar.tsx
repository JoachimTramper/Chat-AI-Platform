"use client";

type AvatarProps = {
  name: string;
  avatarUrl: string | null;
  size?: number; // in px, default 32
};

export function Avatar({ name, avatarUrl, size = 32 }: AvatarProps) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const px = `${size}px`;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

  // Determine src:
  // - if avatarUrl starts with "/uploads", prepend the apiBase
  // - if it's already an absolute URL (http/https), leave it as is
  // - if it's null, no src -> fallback to initial letter
  let src: string | null = null;

  if (avatarUrl) {
    if (avatarUrl.startsWith("/uploads")) {
      src = `${apiBase}${avatarUrl}`;
    } else {
      src = avatarUrl;
    }
  }

  return (
    <div
      className="flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden shrink-0"
      style={{ width: px, height: px, fontSize: size * 0.5 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
