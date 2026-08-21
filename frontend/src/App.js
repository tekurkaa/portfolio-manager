import { useState, useEffect } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { api } from "@/lib/api";
import TopTickerBar from "@/components/TopTickerBar";
import PortfolioTab from "@/components/PortfolioTab";
import StockNewsTab from "@/components/StockNewsTab";
import MacroNewsTab from "@/components/MacroNewsTab";
import SentimentTab from "@/components/SentimentTab";
import InsiderFlowTab from "@/components/InsiderFlowTab";
import AlphaTab from "@/components/AlphaTab";
import WatchlistTab from "@/components/WatchlistTab";
import Login from "@/components/Login";
import AuthCallback from "@/components/AuthCallback";
import { LayoutGrid, Newspaper, Globe2, Gauge, Terminal, Landmark, Zap, Eye, LogOut } from "lucide-react";

const TABS = [
  { id: "portfolio", label: "PORTFOLIO", icon: LayoutGrid },
  { id: "alpha", label: "ALPHA", icon: Zap },
  { id: "watchlist", label: "WATCHLIST", icon: Eye },
  { id: "stock-news", label: "STOCK NEWS", icon: Newspaper },
  { id: "macro-news", label: "MACRO", icon: Globe2 },
  { id: "sentiment", label: "SENTIMENT", icon: Gauge },
  { id: "insider", label: "SMART MONEY", icon: Landmark },
];

function App() {
  const [active, setActive] = useState("portfolio");
  const [now, setNow] = useState(new Date());
  // auth state: null = checking, false = anon, object = user
  const [user, setUser] = useState(window.location.hash?.includes("session_id=") ? "callback" : null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (user === "callback") return; // AuthCallback handles it
    if (user && user !== null) return;
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false));
  }, []);

  const handleAuthDone = (ok, data) => {
    if (ok && data) setUser(data);
    else setUser(false);
  };

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    setUser(false);
    toast.success("Signed out");
  };

  if (user === "callback") return <AuthCallback onDone={handleAuthDone} />;
  if (user === null) {
    return (
      <div className="min-h-screen bg-[#0A0D12] flex items-center justify-center">
        <div className="text-amber-500 font-mono text-sm tracking-widest uppercase animate-pulse">Loading terminal...</div>
      </div>
    );
  }
  if (user === false) return <Login />;

  return (
    <div className="App min-h-screen" data-testid="app-root">
      <Toaster theme="dark" position="top-right" richColors />

      {/* Terminal header */}
      <header
        className="border-b border-[#222C3D] bg-[#0E131F] px-4 py-2 flex items-center justify-between sticky top-0 z-40"
        data-testid="app-header"
      >
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-amber-500" />
          <div className="flex flex-col leading-tight">
            <span className="text-amber-500 font-bold text-sm tracking-widest uppercase">
              Terminus / Invest
            </span>
            <span className="text-[10px] text-gray-500 font-mono">
              PERSONAL INVESTMENT COMMAND CENTER
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-gray-400">
          <div className="hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>LIVE</span>
          </div>
          <span data-testid="clock-display" className="text-gray-300">
            {now.toISOString().slice(11, 19)} UTC
          </span>
          <div className="flex items-center gap-2 pl-3 border-l border-[#222C3D]" data-testid="user-badge">
            {user.picture && <img src={user.picture} alt="" className="w-6 h-6 rounded-full border border-[#222C3D]" />}
            <span className="text-gray-300 hidden md:inline max-w-[140px] truncate">{user.email}</span>
            <button onClick={handleLogout} data-testid="logout-button"
              className="text-gray-500 hover:text-rose-400 transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <TopTickerBar />

      {/* Nav */}
      <nav
        className="border-b border-[#222C3D] bg-[#121721] px-2 sm:px-4 flex overflow-x-auto"
        data-testid="tab-navigation"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              data-testid={`tab-${t.id}-button`}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold tracking-widest uppercase whitespace-nowrap transition-colors duration-150 border-b-2 ${
                isActive
                  ? "text-amber-500 border-amber-500 bg-[#161C26]"
                  : "text-gray-500 border-transparent hover:text-gray-200 hover:bg-[#161C26]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <main className="p-3 sm:p-5" data-testid="tab-content">
        {active === "portfolio" && <PortfolioTab />}
        {active === "alpha" && <AlphaTab />}
        {active === "watchlist" && <WatchlistTab />}
        {active === "stock-news" && <StockNewsTab />}
        {active === "macro-news" && <MacroNewsTab />}
        {active === "sentiment" && <SentimentTab />}
        {active === "insider" && <InsiderFlowTab />}
      </main>

      <footer className="border-t border-[#222C3D] px-4 py-2 text-[10px] font-mono text-gray-500 flex justify-between">
        <span>DATA: YAHOO FINANCE / ALPHA VANTAGE / NEWSAPI</span>
        <span>ANALYSIS: CLAUDE SONNET 4.6</span>
      </footer>
    </div>
  );
}

export default App;
