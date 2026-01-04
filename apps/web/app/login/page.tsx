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

  async function submit() {
    setErr(null);
    try {
      if (mode === "register") {
        await register(email, password, displayName, inviteCode);
        setMode("login");
        return;
      }

      // login
      await login(email, password);
      await me(); // smoke check
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
            src="/BambooBobLogo.png"
            alt="Bamboo Bob"
            className="w-48 md:w-64 lg:w-72"
          />
          <h1 className="font-ink text-3xl md:text-4xl font-bold text-center">
            Welcome
          </h1>
        </div>

        <div className="space-y-2">
          <input
            className="border rounded w-full p-2"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="border rounded w-full p-2"
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "register" && (
            <>
              <input
                className="border rounded w-full p-2"
                placeholder="display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
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

        <button
          onClick={submit}
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

        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="text-sm underline w-full text-center"
        >
          {mode === "login" ? "Create an account" : "I already have an account"}
        </button>
      </div>
    </div>
  );
}
