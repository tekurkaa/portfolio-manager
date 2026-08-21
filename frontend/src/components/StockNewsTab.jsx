import { useEffect, useState } from "react";
import { api, timeAgo } from "@/lib/api";
import { RefreshCw, ExternalLink, Newspaper, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function StockNewsTab() {
  const [data, setData] = useState({ articles: [], summary: null, symbols: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/news/stocks");
      setData(data || { articles: [], summary: null, symbols: [] });
    } catch (e) {
      toast.error("Failed to load stock news");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const tags = ["ALL", ...(data.symbols || [])];
  const filtered = filter === "ALL"
    ? data.articles
    : data.articles.filter((a) => a.tag === filter);

  return (
    <div data-testid="stock-news-tab" className="space-y-4">
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm flex items-center justify-between">
        <div>
          <div className="text-xs font-mono tracking-widest uppercase text-amber-500 flex items-center gap-2">
            <Newspaper className="w-4 h-4" /> News Feed · Your Positions
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-0.5">
            Filtered to symbols in your portfolio
          </div>
        </div>
        <button
          onClick={load}
          data-testid="refresh-stock-news"
          className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {data.summary && (
        <div className="border border-amber-800/40 bg-amber-950/20 rounded-sm p-4" data-testid="ai-summary-card">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-mono tracking-widest text-amber-400 uppercase">
              AI Executive Brief · Claude Sonnet 4.6
            </span>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{data.summary}</p>
        </div>
      )}

      {tags.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="tag-filter-pills">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              data-testid={`stock-filter-${t}`}
              className={`text-[11px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-sm border ${
                filter === t
                  ? "border-amber-500 bg-amber-500/10 text-amber-500"
                  : "border-[#222C3D] text-gray-400 hover:text-white hover:bg-[#161C26]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3" data-testid="news-articles-list">
        {loading ? (
          <div className="text-center text-gray-500 font-mono text-xs p-8">Loading news...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 font-mono text-xs p-8" data-testid="empty-news">
            {data.symbols?.length ? "No news for selected filter." : "Add positions in Portfolio tab to get filtered news."}
          </div>
        ) : (
          filtered.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`article-${i}`}
              className="block border border-[#222C3D] bg-[#121721] hover:border-amber-600 hover:bg-[#161C26] p-4 rounded-sm transition-colors group"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {a.tag && (
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-800 rounded-sm">
                    {a.tag}
                  </span>
                )}
                <span className="text-[10px] font-mono text-gray-500 uppercase">{a.source}</span>
                <span className="text-[10px] font-mono text-gray-600">· {timeAgo(a.published_at)}</span>
              </div>
              <h3 className="text-sm font-semibold text-gray-100 group-hover:text-amber-400 leading-snug">
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
