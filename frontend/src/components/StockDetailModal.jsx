import { useState, useEffect } from "react";
import { X, TrendingUp, TrendingDown, Plus, Check, Activity, Building2, BarChart2, Clock, RefreshCw } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { api, fmtMoney, fmtPct, fmtNum, fmtCompact, colorForPL } from "@/lib/api";
import { toast } from "sonner";

const RANGES = ["1D", "1W", "1M", "1Y", "5Y"];

const fmtChartTick = (t, range) => {
  if (!t) return "";
  const d = new Date(t);
  if (isNaN(d.getTime())) return "";

  if (range === "1D") {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (range === "1W") {
    return d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
  }
  if (range === "1M") {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  if (range === "1Y") {
    return d.toLocaleDateString([], { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
};

const fmtTooltipDate = (t, range) => {
  if (!t) return "";
  const d = new Date(t);
  if (isNaN(d.getTime())) return "";
  if (range === "1D" || range === "1W") {
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function StockDetailModal({ symbol, onClose }) {
  const [range, setRange] = useState("1D");
  const [details, setDetails] = useState(null);
  const [history, setHistory] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [addingWatchlist, setAddingWatchlist] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Load details
  const fetchDetails = async () => {
    if (!symbol) return;
    setLoadingDetails(true);
    try {
      const res = await api.get(`/market/details/${symbol}`);
      setDetails(res.data);
    } catch (err) {
      console.warn("Details fetch failed, trying quote fallback for", symbol, err);
      try {
        const qRes = await api.get(`/market/quote/${symbol}`);
        if (qRes.data) {
          const fbType = qRes.data.asset_type || "stock";
          const symUpper = symbol.toUpperCase();
          const isFbCrypto = fbType.includes("crypto") || ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"].includes(symUpper);
          const isFbEtf = fbType.includes("etf") || ["QQQ", "SPY", "VOO", "SOXL", "SOXS", "TQQQ", "SQQQ", "SMH", "ARKK", "GLD", "IBIT"].includes(symUpper);
          const fbName = (qRes.data.name && qRes.data.name.trim().toUpperCase() !== symUpper)
            ? qRes.data.name
            : (isFbCrypto ? `${symUpper} Digital Currency` : isFbEtf ? `${symUpper} ETF Trust` : `${symUpper} Corporation`);

          setDetails({
            symbol: symUpper,
            name: fbName,
            price: qRes.data.price,
            previous_close: qRes.data.previous_close,
            change: qRes.data.change,
            change_percent: qRes.data.change_percent,
            quote_type: fbType,
            currency: qRes.data.currency || "USD",
            summary: `${fbName} (${symUpper}) is an actively traded ${isFbCrypto ? "cryptocurrency network" : isFbEtf ? "exchange-traded fund (ETF)" : "public enterprise"} listed in US capital markets.`,
          });
          return;
        }
      } catch (fallbackErr) {
        console.error("Quote fallback also failed:", fallbackErr);
      }
      toast.error(`Unable to load market data for ${symbol}`);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Load history points for selected range with automatic off-hours fallback
  const fetchHistory = async (targetRange) => {
    if (!symbol) return;
    setLoadingHistory(true);
    try {
      const res = await api.get(`/market/history/${symbol}?range=${targetRange}`);
      if (res.data?.points?.length) {
        setHistory(res.data);
      } else if (targetRange === "1D") {
        // If 1D has no points (off-hours/weekend), try 1W so chart is never blank
        try {
          const fbRes = await api.get(`/market/history/${symbol}?range=1W`);
          if (fbRes.data?.points?.length) {
            setHistory(fbRes.data);
            setRange("1W");
          } else {
            setHistory(null);
          }
        } catch {
          setHistory(null);
        }
      } else {
        setHistory(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch stock history:", err);
      if (targetRange === "1D") {
        try {
          const fbRes = await api.get(`/market/history/${symbol}?range=1W`);
          if (fbRes.data?.points?.length) {
            setHistory(fbRes.data);
            setRange("1W");
            return;
          }
        } catch {}
      }
      setHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Check if ticker is in watchlist
  const checkWatchlist = async () => {
    if (!symbol) return;
    try {
      const res = await api.get("/watchlist");
      const list = res.data?.symbols || [];
      const found = list.some((item) => (item.symbol || item) === symbol.toUpperCase());
      setInWatchlist(found);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (symbol) {
      fetchDetails();
      fetchHistory(range);
      checkWatchlist();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    fetchHistory(newRange);
  };

  const handleAddToWatchlist = async () => {
    if (!symbol || inWatchlist) return;
    setAddingWatchlist(true);
    try {
      await api.post("/watchlist", { symbol: symbol.toUpperCase() });
      setInWatchlist(true);
      toast.success(`${symbol.toUpperCase()} added to watchlist`);
    } catch (err) {
      toast.error("Failed to add to watchlist");
    } finally {
      setAddingWatchlist(false);
    }
  };

  if (!symbol) return null;

  const currentPrice = details?.price ?? history?.end_value;
  const isUp = (history?.change ?? details?.change ?? 0) >= 0;
  const strokeColor = isUp ? "#10B981" : "#EF4444";
  const fillColor = isUp ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)";

  const upperSymbol = (details?.symbol || symbol || "").toUpperCase();
  const quoteType = (details?.quote_type || "").toLowerCase();
  const isCryptoAsset = quoteType.includes("crypto") || ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"].includes(upperSymbol);
  const isEtfAsset = quoteType.includes("etf") || ["QQQ", "SPY", "VOO", "SOXL", "SOXS", "TQQQ", "SQQQ", "SMH", "ARKK", "GLD", "IBIT"].includes(upperSymbol);

  const descriptiveName = (details?.name && details.name.trim().toUpperCase() !== upperSymbol)
    ? details.name
    : (isCryptoAsset ? `${upperSymbol} Digital Currency` : isEtfAsset ? `${upperSymbol} ETF Trust` : `${upperSymbol} Corporation`);

  const overviewTitle = isCryptoAsset ? "ASSET & NETWORK OVERVIEW" : (isEtfAsset ? "FUND OVERVIEW" : "COMPANY OVERVIEW");
  const overviewSummary = details?.summary || `${descriptiveName} (${upperSymbol}) is an actively traded ${isCryptoAsset ? "cryptocurrency network" : isEtfAsset ? "exchange-traded fund (ETF)" : "public enterprise"} listed in US capital markets.`;

  // Range bar calculation helper
  const calcRangePct = (current, low, high) => {
    if (!current || !low || !high || high <= low) return 50;
    const pct = ((current - low) / (high - low)) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const dayRangePct = calcRangePct(currentPrice, details?.day_low, details?.day_high);
  const yearRangePct = calcRangePct(currentPrice, details?.year_low, details?.year_high);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      data-testid="stock-detail-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-[#0A0D12] border border-[#222C3D] w-full max-w-4xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-detail-title"
      >
        {/* Modal Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Top Controls Row (Refresh & Close) */}
          <div className="flex items-center justify-end gap-2 -mb-2">
            <button
              onClick={() => {
                fetchDetails();
                fetchHistory(range);
              }}
              data-testid="refresh-stock-modal-btn"
              title="Refresh Quotes"
              aria-label="Refresh quotes"
              className="p-1.5 rounded-sm border border-[#222C3D] text-gray-400 hover:text-white hover:bg-[#161C26] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              data-testid="close-stock-modal-btn"
              aria-label="Close security detail modal"
              className="p-1.5 rounded-sm border border-[#222C3D] text-gray-400 hover:text-rose-400 hover:border-rose-900/50 hover:bg-rose-950/20 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Top Ticker & Price Banner */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1A2232] pb-5">
            <div>
              <div className="flex items-center gap-3">
                <span id="stock-detail-title" className="text-2xl sm:text-3xl font-mono font-bold text-amber-400 tracking-wider">
                  {details?.symbol || symbol.toUpperCase()}
                </span>
                {details?.quote_type && (
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-xs border border-blue-800/60 bg-blue-950/40 text-blue-400">
                    {details.quote_type}
                  </span>
                )}
                {details?.sector && (
                  <span className="hidden sm:inline-block text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-xs border border-[#222C3D] bg-[#121721] text-gray-400">
                    {details.sector}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-300 font-medium mt-1" data-testid="stock-modal-company-name">
                {descriptiveName}
                {details?.industry && (
                  <span className="text-xs text-gray-500 ml-2">· {details.industry}</span>
                )}
              </div>
            </div>

            {/* Price Display */}
            <div className="text-right">
              <div className="text-2xl sm:text-3xl font-mono font-bold text-gray-100" data-testid="stock-modal-price">
                {loadingDetails && !details ? "Loading..." : fmtMoney(currentPrice)}
              </div>
              {details && (
                <div
                  className={`flex items-center justify-end gap-1.5 font-mono text-xs sm:text-sm font-semibold mt-0.5 ${colorForPL(details.change)}`}
                  data-testid="stock-modal-change"
                >
                  {details.change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  <span>{fmtMoney(details.change)}</span>
                  <span>({fmtPct(details.change_percent)})</span>
                  <span className="text-gray-500 font-normal text-[10px] uppercase ml-1">Today</span>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Chart Section */}
          <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-mono font-semibold tracking-wider text-gray-200 uppercase">
                  Price Performance ({range})
                </span>
                {history && (
                  <span className={`text-xs font-mono font-semibold px-1.5 py-0.2 rounded-xs ${history.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {history.change >= 0 ? "+" : ""}{fmtMoney(history.change)} ({fmtPct(history.change_percent)})
                  </span>
                )}
              </div>

              {/* Range Selector */}
              <div className="flex items-center gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRangeChange(r)}
                    data-testid={`chart-range-${r}`}
                    className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-sm border transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none cursor-pointer ${
                      range === r
                        ? "border-amber-500 text-amber-400 bg-amber-500/10 shadow-xs"
                        : "border-[#222C3D] text-gray-400 hover:text-white hover:bg-[#161C26]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Area Chart */}
            <div style={{ width: "100%", height: 260 }}>
              {loadingHistory && !history?.points?.length ? (
                <div className="h-full flex items-center justify-center font-mono text-xs text-gray-500 gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  Streaming chart data...
                </div>
              ) : !history?.points?.length ? (
                <div className="h-full flex items-center justify-center font-mono text-xs text-gray-500">
                  No historical points available for this range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history.points} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="colorStockPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={strokeColor} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "monospace" }}
                      tickFormatter={(t) => fmtChartTick(t, range)}
                      minTickGap={35}
                      axisLine={{ stroke: "#222C3D" }}
                      tickLine={{ stroke: "#374151" }}
                      height={24}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fill: "#6B7280", fontSize: 10, fontFamily: "monospace" }}
                      tickFormatter={(v) => `$${v}`}
                      axisLine={{ stroke: "#222C3D" }}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0E131F",
                        border: "1px solid #222C3D",
                        borderRadius: "2px",
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                      labelStyle={{ color: "#F59E0B", fontWeight: "bold" }}
                      itemStyle={{ color: "#F3F4F6" }}
                      formatter={(v) => [fmtMoney(v), "Price"]}
                      labelFormatter={(t) => fmtTooltipDate(t, range)}
                    />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={strokeColor}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorStockPrice)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Range Gauges (Day Range & 52-Week Range) */}
          {details && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Day Range */}
              <div className="border border-[#222C3D] bg-[#121721] p-3 rounded-sm font-mono">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 flex justify-between">
                  <span>DAY RANGE</span>
                  <span className="text-gray-400">{fmtMoney(details.day_low)} — {fmtMoney(details.day_high)}</span>
                </div>
                <div
                  className="relative w-full h-1.5 bg-[#1F293D] rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.round(dayRangePct)}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label={`${symbol} Day Price Range`}
                >
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-amber-500 rounded-full"
                    style={{ width: `${dayRangePct}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>L: {fmtMoney(details.day_low)}</span>
                  <span className="text-amber-400 font-bold">Cur: {fmtMoney(currentPrice)}</span>
                  <span>H: {fmtMoney(details.day_high)}</span>
                </div>
              </div>

              {/* 52-Week Range */}
              <div className="border border-[#222C3D] bg-[#121721] p-3 rounded-sm font-mono">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 flex justify-between">
                  <span>52-WEEK RANGE</span>
                  <span className="text-gray-400">{fmtMoney(details.year_low)} — {fmtMoney(details.year_high)}</span>
                </div>
                <div
                  className="relative w-full h-1.5 bg-[#1F293D] rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.round(yearRangePct)}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label={`${symbol} 52-Week Price Range`}
                >
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-blue-500 rounded-full"
                    style={{ width: `${yearRangePct}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>52W L: {fmtMoney(details.year_low)}</span>
                  <span className="text-blue-400 font-bold">Cur: {fmtMoney(currentPrice)}</span>
                  <span>52W H: {fmtMoney(details.year_high)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Institutional Key Statistics Grid */}
          <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4">
            <div className="text-xs font-mono font-semibold tracking-wider text-gray-200 uppercase mb-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-amber-500" />
              <span>KEY INSTITUTIONAL METRICS</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 text-xs font-mono">
              {/* 1. Market Cap */}
              <div className="border-r border-[#1B2332] pr-2 pb-1">
                <div className="text-[10px] text-gray-500 uppercase">Market Cap</div>
                <div className="text-gray-100 font-bold mt-0.5">{fmtCompact(details?.market_cap)}</div>
              </div>
              {/* 2. Trailing P/E */}
              <div className="pl-2 sm:pl-0 sm:border-r border-[#1B2332] sm:pr-2 pb-1">
                <div className="text-[10px] text-gray-500 uppercase">Trailing P/E</div>
                <div className="text-gray-100 font-bold mt-0.5" title={!details?.pe_ratio ? "Not applicable or negative EPS" : undefined}>
                  {details?.pe_ratio ? fmtNum(details.pe_ratio, 2) : <span className="text-gray-500 text-[11px] font-normal">N/A</span>}
                </div>
              </div>
              {/* 3. Forward P/E */}
              <div className="border-r border-[#1B2332] pr-2 pt-2 border-t sm:border-t-0 border-[#1B2332]">
                <div className="text-[10px] text-gray-500 uppercase">Forward P/E</div>
                <div className="text-gray-100 font-bold mt-0.5" title={!details?.forward_pe ? "No analyst consensus estimates available" : undefined}>
                  {details?.forward_pe ? fmtNum(details.forward_pe, 2) : <span className="text-gray-500 text-[11px] font-normal">N/A</span>}
                </div>
              </div>
              {/* 4. Beta 5Y */}
              <div className="pl-2 sm:pl-0 pt-2 border-t sm:border-t-0 border-[#1B2332]">
                <div className="text-[10px] text-gray-500 uppercase">Beta (5Y)</div>
                <div className="text-gray-100 font-bold mt-0.5" title={!details?.beta ? "Beta not available for this security" : undefined}>
                  {details?.beta ? fmtNum(details.beta, 2) : <span className="text-gray-500 text-[11px] font-normal">N/A</span>}
                </div>
              </div>

              {/* 5. Open */}
              <div className="border-r border-[#1B2332] pr-2 pt-2 border-t border-[#1B2332]">
                <div className="text-[10px] text-gray-500 uppercase">Open</div>
                <div className="text-gray-100 font-bold mt-0.5">{fmtMoney(details?.open)}</div>
              </div>
              {/* 6. Prev Close */}
              <div className="pl-2 sm:pl-0 sm:border-r border-[#1B2332] sm:pr-2 pt-2 border-t border-[#1B2332]">
                <div className="text-[10px] text-gray-500 uppercase">Prev Close</div>
                <div className="text-gray-100 font-bold mt-0.5">{fmtMoney(details?.previous_close)}</div>
              </div>
              {/* 7. Volume */}
              <div className="border-r border-[#1B2332] pr-2 pt-2 border-t border-[#1B2332]">
                <div className="text-[10px] text-gray-500 uppercase">Volume</div>
                <div className="text-gray-100 font-bold mt-0.5">
                  {details?.volume ? fmtCompact(details.volume).replace("$", "") : <span className="text-gray-500 text-[11px] font-normal">N/A</span>}
                </div>
              </div>
              {/* 8. Dividend Yield */}
              <div className="pl-2 sm:pl-0 pt-2 border-t border-[#1B2332]">
                <div className="text-[10px] text-gray-500 uppercase">Dividend Yield</div>
                <div className="text-gray-100 font-bold mt-0.5" title={!details?.dividend_yield ? "Non-dividend paying asset" : undefined}>
                  {details?.dividend_yield ? fmtPct(details.dividend_yield * 100) : <span className="text-gray-500 text-[11px] font-normal">N/A</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Company Profile / Summary */}
          <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="stock-modal-overview-section">
            <div className="text-xs font-mono font-semibold tracking-wider text-gray-200 uppercase mb-2 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-amber-500" />
              <span>{overviewTitle}</span>
            </div>
            {loadingDetails && !details ? (
              <div className="space-y-1.5 animate-pulse py-1">
                <div className="h-3 bg-[#1D2635] rounded w-full"></div>
                <div className="h-3 bg-[#1D2635] rounded w-5/6"></div>
                <div className="h-3 bg-[#1D2635] rounded w-2/3"></div>
              </div>
            ) : (
              <>
                <p className={`text-xs text-gray-300 leading-relaxed font-sans ${showFullSummary ? "" : "line-clamp-3"}`} data-testid="stock-modal-summary-text">
                  {overviewSummary}
                </p>
                {overviewSummary.length > 200 && (
                  <button
                    onClick={() => setShowFullSummary(!showFullSummary)}
                    aria-expanded={showFullSummary}
                    data-testid="toggle-full-summary-btn"
                    className="text-[11px] font-mono text-amber-400 hover:text-amber-300 mt-2 underline cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                  >
                    {showFullSummary ? "Show less" : "Read full profile..."}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="px-4 py-3 pb-safe-modal bg-[#0E131F] border-t border-[#222C3D] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[10px] font-mono text-gray-500 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>Updated: {new Date().toLocaleTimeString()}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleAddToWatchlist}
              disabled={inWatchlist || addingWatchlist}
              data-testid="modal-add-watchlist-btn"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-xs font-semibold uppercase tracking-wider border transition-colors cursor-pointer ${
                inWatchlist
                  ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-400 cursor-default"
                  : "border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              }`}
            >
              {inWatchlist ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>In Watchlist</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{addingWatchlist ? "Adding..." : "Add to Watchlist"}</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-sm font-mono text-xs font-semibold uppercase tracking-wider border border-[#222C3D] text-gray-300 hover:bg-[#161C26] transition-colors cursor-pointer"
            >
              Close [ESC]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
