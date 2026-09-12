import { useState, useEffect } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { api, setToken, getToken } from "@/lib/api";
import TopTickerBar from "@/components/TopTickerBar";
import PortfolioTab from "@/components/PortfolioTab";
import StockNewsTab from "@/components/StockNewsTab";
import MacroNewsTab from "@/components/MacroNewsTab";
import SentimentTab from "@/components/SentimentTab";
import InsiderFlowTab from "@/components/InsiderFlowTab";
import AlphaTab from "@/components/AlphaTab";
import WatchlistTab from "@/components/WatchlistTab";
import ScannerTab from "@/components/ScannerTab";
import ChatTab from "@/components/ChatTab";
import HowItWorksModal from "@/components/HowItWorksModal";
import DisclaimerModal from "@/components/DisclaimerModal";
import ErrorBoundary from "@/components/ErrorBoundary";
import Login from "@/components/Login";
import AuthCallback from "@/components/AuthCallback";
import { LayoutGrid, Newspaper, Globe2, Gauge, Terminal, Landmark, Zap, Eye, LogOut, Radar, Bot, Info, ShieldAlert } from "lucide-react";

const TABS = [
  { id: "portfolio", label: "PORTFOLIO", icon: LayoutGrid },
  { id: "chat", label: "AI CHAT", icon: Bot },
  { id: "alpha", label: "ALPHA", icon: Zap },
  { id: "scanner", label: "SCANNER", icon: Radar },
  { id: "watchlist", label: "WATCHLIST", icon: Eye },
  { id: "stock-news", label: "STOCK NEWS", icon: Newspaper },
  { id: "macro-news", label: "MACRO", icon: Globe2 },
  { id: "sentiment", label: "SENTIMENT", icon: Gauge },
  { id: "insider", label: "SMART MONEY", icon: Landmark },
];

function App() {
  const [active, setActive] = useState("portfolio");
  const [now, setNow] = useState(new Date());
  const [howOpen, setHowOpen] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  // auth state: null = checking, false = anon, object = user
  const [user, setUser] = useState(window.location.hash?.includes("session_id=") ? "callback" : null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Check first-time login disclaimer acknowledgment
  useEffect(() => {
    if (user && typeof user === "object") {
      try {
        const accepted = localStorage.getItem("terminus_disclaimer_accepted_v1");
        if (!accepted) {
          setDisclaimerOpen(true);
        }
      } catch {}
    }
  }, [user]);

  useEffect(() => {
    if (user === "callback") return; // AuthCallback handles it
    if (user && user !== null) return;
    
    let cancelled = false;
    const verifyAuth = async (retries = 2) => {
      try {
        const r = await api.get("/auth/me");
        if (!cancelled) setUser(r.data);
      } catch (err) {
        // If we have a token and it was a network/500 error (cold start), retry once
        if (retries > 0 && getToken() && (err.code === "ECONNABORTED" || !err.response || err.response.status >= 500)) {
          setTimeout(() => { if (!cancelled) verifyAuth(retries - 1); }, 2500);
        } else {
          if (!cancelled) setUser(false);
        }
      }
    };
    verifyAuth();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthDone = (ok, data) => {
    if (ok && data) setUser(data);
    else setUser(false);
  };

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    setToken(null); // Clear localStorage token
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
  if (user === false) return <Login onLoginSuccess={(u) => setUser(u)} />;

  return (
    <div className="App min-h-screen flex flex-col" data-testid="app-root">
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
          {/* Live Date and Time in User's Local Timezone */}
          {(() => {
            const localDateStr = now.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            const localTimeStr = now.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
            const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
            const tzAbbr = Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
              .formatToParts(now)
              .find((p) => p.type === "timeZoneName")?.value || "";
            return (
              <div
                data-testid="clock-display"
                className="flex items-center gap-1.5 font-mono text-xs text-gray-300 bg-[#121721] border border-[#222C3D] px-2.5 py-1 rounded-sm"
                title={`Local timezone (${localTz}): ${now.toLocaleString()}`}
              >
                <span className="text-gray-400 hidden lg:inline font-medium">
                  {localDateStr}
                </span>
                <span className="text-gray-600 hidden lg:inline">·</span>
                <span className="text-amber-400 font-bold tracking-wider">
                  {localTimeStr}
                </span>
                <span className="text-[10px] text-gray-400 font-semibold uppercase">
                  {tzAbbr || "LOCAL"}
                </span>
              </div>
            );
          })()}
          <button
            onClick={() => setHowOpen(true)}
            data-testid="how-it-works-button"
            className="flex items-center gap-1 text-gray-400 hover:text-amber-400 text-[10px] font-mono uppercase tracking-widest transition-colors border border-[#222C3D] px-2 py-1 rounded bg-[#121721]"
          >
            <Info className="w-3.5 h-3.5 text-amber-500" /> How it works
          </button>
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
      <main className="p-3 sm:p-5 flex-1" data-testid="tab-content">
        <ErrorBoundary>
          {active === "portfolio" && <PortfolioTab />}
          {active === "chat" && <ChatTab />}
          {active === "alpha" && <AlphaTab />}
          {active === "scanner" && <ScannerTab />}
          {active === "watchlist" && <WatchlistTab />}
          {active === "stock-news" && <StockNewsTab />}
          {active === "macro-news" && <MacroNewsTab />}
          {active === "sentiment" && <SentimentTab />}
          {active === "insider" && <InsiderFlowTab />}
        </ErrorBoundary>
      </main>

      <footer className="border-t border-[#222C3D] px-4 py-2 text-[10px] font-mono text-gray-500 flex flex-col md:grid md:grid-cols-3 md:items-center gap-1 md:gap-2 text-center md:text-left mt-auto pb-10">
        <span className="md:justify-self-start truncate">DATA: YAHOO · GOOGLE NEWS · NEWSAPI · KADOA · SEC · STOCKTWITS</span>
        <span className="md:justify-self-center md:text-center text-gray-400">Sources equivalent to <span className="text-amber-500">$24,000/yr</span> institutional terminals · yours costs nothing</span>
        <span className="md:justify-self-end truncate">ANALYSIS: CLAUDE SONNET 4.6</span>
      </footer>

      {/* Fixed Bottom Regulatory Disclaimer Footer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-[#0A0D12]/95 backdrop-blur-md border-t border-[#222C3D] px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono shadow-lg"
        data-testid="fixed-disclaimer-footer"
      >
        <div className="flex items-center gap-2 text-gray-300">
          <span className="px-1.5 py-0.5 rounded-xs bg-amber-500/10 border border-amber-500/40 text-amber-400 text-[9px] font-bold tracking-wider uppercase flex items-center gap-1 shrink-0">
            <ShieldAlert className="w-3 h-3 text-amber-500" />
            DISCLAIMER
          </span>
          <span className="text-gray-300 font-medium truncate sm:overflow-visible">
            This application is for informational purposes only and does not constitute financial advice.
          </span>
        </div>
        <button
          onClick={() => setDisclaimerOpen(true)}
          data-testid="open-disclaimer-modal-button"
          className="text-gray-500 hover:text-amber-400 underline transition-colors cursor-pointer text-[10px] ml-auto shrink-0"
        >
          Legal Terms &amp; Disclosures
        </button>
      </div>

      <HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />
      <DisclaimerModal open={disclaimerOpen} onClose={() => setDisclaimerOpen(false)} />
    </div>
  );
}

export default App;
