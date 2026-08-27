import { useState } from "react";
import { Terminal, LogIn, UserCheck } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { toast } from "sonner";

export default function Login({ onLoginSuccess }) {
  const lastEmail = typeof window !== "undefined" ? localStorage.getItem("pm_last_email") : null;
  const lastProvider = typeof window !== "undefined" ? localStorage.getItem("pm_last_auth_provider") : null;
  const [email, setEmail] = useState(lastEmail || "trader@terminus.local");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleDevLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    const targetEmail = (email.trim() || "trader@terminus.local").toLowerCase();
    try {
      const res = await api.post("/auth/dev-login", {
        email: targetEmail,
        name: targetEmail.split("@")[0] || "Senior Trader",
      });
      // Persist token & last email for session continuity
      if (res.data?.session_token) setToken(res.data.session_token);
      localStorage.setItem("pm_last_email", targetEmail);
      localStorage.setItem("pm_last_auth_provider", "local");
      toast.success(`Welcome back, ${res.data?.name || targetEmail}!`);
      if (onLoginSuccess) {
        onLoginSuccess(res.data);
      } else {
        window.location.reload();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sign in failed. Ensure backend is reachable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0D12] flex items-center justify-center p-4 grid-bg" data-testid="login-screen">
      <div className="max-w-md w-full">
        <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-8 text-center shadow-2xl">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Terminal className="w-8 h-8 text-amber-500" />
            <div className="text-left">
              <div className="text-amber-500 font-bold text-lg tracking-widest uppercase">Terminus / Invest</div>
              <div className="text-[10px] text-gray-500 font-mono tracking-widest">PERSONAL INVESTMENT COMMAND CENTER</div>
            </div>
          </div>
          <h1 className="text-2xl font-mono font-bold text-gray-100 mb-2">Sign in to your terminal</h1>
          <p className="text-sm text-gray-400 font-mono mb-6 leading-relaxed">
            Your portfolio, watchlist, and signals are securely isolated per account.
          </p>

          {/* Primary Option: Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            data-testid="google-login-button"
            className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold text-sm uppercase tracking-wider px-6 py-3 rounded-sm flex items-center justify-center gap-2.5 transition-all shadow-md mb-4"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            {lastProvider === "google" && lastEmail ? `Continue as ${lastEmail}` : "Continue with Google"}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-[#222C3D]"></div>
            <span className="flex-shrink mx-4 text-[10px] font-mono text-gray-500 uppercase tracking-widest">or sign in with email / demo</span>
            <div className="flex-grow border-t border-[#222C3D]"></div>
          </div>

          <form onSubmit={handleDevLogin} className="space-y-3 mt-3">
            <div className="text-left">
              <label className="text-[10px] font-mono text-gray-400 tracking-wider uppercase block mb-1">
                Account Email / Trader ID
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your-email@example.com"
                className="w-full bg-[#0A0D12] border border-[#222C3D] rounded-sm px-3 py-2 text-xs font-mono text-gray-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              data-testid="local-login-button"
              className="w-full bg-[#161C26] hover:bg-[#1E2633] text-amber-400 border border-amber-500/40 hover:border-amber-500 font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" /> {loading ? "Launching Terminal..." : `Sign In with Email`}
            </button>
          </form>

          <div className="mt-6 text-[10px] font-mono text-gray-600 tracking-widest">
            TERMINUS INSTITUTIONAL INVESTMENT PLATFORM
          </div>
        </div>
      </div>
    </div>
  );
}

