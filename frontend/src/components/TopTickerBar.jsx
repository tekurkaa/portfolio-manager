import { useEffect, useState, useRef } from "react";
import { api, fmtNum, fmtPct } from "@/lib/api";
import { Activity } from "lucide-react";

const formatValue = (it) => {
  if (it.category === "yield" || it.symbol === "^TNX") {
    return `${fmtNum(it.price, 2)}%`;
  }
  if (it.category === "volatility" || it.symbol === "^VIX") {
    return fmtNum(it.price, 2);
  }
  if (it.category === "currency" || it.symbol === "DX-Y.NYB") {
    return fmtNum(it.price, 2);
  }
  return `$${fmtNum(it.price, 2)}`;
};

export default function TopTickerBar() {
  const [indices, setIndices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [flashes, setFlashes] = useState({});
  const prevPricesRef = useRef({});

  const load = async () => {
    try {
      const { data } = await api.get("/market/indices");
      const list = data.indices || [];
      
      // Detect price changes to trigger green/red micro-flashes
      const newFlashes = {};
      list.forEach((it) => {
        const prev = prevPricesRef.current[it.symbol];
        if (prev !== undefined && it.price !== prev) {
          newFlashes[it.symbol] = it.price > prev ? "pulse-green" : "pulse-red";
        }
        prevPricesRef.current[it.symbol] = it.price;
      });

      if (Object.keys(newFlashes).length > 0) {
        setFlashes(newFlashes);
        setTimeout(() => setFlashes({}), 1400);
      }

      setIndices(list);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("TopTickerBar update failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Live update interval every 15 seconds for real-time streaming without server congestion
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading && indices.length === 0) {
    return (
      <div
        className="border-b border-[#222C3D] bg-[#0E131F] py-2 px-4 text-[11px] font-mono text-gray-500 flex items-center gap-2"
        data-testid="ticker-bar-loading"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        Streaming live market indices & macro feeds...
      </div>
    );
  }

  // Duplicate items for continuous seamless infinite marquee scroll
  const items = indices.length ? [...indices, ...indices, ...indices] : [];

  return (
    <div
      className="border-b border-[#222C3D] bg-[#0A0E17] overflow-hidden relative flex items-stretch z-10 select-none"
      data-testid="ticker-bar"
    >
      {/* Pinned Live Status Pill */}
      <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#0E131F] border-r border-[#222C3D] shrink-0 z-20 shadow-md">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 uppercase">
          LIVE
        </span>
        {lastUpdated && (
          <span className="text-[9px] font-mono text-gray-500">
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {/* Scrolling Ticker Strip */}
      <div className="flex-1 overflow-hidden relative">
        <div className="flex ticker-scroll whitespace-nowrap py-1.5 cursor-default hover:[animation-play-state:paused]">
          {items.map((it, i) => {
            const up = (it.change_percent ?? 0) >= 0;
            const flashClass = flashes[it.symbol] || "";
            return (
              <div
                key={`${it.symbol}-${i}`}
                className={`flex items-center gap-2 px-3.5 border-r border-[#1B2332] shrink-0 transition-colors duration-300 rounded-xs ${flashClass}`}
                data-testid={`ticker-item-${it.symbol}`}
                title={`${it.display_name} (${it.symbol}): ${formatValue(it)} | 24h: ${fmtPct(it.change_percent)}`}
              >
                <span className="text-amber-400 font-mono font-bold text-[11px] tracking-wider">
                  {it.display_name || it.symbol}
                </span>
                <span className="text-gray-100 font-mono text-xs font-medium">
                  {formatValue(it)}
                </span>
                <span
                  className={`font-mono text-[11px] font-semibold flex items-center ${
                    up ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {up ? "▲" : "▼"} {fmtPct(Math.abs(it.change_percent || 0))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
