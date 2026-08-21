import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

export default function AuthCallback({ onDone }) {
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    const sid = m ? m[1] : null;
    if (!sid) { onDone(false); return; }
    api.post("/auth/callback", { session_id: sid })
      .then((r) => {
        window.history.replaceState(null, "", window.location.pathname);
        onDone(true, r.data);
      })
      .catch(() => onDone(false));
  }, [onDone]);

  return (
    <div className="min-h-screen bg-[#0A0D12] flex items-center justify-center" data-testid="auth-callback">
      <div className="text-amber-500 font-mono text-sm tracking-widest uppercase animate-pulse">
        Signing you in...
      </div>
    </div>
  );
}
