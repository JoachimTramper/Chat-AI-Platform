"use client";
import { useState } from "react";
import { login, register, me } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("supersecret");
  const [displayName, setDisplayName] = useState("Tester");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    try {
      if (mode === "register") {
        await register(email, password, displayName, inviteCode);
        setMode("login");
        return;
      }

      await login(email, password);
      await me();
      router.push("/chat");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Error");
    }
  }

  return (
    <div
      className="
        min-h-dvh grid place-items-center p-6
        bg-[url('/BackgroundLoginMobile.png')]
        bg-no-repeat bg-cover
        bg-[position:40%_50%]
        md:bg-[url('/BackgroundLoginDesktop.png')]
        md:bg-no-repeat md:bg-cover md:bg-center
      "
    >
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <img
            src="/BambooCommsLogo.png"
            alt="Bamboo Comms"
            className="w-48 md:w-64 lg:w-72"
          />
        </div>

        <form onSubmit={submit} className="w-full space-y-4">
          <div className="space-y-2">
            <input
              className="border rounded w-full p-2"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
            <input
              className="border rounded w-full p-2"
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {mode === "register" && (
              <>
                <input
                  className="border rounded w-full p-2"
                  placeholder="display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />

                <input
                  className="border rounded w-full p-2"
                  placeholder="Invite Code (Optional)"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
              </>
            )}
          </div>

          {err && <p className="text-red-600 text-sm">{err}</p>}

          {/* button type submit */}
          <button
            type="submit"
            className="
              w-full
              rounded-xl
              p-3
              bg-black
              text-white
              font-semibold
              hover:bg-gray-500
              active:scale-[0.98]
              focus:outline-none
              focus:ring-2
              focus:ring-black/50
              transition
            "
          >
            {mode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="text-sm underline w-full text-center"
        >
          {mode === "login" ? "Create an account" : "I already have an account"}
        </button>
      </div>
    </div>
  );
}
