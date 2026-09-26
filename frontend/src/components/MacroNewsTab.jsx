import { useEffect, useState } from "react";
import { api, timeAgo } from "@/lib/api";
import { RefreshCw, ExternalLink, Globe2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const THEMES = [
  { id: "ALL", label: "ALL", match: () => true },
  { id: "FED", label: "FED / RATES", match: (t) => /(fed|federal reserve|interest rate|powell|fomc|hike|cut|dot plot)/i.test(t) },
  { id: "TARIFF", label: "TARIFFS", match: (t) => /(tariff|trade war|import duty|export|customs)/i.test(t) },
  { id: "BONDS", label: "BONDS", match: (t) => /(bond|yield|treasury|10-year|2-year|curve)/i.test(t) },
  { id: "GOLD", label: "GOLD / OIL", match: (t) => /(gold|oil|opec|crude|commodity|silver)/i.test(t) },
  { id: "WAR", label: "GEOPOL / WAR", match: (t) => /(war|russia|ukraine|israel|iran|china|nato|conflict|sanction)/i.test(t) },
  { id: "INFL", label: "INFLATION", match: (t) => /(inflation|cpi|ppi|recession|gdp|unemployment)/i.test(t) },
];

export default function MacroNewsTab() {
  const [data, setData] = useState({ articles: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setTheme] = useState("ALL");

  const load = async (isBackground = false) => {
    if (!isBackground && (!data.articles || data.articles.length === 0)) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const { data: res } = await api.get("/news/macro");
      setData(res || { articles: [], summary: null });
    } catch {
      if (!isBackground) toast.error("Failed to load macro news");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTheme = THEMES.find((t) => t.id === theme) || THEMES[0];
  const filtered = data.articles.filter((a) => activeTheme.match(`${a.title} ${a.description || ""}`));

  return (
    <div data-testid="macro-news-tab" className="space-y-4">
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm flex items-center justify-between">
        <div>
          <div className="text-xs font-mono tracking-widest uppercase text-amber-500 flex items-center gap-2">
            <Globe2 className="w-4 h-4" /> Macro Intelligence
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-0.5">
            Tariffs · Fed · Bonds · Gold · Geopolitics · Inflation
          </div>
        </div>
        <button
          onClick={() => load(true)}
          data-testid="refresh-macro-news"
          className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {data.summary && (
        <div className="border border-blue-800/40 bg-blue-950/20 rounded-sm p-4 panel-raised" data-testid="macro-ai-summary">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-mono tracking-widest text-blue-400 uppercase">
              AI Macro Brief · Claude Sonnet 4.6
            </span>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{data.summary}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" data-testid="macro-theme-pills">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            data-testid={`macro-theme-${t.id}`}
            aria-pressed={theme === t.id}
            className={`text-[11px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-sm border transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
              theme === t.id
                ? "border-blue-500 bg-blue-500/10 text-blue-400 font-bold"
                : "border-[#222C3D] text-gray-400 hover:text-white hover:bg-[#161C26]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3" data-testid="macro-articles-list">
        {loading && (!data.articles || data.articles.length === 0) ? (
          <div className="grid gap-3" data-testid="macro-news-skeleton">
            {[1, 2, 3].map((n) => (
              <div key={n} className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm animate-pulse space-y-2.5 panel-raised">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-16 bg-[#1A2232] rounded-sm" />
                  <div className="h-3 w-12 bg-[#161C26] rounded-sm" />
                </div>
                <div className="h-4 w-3/4 bg-[#1E2638] rounded-sm" />
                <div className="h-3 w-full bg-[#161C26] rounded-sm" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 font-mono text-xs p-8">No articles in this theme.</div>
        ) : (
          filtered.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`macro-article-${i}`}
              className="block border border-[#222C3D] bg-[#121721] hover:border-blue-600 hover:bg-[#161C26] p-4 rounded-sm transition-colors group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono text-gray-500 uppercase">{a.source}</span>
                <span className="text-[10px] font-mono text-gray-600">· {timeAgo(a.published_at)}</span>
              </div>
              <h3 className="text-sm font-semibold text-gray-100 group-hover:text-blue-400 leading-snug">
                {a.title}
              </h3>
              {a.description && (
                <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{a.description}</p>
              )}
              <div className="flex items-center gap-1 text-[10px] text-gray-600 mt-2 font-mono uppercase">
                <ExternalLink className="w-3 h-3" /> read source
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
