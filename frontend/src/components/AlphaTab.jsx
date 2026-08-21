import { useEffect, useState } from "react";
import { api, fmtNum } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, Zap, Activity, Target } from "lucide-react";

const signalColor = (sig) => {
  if (sig === "BUY") return "text-emerald-400 border-emerald-800 bg-emerald-950/40";
  if (sig === "SELL") return "text-rose-400 border-rose-800 bg-rose-950/40";
  return "text-amber-400 border-amber-800 bg-amber-950/40";
};

const barColor = (v) => (v >= 60 ? "bg-emerald-500" : v <= 40 ? "bg-rose-500" : "bg-amber-500");

function AlphaSignals() {
  const [data, setData] = useState({ signals: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/signal/alpha");
      setData(data);
    } catch { toast.error("Failed to load alpha signals"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, []);

  return (
    <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden" data-testid="alpha-signals-panel">
      <div className="px-4 py-3 bg-[#0E131F] border-b border-[#222C3D] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">
            Alpha Signal · Momentum × Sentiment × Options
          </span>
        </div>
        <button onClick={load} data-testid="refresh-alpha"
          className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-[11px] uppercase tracking-wider px-2 py-1 rounded-sm">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#0E131F] border-b border-[#222C3D]">
            <tr className="text-left">
              {["SYMBOL","SIGNAL","COMPOSITE","MOMENTUM","SENTIMENT","OPTIONS","DRIVERS"].map((h) => (
                <th key={h} className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500 font-mono text-xs">Computing signals...</td></tr>
            ) : data.signals?.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500 font-mono text-xs">No holdings. Add positions to see signals.</td></tr>
            ) : data.signals.map((s) => (
              <tr key={s.symbol} className="border-b border-[#1A2232] hover:bg-[#161C26]" data-testid={`signal-row-${s.symbol}`}>
                <td className="px-3 py-2.5">
                  <span className="font-mono font-bold text-amber-400 tracking-wider">{s.symbol}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm border ${signalColor(s.signal)}`} data-testid={`signal-${s.symbol}`}>
                    {s.signal}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-[#0E131F] h-1.5 rounded-sm overflow-hidden">
                      <div className={`${barColor(s.composite)} h-full`} style={{ width: `${s.composite}%` }} />
                    </div>
                    <span className="font-mono text-gray-100 font-bold">{s.composite}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-gray-300">{s.momentum}</td>
                <td className="px-3 py-2.5 font-mono text-gray-300">{s.sentiment}</td>
                <td className="px-3 py-2.5 font-mono text-gray-300">{s.options_tilt}</td>
                <td className="px-3 py-2.5 text-gray-400 text-[11px]">{s.drivers.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptionsFlow() {
  const [data, setData] = useState({ unusual: [], put_call_ratio: 0, total_call_volume: 0, total_put_volume: 0 });
  const [loading, setLoading] = useState(true);
  const [onlyUnusual, setOnlyUnusual] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/options/flow");
      setData(data);
    } catch { toast.error("Failed to load options flow"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, []);

  return (
    <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden" data-testid="options-flow-panel">
      <div className="px-4 py-3 bg-[#0E131F] border-b border-[#222C3D] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase">
            Unusual Options Flow · Whale Bets
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] font-mono text-gray-400">
            P/C: <span className={data.put_call_ratio > 1 ? "text-rose-400" : "text-emerald-400"}>{data.put_call_ratio}</span>
            <span className="text-gray-600 ml-2">Calls: {fmtNum(data.total_call_volume, 0)}</span>
            <span className="text-gray-600 ml-2">Puts: {fmtNum(data.total_put_volume, 0)}</span>
          </div>
          <button onClick={() => setOnlyUnusual((v) => !v)} data-testid="toggle-unusual"
            className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-sm border ${
              onlyUnusual ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" : "border-[#222C3D] text-gray-400"
            }`}>{onlyUnusual ? "Unusual only" : "All"}</button>
          <button onClick={load} data-testid="refresh-options"
            className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-[11px] uppercase tracking-wider px-2 py-1 rounded-sm">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#0E131F] border-b border-[#222C3D]">
            <tr className="text-left">
              {["SYMBOL","TYPE","STRIKE","EXPIRY","LAST","VOL","OI","VOL/OI","IV%"].map((h) => (
                <th key={h} className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-gray-500 font-mono text-xs">Scanning options chains...</td></tr>
            ) : data.unusual?.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-gray-500 font-mono text-xs">No unusual activity right now. Add stock positions.</td></tr>
            ) : data.unusual.map((f, i) => (
              <tr key={i} className="border-b border-[#1A2232] hover:bg-[#161C26]" data-testid={`option-row-${i}`}>
                <td className="px-3 py-2 font-mono font-bold text-amber-400">{f.symbol}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm border ${
                    f.kind === "call" ? "text-emerald-400 border-emerald-800 bg-emerald-950/40"
                    : "text-rose-400 border-rose-800 bg-rose-950/40"
                  }`}>{f.kind}</span>
                </td>
                <td className="px-3 py-2 font-mono text-gray-100">${f.strike}</td>
                <td className="px-3 py-2 font-mono text-gray-400">{f.expiry}</td>
                <td className="px-3 py-2 font-mono text-gray-300">${f.last}</td>
                <td className="px-3 py-2 font-mono text-gray-100">{fmtNum(f.volume, 0)}</td>
                <td className="px-3 py-2 font-mono text-gray-400">{fmtNum(f.open_interest, 0)}</td>
                <td className="px-3 py-2 font-mono text-cyan-400 font-bold">{f.vol_oi_ratio}×</td>
                <td className="px-3 py-2 font-mono text-gray-400">{f.iv}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AlphaTab() {
  return (
    <div data-testid="alpha-tab" className="space-y-4">
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm">
        <div className="text-xs font-mono tracking-widest uppercase text-amber-500 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Alpha Command Center
        </div>
        <div className="text-[11px] text-gray-500 font-mono mt-0.5">
          Composite signal per holding + live unusual options activity — spot moves before the crowd
        </div>
      </div>
      <AlphaSignals />
      <OptionsFlow />
    </div>
  );
}
