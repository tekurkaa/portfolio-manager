import { useEffect, useState } from "react";
import { api, fmtMoney, fmtPct, colorForPL } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Treemap } from "recharts";

const RANGES = [
  { key: "1D", label: "TODAY", sub: "Live" },
  { key: "1W", label: "1W", sub: "Past Week" },
  { key: "1M", label: "1M", sub: "Past Month" },
  { key: "3M", label: "3M", sub: "Past 3 Months" },
  { key: "YTD", label: "YTD", sub: "Year to Date" },
  { key: "1Y", label: "1Y", sub: "Past Year" },
  { key: "5Y", label: "5Y", sub: "Past 5 Years" },
  { key: "ALL", label: "ALL", sub: "All Time" },
];

const fmtT = (t, isIntraday) => {
  const d = new Date(t);
  if (isIntraday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
};

export function PortfolioHistoryChart({ currentValue = null }) {
  const [range, setRange] = useState("1D");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/portfolio/history?range=${range}`)
      .then((r) => { if (alive) setData(r.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range]);

  // Single source of truth: prefer live currentValue (from /api/portfolio/holdings)
  // over historical bar-derived end_value. Rescale the historical change % accordingly
  // so the "since range start" figure stays coherent.
  const historicalEnd = data?.end_value ?? 0;
  const displayedEnd = currentValue != null ? currentValue : historicalEnd;
  const historicalStart = data?.start_value ?? 0;
  const change = historicalStart ? displayedEnd - historicalStart : (data?.change ?? 0);
  const changePct = historicalStart ? (change / historicalStart) * 100 : (data?.change_pct ?? 0);
  const up = change >= 0;
  const stroke = up ? "#10B981" : "#EF4444";
  const active = RANGES.find((r) => r.key === range) || RANGES[0];
  const isIntraday = range === "1D";

  return (
    <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="portfolio-history-chart">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">Portfolio Value</div>
          {data && (
            <>
              <div className="text-3xl font-mono font-bold text-gray-100 mt-1" data-testid="chart-current-value">
                {fmtMoney(displayedEnd)}
              </div>
              <div className={`text-sm font-mono mt-0.5 ${colorForPL(change)}`} data-testid="chart-change">
                {change >= 0 ? "▲" : "▼"} {fmtMoney(Math.abs(change))} ({fmtPct(changePct)})
                <span className="text-gray-500 ml-2">· {active.sub}</span>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              data-testid={`range-${r.key}`}
              className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-sm border ${
                range === r.key
                  ? "border-amber-500 text-amber-500 bg-amber-500/10"
                  : "border-[#222C3D] text-gray-400 hover:text-white hover:bg-[#161C26]"
              }`}
            >{r.label}</button>
          ))}
        </div>
      </div>
      <div style={{ width: "100%", height: 260 }}>
        {loading ? (
          <div className="text-gray-500 font-mono text-xs h-full flex items-center justify-center">Loading {active.sub}...</div>
        ) : !data?.points?.length ? (
          <div className="text-gray-500 font-mono text-xs h-full flex items-center justify-center" data-testid="history-empty">
            No historical data. Add positions first.
          </div>
        ) : (
          <ResponsiveContainer>
            <LineChart data={data.points} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradVal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fill: "#6B7280", fontSize: 10, fontFamily: "monospace" }}
                tickFormatter={(t) => fmtT(t, isIntraday)} minTickGap={40} axisLine={{ stroke: "#222C3D" }} tickLine={false} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 10, fontFamily: "monospace" }}
                domain={["auto", "auto"]} axisLine={{ stroke: "#222C3D" }} tickLine={false}
                tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} width={55} />
              <Tooltip
                contentStyle={{ background: "#0E131F", border: "1px solid #222C3D", fontFamily: "monospace", fontSize: 11 }}
                labelStyle={{ color: "#9CA3AF" }}
                itemStyle={{ color: "#F3F4F6" }}
                formatter={(v) => [fmtMoney(v), "Value"]}
                labelFormatter={(t) => fmtT(t, isIntraday)}
              />
              <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} dot={false} fill="url(#gradVal)" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const TreemapCell = ({ x, y, width, height, name, value, pl_pct }) => {
  if (width < 30 || height < 25) return null;
  const up = (pl_pct ?? 0) >= 0;
  const fill = up ? "rgba(16,185,129,0.85)" : "rgba(239,68,68,0.85)";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} stroke="#0E131F" strokeWidth={2} fill={fill} />
      <text x={x + width / 2} y={y + height / 2 - 4} textAnchor="middle" fill="#0A0D12" fontSize={Math.min(width/5, 16)} fontWeight="bold" style={{ fontFamily: "monospace" }}>{name}</text>
      <text x={x + width / 2} y={y + height / 2 + 12} textAnchor="middle" fill="#0A0D12" fontSize={10} style={{ fontFamily: "monospace" }}>{fmtPct(pl_pct)}</text>
    </g>
  );
};

export function AllocationTreemap({ holdings }) {
  const stocks = (holdings || []).filter((h) => h.asset_type === "stock").map((h) => ({
    name: h.symbol, value: h.value, pl_pct: h.pl_pct,
  }));
  return (
    <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="allocation-treemap">
      <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-3">
        Stock Allocation · Green = gain, Red = loss, Size = position value
      </div>
      <div style={{ width: "100%", height: 260 }}>
        {stocks.length === 0 ? (
          <div className="text-gray-500 font-mono text-xs h-full flex items-center justify-center">
            No stock positions
          </div>
        ) : (
          <ResponsiveContainer>
            <Treemap
              data={stocks}
              dataKey="value"
              stroke="#0E131F"
              content={<TreemapCell />}
            />
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
