import { useEffect, useState, useRef } from "react";
import { api, fmtNum, fmtPct, openStockModal } from "@/lib/api";

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

const resolveModalSymbol = (sym) => {
  const map = {
    ".SPX": "SPY",
    ".NDX": "QQQ",
    ".DJI": "DIA",
    ".RUT": "IWM",
    ".VIX": "^VIX",
    ".DXY": "DX-Y.NYB",
    "BTC.CB=": "BTC-USD",
    "ETH.CB=": "ETH-USD",
    "SOL-USD": "SOL-USD",
    "@CL.1": "CL=F",
    "@GC.1": "GC=F",
    "@SI.1": "SI=F",
    "US10Y": "^TNX",
  };
  return map[sym] || sym;
};

const formatCountdown = (secs) => {
  if (secs === null || secs === undefined || secs <= 0) return "0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export default function TopTickerBar() {
  const [indices, setIndices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [flashes, setFlashes] = useState({});
  const [marketStatus, setMarketStatus] = useState(null);
  const prevPricesRef = useRef({});

  const loadIndices = async () => {
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
      console.error("TopTickerBar indices update failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMarketStatus = async () => {
    try {
      const { data } = await api.get("/market/status");
      setMarketStatus(data);
    } catch (e) {
      console.error("TopTickerBar market status fetch failed:", e);
    }
  };

  useEffect(() => {
    loadIndices();
    loadMarketStatus();

    // Re-fetch indices every 15s
    const indicesTimer = setInterval(loadIndices, 15000);
    // Re-sync market status every 45s
    const statusTimer = setInterval(loadMarketStatus, 45000);

    return () => {
      clearInterval(indicesTimer);
      clearInterval(statusTimer);
    };
  }, []);

  // 1-second countdown ticker for market status
  useEffect(() => {
    if (!marketStatus) return;
    const tickTimer = setInterval(() => {
      setMarketStatus((prev) => {
        if (!prev) return prev;
        const remaining = (prev.seconds_remaining ?? 0) - 1;
        if (remaining <= 0) {
          loadMarketStatus();
          return { ...prev, seconds_remaining: 0 };
        }
        return { ...prev, seconds_remaining: remaining };
      });
    }, 1000);

    return () => clearInterval(tickTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketStatus?.state]);

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

  // Determine badge styling based on market session state
  const state = marketStatus?.state || "CLOSED";
  const badgeConfig = {
    OPEN: {
      cls: "bg-emerald-950/80 text-emerald-400 border-emerald-800/60",
      dotCls: "bg-emerald-500",
      ping: true,
      label: "MARKET OPEN",
    },
    PRE_MARKET: {
      cls: "bg-amber-950/80 text-amber-400 border-amber-800/60",
      dotCls: "bg-amber-500",
      ping: true,
      label: "PRE-MARKET",
    },
    AFTER_HOURS: {
      cls: "bg-blue-950/80 text-blue-400 border-blue-800/60",
      dotCls: "bg-blue-500",
      ping: true,
      label: "AFTER-HOURS",
    },
    CLOSED: {
      cls: "bg-slate-900/80 text-slate-300 border-slate-700/60",
      dotCls: "bg-slate-500",
      ping: false,
      label: "CLOSED",
    },
  }[state] || {
    cls: "bg-slate-900/80 text-slate-300 border-slate-700/60",
    dotCls: "bg-slate-500",
    ping: false,
    label: "CLOSED",
  };

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

      {/* Feature 5: Pinned US Market Session & Real-Time Countdown Badge */}
      {marketStatus && (
        <div
          data-testid="market-status-badge"
          title={`US Equity Market: ${marketStatus.session} (${marketStatus.current_time_et || 'ET'}) · ${marketStatus.countdown_label} ${formatCountdown(marketStatus.seconds_remaining)}`}
          className={`hidden md:flex items-center gap-2 px-2.5 py-1.5 border-r border-[#222C3D] shrink-0 z-20 font-mono text-[10px] uppercase tracking-wider font-semibold ${badgeConfig.cls}`}
        >
          <span className="relative flex h-1.5 w-1.5">
            {badgeConfig.ping && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${badgeConfig.dotCls}`}></span>
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${badgeConfig.dotCls}`}></span>
          </span>
          <span className="font-bold">{badgeConfig.label}</span>
          <span className="text-gray-400 font-normal">
            ({marketStatus.countdown_label ? `${marketStatus.countdown_label} ` : ""}{formatCountdown(marketStatus.seconds_remaining)})
          </span>
        </div>
      )}

      {/* Scrolling Ticker Strip */}
      <div className="flex-1 overflow-hidden relative">
        <div className="flex ticker-scroll whitespace-nowrap py-1.5 cursor-default hover:[animation-play-state:paused]">
          {items.map((it, i) => {
            const up = (it.change_percent ?? 0) >= 0;
            const flashClass = flashes[it.symbol] || "";
            const modalSym = resolveModalSymbol(it.symbol);
            return (
              <div
                key={`${it.symbol}-${i}`}
                onClick={() => openStockModal(modalSym)}
                className={`flex items-center gap-2 px-3.5 border-r border-[#1B2332] shrink-0 transition-colors duration-200 rounded-xs cursor-pointer hover:bg-[#162032] ${flashClass}`}
                data-testid={`ticker-item-${it.symbol}`}
                title={`Click to view Bloomberg analysis for ${it.display_name} (${it.symbol})`}
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

