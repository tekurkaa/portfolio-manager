import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, TestTube } from "lucide-react";

const cellColor = (v) => {
  if (v === null || v === undefined || v === 0) return "text-gray-500";
  return v > 0 ? "text-emerald-400" : "text-rose-500";
};

export default function BacktestPanel() {
  const [data, setData] = useState({ backtests: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/signal/backtest");
      setData(data);
    } catch { toast.error("Backtest failed"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden" data-testid="backtest-panel">
      <div className="px-4 py-3 bg-[#0E131F] border-b border-[#222C3D] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TestTube className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase">
            Signal Backtest · Momentum Model, Last 9 Months
          </span>
        </div>
        <button onClick={load} data-testid="refresh-backtest"
          className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-[11px] uppercase tracking-wider px-2 py-1 rounded-sm">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Rerun
        </button>
      </div>
      <div className="px-4 py-2 text-[10px] font-mono text-gray-500 border-b border-[#222C3D]">
        Shows how a BUY signal on this symbol would have performed 5 / 10 / 20 trading days later. Avg return · Win rate · Sample size.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#0E131F] border-b border-[#222C3D]">
            <tr className="text-left">
              <th rowSpan={2} className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase">SYMBOL</th>
              <th colSpan={3} className="px-3 py-1 text-center font-mono text-[10px] text-emerald-400 uppercase border-l border-[#222C3D]">BUY (mom ≥ +3%)</th>
              <th colSpan={3} className="px-3 py-1 text-center font-mono text-[10px] text-rose-400 uppercase border-l border-[#222C3D]">SELL (mom ≤ -3%)</th>
            </tr>
            <tr className="text-left border-t border-[#1A2232]">
              {["5D","10D","20D","5D","10D","20D"].map((h,i) => (
                <th key={i} className={`px-3 py-1 font-mono text-[10px] tracking-widest text-gray-500 uppercase ${i===0||i===3?"border-l border-[#222C3D]":""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500 font-mono text-xs">Backtesting...</td></tr>
            ) : data.backtests?.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500 font-mono text-xs">No holdings to backtest.</td></tr>
            ) : data.backtests.map((b) => {
              if (b.error) {
                return (
                  <tr key={b.symbol}><td className="px-3 py-2 font-mono font-bold text-amber-400">{b.symbol}</td>
                    <td colSpan={6} className="px-3 py-2 text-gray-500 text-[11px]">{b.error}</td></tr>
                );
              }
              const B = b.buy || {}, S = b.sell || {};
              const Cell = ({ d }) => {
                if (!d || d.avg === undefined) {
                  return <td className="px-3 py-2 font-mono text-gray-500">—</td>;
                }
                return (
                  <td className="px-3 py-2 font-mono">
                    <span className={cellColor(d.avg)}>{d.avg > 0 ? "+" : ""}{d.avg}%</span>
                    <span className="text-gray-500 text-[10px] ml-1">· {d.win_rate ?? 0}% · n={d.n ?? 0}</span>
                  </td>
                );
              };
              return (
                <tr key={b.symbol} className="border-b border-[#1A2232] hover:bg-[#161C26]" data-testid={`backtest-row-${b.symbol}`}>
                  <td className="px-3 py-2 font-mono font-bold text-amber-400">{b.symbol}</td>
                  <Cell d={B["5d"]} />
                  <Cell d={B["10d"]} />
                  <Cell d={B["20d"]} />
                  <Cell d={S["5d"]} />
                  <Cell d={S["10d"]} />
                  <Cell d={S["20d"]} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
