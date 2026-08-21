import { useEffect, useState } from "react";
import { api, fmtMoney, fmtPct, colorForPL } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Treemap } from "recharts";

const RANGES = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "ALL"];

const fmtT = (t) => {
  const d = new Date(t);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
};

export function PortfolioHistoryChart() {
  const [range, setRange] = useState("1M");
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

  const up = (data?.change ?? 0) >= 0;
  const stroke = up ? "#10B981" : "#EF4444";

  return (
    <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="portfolio-history-chart">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">Portfolio Value · {range}</div>
          {data && (
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-2xl font-mono font-bold text-gray-100">{fmtMoney(data.end_value)}</span>
              <span className={`text-sm font-mono ${colorForPL(data.change)}`}>
                {data.change >= 0 ? "+" : ""}{fmtMoney(data.change)} ({fmtPct(data.change_pct)})
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              data-testid={`range-${r}`}
              className={`text-[11px] font-mono px-2 py-1 rounded-sm border ${
                range === r
                  ? "border-amber-500 text-amber-500 bg-amber-500/10"
                  : "border-[#222C3D] text-gray-400 hover:text-white hover:bg-[#161C26]"
              }`}
            >{r}</button>
          ))}
        </div>
      </div>
      <div style={{ width: "100%", height: 260 }}>
        {loading ? (
          <div className="text-gray-500 font-mono text-xs h-full flex items-center justify-center">Loading history...</div>
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
                tickFormatter={fmtT} minTickGap={40} axisLine={{ stroke: "#222C3D" }} tickLine={false} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 10, fontFamily: "monospace" }}
                domain={["auto", "auto"]} axisLine={{ stroke: "#222C3D" }} tickLine={false}
                tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} width={55} />
              <Tooltip
                contentStyle={{ background: "#0E131F", border: "1px solid #222C3D", fontFamily: "monospace", fontSize: 11 }}
                labelStyle={{ color: "#9CA3AF" }}
                itemStyle={{ color: "#F3F4F6" }}
                formatter={(v) => [fmtMoney(v), "Value"]}
                labelFormatter={fmtT}
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
