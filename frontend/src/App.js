import { useState, useEffect } from "react";
import "@/App.css";
import { Toaster } from "sonner";
import TopTickerBar from "@/components/TopTickerBar";
import PortfolioTab from "@/components/PortfolioTab";
import StockNewsTab from "@/components/StockNewsTab";
import MacroNewsTab from "@/components/MacroNewsTab";
import SentimentTab from "@/components/SentimentTab";
import InsiderFlowTab from "@/components/InsiderFlowTab";
import { LayoutGrid, Newspaper, Globe2, Gauge, Terminal, Landmark } from "lucide-react";

const TABS = [
  { id: "portfolio", label: "PORTFOLIO", icon: LayoutGrid },
  { id: "stock-news", label: "STOCK NEWS", icon: Newspaper },
  { id: "macro-news", label: "MACRO", icon: Globe2 },
  { id: "sentiment", label: "SENTIMENT", icon: Gauge },
  { id: "insider", label: "SMART MONEY", icon: Landmark },
];

function App() {
  const [active, setActive] = useState("portfolio");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
          <span className="text-gray-500 hidden md:inline">
            {now.toDateString()}
          </span>
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
