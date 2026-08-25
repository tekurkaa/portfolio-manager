import { useState } from "react";
import { Terminal, LogIn, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("trader@terminus.local");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleDevLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/dev-login", {
        email: email.trim() || "trader@terminus.local",
        name: email.split("@")[0] || "Senior Trader",
      });
      toast.success("Welcome back to Terminus!");
      if (onLoginSuccess) {
        onLoginSuccess(res.data);
      } else {
        window.location.reload();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Local sign in failed. Ensure backend and MongoDB are running.");
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
            Your portfolio, watchlist, and signals are private and isolated per account.
          </p>

          <form onSubmit={handleDevLogin} className="space-y-3 mb-4">
            <div className="text-left">
              <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase block mb-1">
                Trader ID / Email
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@terminus.local"
                className="w-full bg-[#0A0D12] border border-[#222C3D] rounded-sm px-3 py-2 text-sm font-mono text-gray-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              data-testid="local-login-button"
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm uppercase tracking-widest px-6 py-3 rounded-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" /> {loading ? "Launching Terminal..." : "Enter Terminal (Local / Demo)"}
            </button>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-[#222C3D]"></div>
            <span className="flex-shrink mx-4 text-[10px] font-mono text-gray-500 uppercase tracking-widest">or</span>
            <div className="flex-grow border-t border-[#222C3D]"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            data-testid="google-login-button"
            className="w-full mt-2 bg-[#1A2232] hover:bg-[#222C3D] text-gray-200 border border-[#2B384E] font-bold text-xs uppercase tracking-widest px-6 py-2.5 rounded-sm flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4 text-amber-500" /> Continue with Google
          </button>

          <div className="mt-6 text-[10px] font-mono text-gray-600 tracking-widest">
            TERMINUS HIGH-PRECISION PORTFOLIO PLATFORM
          </div>
        </div>
      </div>
    </div>
  );
}
