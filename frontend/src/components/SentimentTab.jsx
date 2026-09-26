import { useEffect, useState } from "react";
import { api, openStockModal } from "@/lib/api";
import { RefreshCw, Gauge, Sparkles } from "lucide-react";
import { toast } from "sonner";

const labelColor = (label) => {
  const map = {
    "Very Bullish": "text-emerald-400 border-emerald-800 bg-emerald-950/40",
    "Bullish": "text-emerald-400 border-emerald-800 bg-emerald-950/40",
    "Neutral": "text-gray-300 border-[#222C3D] bg-[#161C26]",
    "Bearish": "text-rose-400 border-rose-800 bg-rose-950/40",
    "Very Bearish": "text-rose-400 border-rose-800 bg-rose-950/40",
    "Extreme Fear": "text-rose-400 border-rose-800 bg-rose-950/40",
    "Fear": "text-rose-400 border-rose-800 bg-rose-950/40",
    "Greed": "text-emerald-400 border-emerald-800 bg-emerald-950/40",
    "Extreme Greed": "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  };
  return map[label] || map.Neutral;
};

const scoreBarColor = (score) => {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 55) return "bg-emerald-600";
  if (score >= 45) return "bg-amber-500";
  if (score >= 30) return "bg-rose-600";
  return "bg-rose-500";
};

const Gauge180 = ({ score, label }) => {
  const angle = (score / 100) * 180;
  const rad = (angle - 180) * (Math.PI / 180);
  const r = 70;
  const cx = 90, cy = 90;
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);
  const gaugeTitle = `Market Sentiment Gauge: ${score}${label ? ` (${label})` : ""}`;
  return (
    <svg
      viewBox="0 0 180 110"
      className="w-full max-w-[220px]"
      data-testid="sentiment-gauge"
      role="img"
      aria-label={gaugeTitle}
    >
      <title>{gaugeTitle}</title>
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#EF4444" />
          <stop offset="0.5" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke="#F3F4F6" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="#F59E0B" />
      <text x="90" y="106" textAnchor="middle" fill="#F3F4F6" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }} fontSize="20">{score}</text>
    </svg>
  );
};

const INDICATOR_NAMES = {
  market_volatility_vix: "Volatility (VIX)",
  put_call_options: "Put/Call Options",
  stock_price_breadth: "Price Breadth",
  safe_haven_demand: "Safe Haven Demand",
  junk_bond_demand: "Junk Bond Demand",
};

export default function SentimentTab() {
  const [data, setData] = useState({ per_symbol: [], average_score: 50, fear_greed: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isBackground = false, isManual = false) => {
    if (!isBackground && (!data.per_symbol || data.per_symbol.length === 0)) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const { data: res } = await api.get("/sentiment/portfolio");
      setData(res);
    } catch {
      if (isManual) {
        toast.error("Failed to load sentiment");
      } else if (!isBackground) {
        setTimeout(() => load(true), 3500);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid="sentiment-tab" className="space-y-4">
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm flex items-center justify-between">
        <div>
          <div className="text-xs font-mono tracking-widest uppercase text-amber-500 flex items-center gap-2">
            <Gauge className="w-4 h-4" /> Market Sentiment · CNN Fear & Greed · Reddit & StockTwits
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-0.5">
            Official CNN Institutional Indicators · ApeWisdom r/wallstreetbets & Social Tracking · StockTwits Realtime
          </div>
        </div>
        <button
          onClick={() => load(false, true)}
          data-testid="refresh-sentiment"
          className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="portfolio-sentiment-card">
          <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-2">Portfolio Average</div>
          <div className="flex items-center gap-4">
            <Gauge180 score={Math.round(data.average_score)} />
            <div>
              <div className="text-xs font-mono uppercase text-gray-500 tracking-widest">bull vs bear</div>
              <div className="text-2xl font-mono font-bold text-gray-100">{Math.round(data.average_score)}<span className="text-sm text-gray-500">/100</span></div>
              <div className="text-xs text-gray-400 mt-1 font-mono">
                across {data.per_symbol?.length || 0} positions
              </div>
            </div>
          </div>
        </div>

        <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="fear-greed-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">CNN Market Fear & Greed</div>
            {data.fear_greed?.crypto_fear_greed && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm border border-[#222C3D] bg-[#0E131F] text-gray-400">
                Crypto F&G: <span className="text-amber-400 font-bold">{data.fear_greed.crypto_fear_greed.score}</span> ({data.fear_greed.crypto_fear_greed.label})
              </span>
            )}
          </div>
          {data.fear_greed ? (
            <div>
              <div className="flex items-center gap-4 mb-3">
                <Gauge180 score={data.fear_greed.score} />
                <div>
                  <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${labelColor(data.fear_greed.label)}`}>
                    {data.fear_greed.label}
                  </span>
                  <div className="text-xs text-gray-400 mt-2 font-mono max-w-[240px]">
                    {data.fear_greed.reasoning}
                  </div>
                  {data.fear_greed.historical && (
                    <div className="text-[10px] text-gray-500 font-mono mt-1">
                      Prev Close: {data.fear_greed.historical.previous_close} · 1W Ago: {data.fear_greed.historical.previous_1_week}
                    </div>
                  )}
                </div>
              </div>

              {data.fear_greed.indicators && Object.keys(data.fear_greed.indicators).length > 0 && (
                <div className="border-t border-[#1A2232] pt-2 mt-2">
                  <div className="text-[9px] font-mono uppercase text-gray-500 mb-1.5 tracking-wider">Institutional Sub-Indicators (CNN)</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(data.fear_greed.indicators).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between text-[10px] font-mono px-2 py-1 bg-[#0E131F] border border-[#222C3D] rounded-sm">
                        <span className="text-gray-400 truncate max-w-[120px]">{INDICATOR_NAMES[key] || key}</span>
                        <span className="text-gray-200 font-bold ml-1">{val.rating || val.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500 text-xs font-mono">Loading...</div>
          )}
        </div>
      </div>

      <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden" data-testid="per-symbol-panel">
        <div className="px-4 py-2.5 bg-[#0E131F] border-b border-[#222C3D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">
              Per-Symbol Sentiment · Reddit Mentions & StockTwits Buzz
            </span>
          </div>
          <span className="text-[10px] font-mono text-gray-500">Live ApeWisdom + StockTwits</span>
        </div>
        {loading && (!data.per_symbol || data.per_symbol.length === 0) ? (
          <div className="p-8 text-center text-gray-500 font-mono text-xs">Analyzing headlines...</div>
        ) : data.per_symbol?.length === 0 ? (
          <div className="p-8 text-center text-gray-500 font-mono text-xs">
            Add positions in Portfolio tab to see per-symbol sentiment.
          </div>
        ) : (
          <div className="divide-y divide-[#1A2232]">
            {data.per_symbol.map((s) => (
              <div key={s.symbol} className="p-4" data-testid={`sentiment-row-${s.symbol}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <span
                      onClick={() => openStockModal(s.symbol)}
                      data-testid={`stock-trigger-${s.symbol}`}
                      className="font-mono font-bold text-amber-400 tracking-wider cursor-pointer hover:underline hover:text-amber-300 transition-colors"
                      title="Click to view security terminal details"
                    >
                      {s.symbol}
                    </span>
                    <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${labelColor(s.label)}`}>
                      {s.label}
                    </span>
                    {s.reddit_rank && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-amber-950/40 border border-amber-800 text-amber-400">
                        WSB #{s.reddit_rank}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-mono font-bold text-gray-100">{s.score}<span className="text-xs text-gray-500">/100</span></div>
                    <div className="text-[10px] font-mono text-gray-500">
                      {s.reddit_mentions > 0
                        ? `${s.reddit_mentions} Reddit mentions`
                        : s.stocktwits_msg_count > 0
                        ? `${s.stocktwits_msg_count} StockTwits msgs`
                        : null}
                    </div>
                  </div>
                </div>
                <div
                  className="w-full bg-[#0E131F] h-2 rounded-sm overflow-hidden flex mb-2"
                  role="progressbar"
                  aria-valuenow={s.bull_pct}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label={`${s.symbol} Bull/Bear Sentiment: ${s.bull_pct}% Bullish`}
                  data-testid={`bull-bear-bar-${s.symbol}`}
                >
                  <div className={`${scoreBarColor(s.score)}`} style={{ width: `${s.bull_pct}%` }} />
                  <div className="bg-rose-900/50" style={{ width: `${s.bear_pct}%` }} />
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500 mb-2">
                  <span className="text-emerald-500">▲ {s.bull_pct}% bull</span>
                  <span className="text-rose-500">▼ {s.bear_pct}% bear</span>
                  {(() => {
                    const redditCount = s.reddit_mentions || s.post_count || 0;
                    const items = [];
                    if (redditCount > 0) {
                      items.push(`${redditCount} Reddit mentions${s.reddit_upvotes ? ` (${s.reddit_upvotes} upvotes)` : ""}`);
                    }
                    if (s.stocktwits_msg_count > 0) {
                      items.push(`${s.stocktwits_msg_count} StockTwits`);
                    }
                    if (items.length > 0) {
                      return <span className="text-gray-400">· {items.join(" · ")}</span>;
                    }
                    return null;
                  })()}
                </div>

                <p className="text-xs text-gray-300 leading-relaxed">{s.reasoning}</p>
                {s.top_themes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.top_themes.map((t, i) => (
                      <span key={i} className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 bg-[#161C26] border border-[#222C3D] text-gray-400 rounded-sm">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {s.top_posts?.length > 0 && (
                  <div className="mt-3 border-t border-[#1A2232] pt-2 space-y-1" data-testid={`top-posts-${s.symbol}`}>
                    {s.top_posts.slice(0, 3).map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noreferrer"
                        className="block text-[11px] text-gray-400 hover:text-amber-400 truncate">
                        <span className="font-mono text-gray-600">r/{p.subreddit} · ▲{p.score} · 💬{p.num_comments}</span> {p.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

