import { X, Database, Zap, Terminal, Bot } from "lucide-react";

const SECTIONS = [
  {
    icon: Database,
    title: "Live Institutional-Grade Data Sources",
    lines: [
      "Yahoo Finance · yfinance for prices and news (~1 min freshness)",
      "Google News RSS · real-time headline index (~10 min)",
      "NewsAPI.org · 80k+ sources · 1-day rolling window",
      "Kadoa (GitHub raw) · House + Senate + Executive STOCK Act filings",
      "SEC EDGAR · Form 4 insider transactions atom feed",
      "StockTwits · public message stream · explicit bull/bear tags",
      "Alpha Vantage · fallback quote source",
      "yfinance options chains · nearest 3 expiries · unusual flow detection",
      "Anthropic Claude / OpenAI / Gemini · for grounded synthesis",
      "Resend · email digest delivery",
      "MongoDB Atlas · live cloud persistence for holdings, watchlists, and chat history",
    ],
  },
  {
    icon: Zap,
    title: "How Intelligence Gets Grounded",
    lines: [
      "1. Question hits /api/chat/message directly with terminal context",
      "2. Ticker regex extracts symbols (whole-word + $-prefix match)",
      "3. Parallel fetch: quote (live) · sentiment · congress trades · options flow · news (Yahoo + Google + NewsAPI)",
      "4. Every source article is stamped with its [publishedAt] timestamp",
      "5. CONTEXT block passed to AI with a strict 'answer only from context' system prompt",
      "6. Response returned with clickable citation pills back to the original URLs",
    ],
  },
  {
    icon: Terminal,
    title: "Personal Command Center Architecture",
    lines: [
      "Direct launch · instant access to your portfolio without third-party auth dependencies",
      "MongoDB Atlas database connectivity · cloud persistence across sessions",
      "Unified single-source-of-truth syncing across Portfolio, Risk Auditor, Alpha, and Chat",
      "Local and cloud execution compatibility · deployable to Render and Vercel",
    ],
  },
];

export default function HowItWorksModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose} data-testid="how-modal">
      <div className="bg-[#0A0D12] border border-[#222C3D] rounded-sm w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 bg-[#0E131F] border-b border-[#222C3D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">
              How Portfolio Terminal Works
            </span>
          </div>
          <button onClick={onClose} data-testid="close-how" className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[70vh] p-5 space-y-5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} data-testid={`section-${s.title.toLowerCase().replace(/\s/g, "-")}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-mono font-bold text-gray-100 tracking-wider">{s.title}</span>
                </div>
                <ul className="space-y-1 pl-6">
                  {s.lines.map((l, i) => (
                    <li key={i} className="text-[11px] font-mono text-gray-400 leading-relaxed list-disc marker:text-amber-500/50">{l}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className="border-t border-[#222C3D] pt-4 text-[10px] font-mono text-gray-500 leading-relaxed">
            Portfolio Terminal is a research tool, not a broker. Nothing shown is financial advice. Data may be delayed by the underlying source's own indexing latency.
          </div>
        </div>
      </div>
    </div>
  );
}
