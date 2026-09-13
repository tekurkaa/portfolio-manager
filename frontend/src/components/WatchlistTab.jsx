import { useEffect, useState } from "react";
import { api, fmtNum, fmtPct, colorForPL } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, Plus, Trash2, Search, Eye, Landmark } from "lucide-react";

const signalColor = (sig) => {
  if (sig === "BUY") return "text-emerald-400 border-emerald-800 bg-emerald-950/40";
  if (sig === "SELL") return "text-rose-400 border-rose-800 bg-rose-950/40";
  return "text-amber-400 border-amber-800 bg-amber-950/40";
};

function CongressDrawer({ symbol, onClose }) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    api.get(`/watchlist/congress/${symbol}`)
      .then((r) => setTrades(r.data.trades || []))
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, [symbol]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose} data-testid="congress-drawer">
      <div className="bg-[#121721] border border-[#222C3D] rounded-sm w-full max-w-3xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 bg-[#0E131F] border-b border-[#222C3D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">
              Congress Trades · {symbol}
            </span>
          </div>
          <button onClick={onClose} data-testid="close-drawer" className="text-gray-400 hover:text-white text-xs font-mono">✕ CLOSE</button>
        </div>
        <div className="overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="p-6 text-center text-gray-500 font-mono text-xs">Loading trades...</div>
          ) : trades.length === 0 ? (
            <div className="p-6 text-center text-gray-500 font-mono text-xs">No congress trades on record for {symbol}.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#0E131F] border-b border-[#222C3D]">
                <tr className="text-left">
                  {["DATE","CHAMBER","POLITICIAN","TYPE","AMOUNT"].map((h) => (
                    <th key={h} className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} className="border-b border-[#1A2232] hover:bg-[#161C26]">
                    <td className="px-3 py-2 font-mono text-gray-400">{t.date || "—"}</td>
                    <td className="px-3 py-2 text-gray-300">{t.chamber}</td>
                    <td className="px-3 py-2 text-gray-200">{t.politician}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm border ${
                        (t.type || "").toLowerCase().includes("purchase") ? "text-emerald-400 border-emerald-800 bg-emerald-950/40"
                        : (t.type || "").toLowerCase().includes("sale") ? "text-rose-400 border-rose-800 bg-rose-950/40"
                        : "text-gray-400 border-[#222C3D]"
                      }`}>{t.type || "—"}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-300">{t.amount || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WatchlistTab() {
  const [symbols, setSymbols] = useState([]);
  const [signals, setSignals] = useState([]);
  const [newSym, setNewSym] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawerSym, setDrawerSym] = useState(null);

  const load = async (isBackground = false) => {
    if (!isBackground && signals.length === 0) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [wl, sig] = await Promise.all([
        api.get("/watchlist"),
        api.get("/watchlist/signals"),
      ]);
      setSymbols(wl.data.symbols || []);
      setSignals(sig.data.signals || []);
    } catch {
      if (!isBackground) toast.error("Failed to load watchlist");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    const s = newSym.trim().toUpperCase();
    if (!s) return;
    setBusy(true);
    try {
      await api.post("/watchlist", { symbol: s });
      toast.success(`Added ${s} to watchlist`);
      setNewSym("");
      load();
    } catch { toast.error("Failed to add"); }
    finally { setBusy(false); }
  };

  const remove = async (s) => {
    await api.delete(`/watchlist/${s}`);
    toast.success(`Removed ${s}`);
    load();
  };

  return (
    <div data-testid="watchlist-tab" className="space-y-4">
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="text-xs font-mono tracking-widest uppercase text-amber-500 flex items-center gap-2">
              <Eye className="w-4 h-4" /> Watchlist · Scout Signals
            </div>
            <div className="text-[11px] text-gray-500 font-mono mt-0.5">
              Run Alpha Signal on tickers you don't own yet to spot entries · Click any row for congress trades
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newSym}
              onChange={(e) => setNewSym(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="ADD SYMBOL"
              data-testid="watchlist-input"
              className="bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs font-mono px-3 py-1.5 rounded-sm focus:outline-none focus:border-amber-500 w-40 tracking-widest"
            />
            <button onClick={add} disabled={busy} data-testid="watchlist-add"
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm disabled:opacity-50 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
            <button onClick={() => load(true)} data-testid="watchlist-refresh"
              className="border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm flex items-center gap-1">
              <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="bg-[#0E131F] border-b border-[#222C3D]">
              <tr className="text-left">
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase whitespace-nowrap">SYMBOL</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase whitespace-nowrap">PRICE</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase whitespace-nowrap">DAY %</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase whitespace-nowrap min-w-[110px] w-[110px]">SIGNAL</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase whitespace-nowrap">COMPOSITE</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase whitespace-nowrap">MOMENTUM</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase whitespace-nowrap">SENTIMENT</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase whitespace-nowrap">OPTIONS</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase">DRIVERS</th>
                <th className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading && signals.length === 0 ? (
                <tr><td colSpan={10} className="p-8 text-center text-gray-500 font-mono text-xs">Scanning watchlist...</td></tr>
              ) : signals.length === 0 ? (
                <tr><td colSpan={10} className="p-8 text-center text-gray-500 font-mono text-xs" data-testid="watchlist-empty">
                  Watchlist empty. Add a symbol above (e.g. SPY, PLTR, COIN) to scout opportunities.
                </td></tr>
              ) : signals.map((s) => (
                <tr key={s.symbol} className="border-b border-[#1A2232] hover:bg-[#161C26] cursor-pointer" onClick={() => setDrawerSym(s.symbol)}
                  data-testid={`watchlist-row-${s.symbol}`}>
                  <td className="px-3 py-2.5 font-mono font-bold text-amber-400 tracking-wider whitespace-nowrap">{s.symbol}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-200 whitespace-nowrap">{s.price != null ? `$${fmtNum(s.price, 2)}` : "—"}</td>
                  <td className={`px-3 py-2.5 font-mono whitespace-nowrap ${colorForPL(s.change_pct)}`}>{s.change_pct != null ? fmtPct(s.change_pct) : "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap min-w-[110px] w-[110px]">
                    <span className={`inline-flex items-center justify-center whitespace-nowrap text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-sm border shrink-0 ${signalColor(s.signal)}`}>
                      {s.signal ? s.signal.replace(/\s+/g, '\u00A0') : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-gray-100 font-bold whitespace-nowrap">{s.composite}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">{s.momentum}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">{s.sentiment}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">{s.options_tilt}</td>
                  <td className="px-3 py-2.5">
                    <div className="max-w-[220px] md:max-w-[280px] lg:max-w-[360px] text-gray-400 text-[11px] break-words leading-relaxed">
                      {s.drivers?.join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <button onClick={(e) => { e.stopPropagation(); remove(s.symbol); }}
                      data-testid={`watchlist-remove-${s.symbol}`}
                      className="text-gray-600 hover:text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {drawerSym && <CongressDrawer symbol={drawerSym} onClose={() => setDrawerSym(null)} />}
    </div>
  );
}
