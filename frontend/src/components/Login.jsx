import { Terminal, LogIn } from "lucide-react";

export default function Login() {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0D12] flex items-center justify-center p-4 grid-bg" data-testid="login-screen">
      <div className="max-w-md w-full">
        <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Terminal className="w-8 h-8 text-amber-500" />
            <div className="text-left">
              <div className="text-amber-500 font-bold text-lg tracking-widest uppercase">Terminus / Invest</div>
              <div className="text-[10px] text-gray-500 font-mono tracking-widest">PERSONAL INVESTMENT COMMAND CENTER</div>
            </div>
          </div>
          <h1 className="text-2xl font-mono font-bold text-gray-100 mb-2">Sign in to your terminal</h1>
          <p className="text-sm text-gray-400 font-mono mb-8 leading-relaxed">
            Your portfolio, watchlist, and signals are private and isolated per account.
          </p>
          <button
            onClick={handleLogin}
            data-testid="google-login-button"
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm uppercase tracking-widest px-6 py-3 rounded-sm flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4" /> Continue with Google
          </button>
          <div className="mt-6 text-[10px] font-mono text-gray-600 tracking-widest">
            SECURED BY EMERGENT AUTH · 7-DAY SESSION
          </div>
        </div>
      </div>
    </div>
  );
}
