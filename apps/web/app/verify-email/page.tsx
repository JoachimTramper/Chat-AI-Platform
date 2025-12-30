"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing token");
      return;
    }

    (async () => {
      try {
        const apiBase =
          process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";
        const res = await fetch(
          `${apiBase}/auth/verify-email?token=${encodeURIComponent(token)}`,
          { method: "GET" }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus("error");
          setMessage(data?.message ?? "Verification failed");
          return;
        }

        setStatus("ok");
        setMessage("Email verified! You can now log in.");
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message ?? "Verification failed");
      }
    })();
  }, [token]);

  return (
    <main style={{ padding: 24, maxWidth: 600 }}>
      <h1>Verify email</h1>

      {status === "loading" && <p>Verifying…</p>}

      {status === "ok" && (
        <>
          <p>{message}</p>
          <a href="/login">Go to login</a>
        </>
      )}

      {status === "error" && (
        <>
          <p style={{ color: "crimson" }}>{message}</p>
          <a href="/login">Go to login</a>
        </>
      )}
    </main>
  );
}
