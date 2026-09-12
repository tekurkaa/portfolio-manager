import { useEffect, useState } from "react";
import { api, fmtPct, colorForPL } from "@/lib/api";

export default function AlphaReportCard() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState("1M");

  useEffect(() => {
    let alive = true;
    api.get(`/portfolio/history?range=${range}&benchmark=SPY`)
      .then((r) => alive && setData(r.data))
      .catch(() => alive && setData(null));
    return () => { alive = false; };
  }, [range]);

  if (!data || data.change_pct == null || !data.benchmark) return null;
  const alpha = data.alpha_vs_benchmark ?? (data.change_pct - data.benchmark.change_pct);
  const positive = alpha >= 0;

  return (
    <div className="border border-[#222C3D] bg-[#121721] rounded-sm px-4 py-2.5 flex flex-wrap items-center justify-between gap-3" data-testid="alpha-report-card">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">Your Alpha vs S&P 500</span>
        <span className={`font-mono font-bold text-lg ${colorForPL(alpha)}`} data-testid="alpha-value">
          {positive ? "+" : ""}{alpha.toFixed(2)}pp
        </span>
        <span className="text-[11px] font-mono text-gray-500">
          You <span className={colorForPL(data.change_pct)}>{fmtPct(data.change_pct)}</span> · SPY <span className={colorForPL(data.benchmark.change_pct)}>{fmtPct(data.benchmark.change_pct)}</span>
        </span>
      </div>
      <div className="flex gap-1">
        {["1W", "1M", "3M", "YTD", "1Y"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            data-testid={`alpha-range-${r}`}
            className={`text-[10px] font-mono px-2 py-0.5 rounded-sm border ${
              range === r
                ? "border-amber-500 text-amber-500 bg-amber-500/10"
                : "border-[#222C3D] text-gray-500 hover:text-white hover:bg-[#161C26]"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
