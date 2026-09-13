import { useEffect, useState } from "react";
import { api, timeAgo } from "@/lib/api";
import { RefreshCw, Landmark, FileText, Users } from "lucide-react";
import { toast } from "sonner";

const partyColor = (p) => {
  if (!p) return "text-gray-400";
  const s = String(p).toLowerCase();
  if (s.startsWith("d")) return "text-blue-400";
  if (s.startsWith("r")) return "text-rose-400";
  return "text-gray-400";
};
const typeColor = (t) => {
  const s = String(t || "").toLowerCase();
  if (s.includes("purchase") || s.includes("buy")) return "text-emerald-400 border-emerald-800 bg-emerald-950/40";
  if (s.includes("sale") || s.includes("sell")) return "text-rose-400 border-rose-800 bg-rose-950/40";
  return "text-gray-400 border-[#222C3D] bg-[#161C26]";
};

export default function InsiderFlowTab() {
  const [data, setData] = useState({ congress: [], form4: [], top_activity: [], held_matches: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("all");
  const [onlyHeld, setOnlyHeld] = useState(false);

  const load = async (isBackground = false) => {
    if (!isBackground && (!data.congress || data.congress.length === 0)) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const { data: res } = await api.get("/insider/summary");
      setData(res);
    } catch {
      if (!isBackground) toast.error("Failed to load insider flow");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const congress = onlyHeld ? data.congress.filter((c) => c.hit) : data.congress;

  return (
    <div data-testid="insider-flow-tab" className="space-y-4">
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm flex items-center justify-between">
        <div>
          <div className="text-xs font-mono tracking-widest uppercase text-amber-500 flex items-center gap-2">
            <Landmark className="w-4 h-4" /> Smart Money Flow
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-0.5">
            US Congress trades (STOCK Act) · SEC Form 4 insider filings · Auto-refresh 5 min
          </div>
        </div>
        <button onClick={() => load(true)} data-testid="refresh-insider"
          className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {data.notice && (
        <div className="border border-amber-800/40 bg-amber-950/20 rounded-sm p-3 text-xs text-amber-200 font-mono" data-testid="insider-notice">
          <span className="text-amber-500 uppercase tracking-widest text-[10px]">Notice ·</span> {data.notice}
        </div>
      )}

      {/* Top activity by ticker */}
      <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="top-activity">
        <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-3 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" /> Most-Traded Tickers (Congress · Last Period)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {data.top_activity.map((a) => (
            <div key={a.symbol} className={`border p-2 rounded-sm ${a.held ? "border-amber-600 bg-amber-500/5" : "border-[#222C3D]"}`}
              data-testid={`top-${a.symbol}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-amber-400 tracking-wider">{a.symbol}</span>
                {a.held && <span className="text-[9px] font-mono text-amber-400 uppercase">held</span>}
              </div>
              <div className="text-[10px] font-mono text-gray-500 mt-1">{a.trades} trades</div>
              <div className="flex gap-2 text-[10px] font-mono mt-0.5">
                <span className="text-emerald-400">▲{a.buys}</span>
                <span className="text-rose-400">▼{a.sells}</span>
              </div>
            </div>
          ))}
          {!data.top_activity.length && !loading && (
            <div className="col-span-full text-gray-500 font-mono text-xs">Loading recent activity...</div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2" data-testid="insider-source-tabs">
        {[
          ["all", "Congress"],
          ["held", "In My Portfolio"],
          ["form4", "SEC Form 4"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setOnlyHeld(k === "held"); }}
            data-testid={`insider-tab-${k}`}
            className={`text-xs uppercase tracking-widest font-mono px-3 py-1.5 rounded-sm border ${
              tab === k ? "border-amber-500 text-amber-500 bg-amber-500/10"
              : "border-[#222C3D] text-gray-400 hover:text-white hover:bg-[#161C26]"
            }`}
          >{l}</button>
        ))}
      </div>

      {tab === "form4" ? (
        <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden" data-testid="form4-list">
          <div className="px-4 py-2.5 bg-[#0E131F] border-b border-[#222C3D] text-[10px] font-mono tracking-widest text-amber-500 uppercase flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> Latest SEC Form 4 · Insider Transactions
          </div>
          <div className="divide-y divide-[#1A2232]">
            {data.form4.map((f, i) => (
              <a key={i} href={f.url} target="_blank" rel="noreferrer" data-testid={`form4-${i}`}
                className="block p-3 hover:bg-[#161C26]">
                <div className="text-sm text-gray-100">{f.company}</div>
                <div className="text-[10px] font-mono text-gray-500 mt-1">{timeAgo(f.filed_at)} · Form {f.form}</div>
              </a>
            ))}
            {!data.form4.length && <div className="p-6 text-center text-gray-500 font-mono text-xs">No filings loaded.</div>}
          </div>
        </div>
      ) : (
        <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="congress-table">
              <thead className="bg-[#0E131F] border-b border-[#222C3D]">
                <tr className="text-left">
                  {["DATE","CHAMBER","POLITICIAN","PARTY","TICKER","TYPE","AMOUNT"].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-mono text-[10px] tracking-widest text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && congress.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-500 font-mono text-xs">Loading trades...</td></tr>
                ) : congress.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-500 font-mono text-xs">
                    {onlyHeld ? "No recent congress trades in your portfolio symbols." : "No trades loaded."}
                  </td></tr>
                ) : (
                  congress.map((c, i) => (
                    <tr key={i} className={`border-b border-[#1A2232] hover:bg-[#161C26] ${c.hit ? "bg-amber-500/5" : ""}`}
                      data-testid={`congress-row-${i}`}>
                      <td className="px-3 py-2 font-mono text-gray-400">{c.date || "—"}</td>
                      <td className="px-3 py-2 text-gray-300">{c.chamber}</td>
                      <td className="px-3 py-2 text-gray-200">{c.politician || "—"}</td>
                      <td className={`px-3 py-2 font-mono ${partyColor(c.party)}`}>{c.party || "—"}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono font-bold text-amber-400 tracking-wider">{c.symbol || "—"}</span>
                        {c.hit && <span className="ml-1 text-[9px] font-mono text-amber-500 uppercase">held</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm border ${typeColor(c.type)}`}>
                          {c.type || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-300">{c.amount || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
