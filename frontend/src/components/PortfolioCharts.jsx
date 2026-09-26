import { useEffect, useState, useRef } from "react";
import { api, fmtMoney, fmtPct, colorForPL, openStockModal } from "@/lib/api";
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

const fmtChartDateTick = (t, range) => {
  if (!t) return "";
  const d = new Date(t);
  if (isNaN(d.getTime())) return "";

  switch (range) {
    case "1D":
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    case "1W":
      return d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
    case "1M":
    case "3M":
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    case "YTD":
    case "1Y":
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    case "5Y":
    case "ALL":
      return d.toLocaleDateString([], { month: "short", year: "2-digit" });
    default:
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
};

const fmtChartTooltipDate = (t, range) => {
  if (!t) return "";
  const d = new Date(t);
  if (isNaN(d.getTime())) return "";

  if (range === "1D" || range === "1W") {
    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const CustomPortfolioTooltip = ({ active, payload, label, range }) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    return (
      <div
        data-testid="chart-custom-tooltip"
        className="bg-[#0E131F]/95 backdrop-blur-md border border-[#222C3D] shadow-2xl rounded px-3 py-2 text-xs font-mono"
      >
        <div className="text-amber-500 font-bold mb-1">
          {fmtChartTooltipDate(label, range)}
        </div>
        <div className="text-gray-200 flex items-center justify-between gap-4">
          <span className="text-gray-400">Value:</span>
          <span className="font-semibold text-white tabular-nums">{fmtMoney(val)}</span>
        </div>
      </div>
    );
  }
  return null;
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
        {loading && !data?.points?.length ? (
          <div
            data-testid="chart-skeleton"
            className="w-full h-full flex flex-col justify-between p-4 bg-[#0E131F]/50 rounded-sm animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="h-6 w-32 bg-[#222C3D] rounded-sm"></div>
              <div className="h-4 w-20 bg-[#222C3D] rounded-sm"></div>
            </div>
            <div className="h-32 w-full bg-[#161C26] rounded-sm border border-[#222C3D]/50 flex items-center justify-center">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                Synthesizing historical telemetry...
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <div className="h-3 w-12 bg-[#222C3D] rounded-sm"></div>
              <div className="h-3 w-12 bg-[#222C3D] rounded-sm"></div>
              <div className="h-3 w-12 bg-[#222C3D] rounded-sm"></div>
              <div className="h-3 w-12 bg-[#222C3D] rounded-sm"></div>
            </div>
          </div>
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
              <XAxis
                dataKey="t"
                tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "monospace" }}
                tickFormatter={(t) => fmtChartDateTick(t, range)}
                minTickGap={45}
                axisLine={{ stroke: "#222C3D" }}
                tickLine={{ stroke: "#374151" }}
                tickMargin={6}
                height={26}
              />
              <YAxis
                tick={{ fill: "#6B7280", fontSize: 10, fontFamily: "monospace" }}
                domain={["auto", "auto"]}
                axisLine={{ stroke: "#222C3D" }}
                tickLine={false}
                tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`}
                width={55}
              />
              <Tooltip content={(props) => <CustomPortfolioTooltip {...props} range={range} />} isAnimationActive={false} />
              <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} dot={false} fill="url(#gradVal)" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const TreemapCell = (props) => {
  const { x, y, width, height, onHover, onLeave } = props;
  if (!width || !height || width <= 0 || height <= 0) return null;

  const payload = props.payload || {};
  const name = props.name || payload.name || payload.symbol || "";
  const companyName = props.companyName || payload.companyName || payload.name || "";
  const value = props.actualValue ?? payload.actualValue ?? (props.value !== undefined ? props.value : payload.value);
  const pl_pct = props.pl_pct !== undefined ? props.pl_pct : payload.pl_pct;
  const weight_pct = props.weight_pct !== undefined ? props.weight_pct : payload.weight_pct;

  const itemData = {
    name,
    companyName,
    value,
    pl_pct,
    weight_pct,
  };

  const up = (pl_pct ?? 0) >= 0;
  const fill = up ? "rgba(16,185,129,0.85)" : "rgba(239,68,68,0.85)";

  // Adaptive orientation: when tile is tall and narrow, switch to vertical rotated text
  const isVertical = width < 34 && height >= 40;
  const showHorizontalText = width >= 30 && height >= 22;
  const showPct = width >= 44 && height >= 38;

  const hFontSize = Math.max(9, Math.min(Math.floor(width / 5), 15));
  const vFontSize = Math.max(8, Math.min(Math.floor(width * 0.6), 11));

  return (
    <g
      onClick={() => {
        if (name && !name.startsWith("OTHER")) {
          openStockModal(name);
        }
      }}
      onMouseEnter={(e) => onHover?.(itemData, e)}
      onMouseMove={(e) => onHover?.(itemData, e)}
      onMouseLeave={() => onLeave?.()}
      data-testid={`treemap-cell-${name}`}
      style={{ cursor: name.startsWith("OTHER") ? "default" : "pointer" }}
    >
      <title>{`${name}${companyName && companyName !== name ? ` (${companyName})` : ""}: $${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${(pl_pct ?? 0) >= 0 ? "+" : ""}${Number(pl_pct ?? 0).toFixed(2)}%) · Click to view security terminal`}</title>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        stroke="#0E131F"
        strokeWidth={2}
        fill={fill}
        rx={2}
        className="transition-colors hover:brightness-110"
      />
      {isVertical ? (
        <text
          x={x + width / 2}
          y={y + height / 2}
          transform={`rotate(-90, ${x + width / 2}, ${y + height / 2})`}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#0A0D12"
          fontSize={vFontSize}
          fontWeight="bold"
          data-testid={`treemap-label-${name}`}
          style={{ fontFamily: "monospace", pointerEvents: "none" }}
        >
          {name}
        </text>
      ) : showHorizontalText ? (
        <>
          <text
            x={x + width / 2}
            y={showPct ? y + height / 2 - 4 : y + height / 2 + 4}
            textAnchor="middle"
            fill="#0A0D12"
            fontSize={hFontSize}
            fontWeight="bold"
            data-testid={`treemap-label-${name}`}
            style={{ fontFamily: "monospace", pointerEvents: "none" }}
          >
            {name}
          </text>
          {showPct && (
            <text
              x={x + width / 2}
              y={y + height / 2 + 11}
              textAnchor="middle"
              fill="#0A0D12"
              fontSize={10}
              fontWeight="600"
              style={{ fontFamily: "monospace", pointerEvents: "none" }}
            >
              {fmtPct(pl_pct)}
            </text>
          )}
        </>
      ) : (
        <text
          x={x + width / 2}
          y={y + height / 2 + 3}
          textAnchor="middle"
          fill="#0A0D12"
          fontSize={8}
          fontWeight="bold"
          data-testid={`treemap-label-${name}`}
          style={{ fontFamily: "monospace", pointerEvents: "none" }}
        >
          {name.slice(0, 3)}
        </text>
      )}
    </g>
  );
};

export function AllocationTreemap({ holdings, activeFilter = "all" }) {
  const containerRef = useRef(null);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleHover = (item, e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = (e.clientX || 0) - rect.left;
    const mouseY = (e.clientY || 0) - rect.top;
    setHoveredItem(item);

    // Smart boundary offset: flip left/up if cursor is close to the container edges
    const tipWidth = 195;
    const tipHeight = 72;
    const posX = mouseX + tipWidth + 16 > rect.width ? Math.max(8, mouseX - tipWidth - 14) : mouseX + 16;
    const posY = mouseY + tipHeight + 12 > rect.height ? Math.max(8, mouseY - tipHeight - 10) : Math.max(8, mouseY - 25);

    setMousePos({ x: posX, y: posY });
  };

  const handleLeave = () => {
    setHoveredItem(null);
  };

  const filtered = (holdings || []).filter((h) => {
    if (!h || !h.symbol) return false;
    if (activeFilter && activeFilter !== "all") {
      return (h.asset_type || "stock") === activeFilter;
    }
    return true;
  });

  const totalPortfolioVal = filtered.reduce((acc, h) => {
    const val = Number(h.value ?? (h.quantity * (h.price ?? h.avg_cost ?? 0)));
    return acc + (val > 0 ? val : 0);
  }, 0);

  const rawItems = filtered
    .map((h) => {
      const val = Number(h.value ?? (h.quantity * (h.price ?? h.avg_cost ?? 0)));
      return {
        name: h.symbol,
        companyName: h.name || h.symbol,
        value: val > 0 ? Number(val.toFixed(2)) : 0.01,
        pl_pct: h.pl_pct ?? 0,
        asset_type: h.asset_type || "stock",
        quantity: h.quantity,
        price: h.price ?? h.avg_cost ?? 0,
        weight_pct: totalPortfolioVal > 0 && val > 0 ? (val / totalPortfolioVal) * 100 : 0,
      };
    })
    .filter((item) => item.value > 0);

  // Group micro-allocations (< 1.0% of portfolio) into "OTHER (<1%)" to prevent squishing & distortion
  const mainItems = [];
  const microItems = [];
  rawItems.forEach((item) => {
    if (totalPortfolioVal > 0 && item.weight_pct < 1.0) {
      microItems.push(item);
    } else {
      mainItems.push(item);
    }
  });

  const items = [...mainItems];
  if (microItems.length > 0) {
    const microTotalVal = microItems.reduce((acc, it) => acc + it.value, 0);
    const weightedPl = microItems.reduce((acc, it) => acc + (it.pl_pct * (it.value / (microTotalVal || 1))), 0);
    const microWeight = totalPortfolioVal > 0 ? (microTotalVal / totalPortfolioVal) * 100 : 0;
    const visualFloor = totalPortfolioVal > 0 ? totalPortfolioVal * 0.05 : 1;
    items.push({
      name: "OTHER (<1%)",
      companyName: `${microItems.length} Micro Positions (${microItems.map((m) => m.name).join(", ")})`,
      actualValue: Number(microTotalVal.toFixed(2)),
      value: Math.max(Number(microTotalVal.toFixed(2)), visualFloor),
      pl_pct: weightedPl,
      asset_type: "other",
      quantity: microItems.length,
      price: microTotalVal,
      weight_pct: microWeight,
    });
  }

  const titleText =
    activeFilter === "stock"
      ? "Stock Allocation"
      : activeFilter === "etf"
      ? "ETF Allocation"
      : activeFilter === "crypto"
      ? "Crypto Allocation"
      : "Portfolio Allocation";

  const emptyText =
    activeFilter === "stock"
      ? "No stock positions"
      : activeFilter === "etf"
      ? "No ETF positions"
      : activeFilter === "crypto"
      ? "No crypto positions"
      : "No positions to display";

  return (
    <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4 relative" data-testid="allocation-treemap">
      <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-3">
        {titleText} · Green = gain, Red = loss, Size = position value
      </div>
      <div
        ref={containerRef}
        className="w-full relative h-[320px] sm:h-[340px]"
        data-testid="treemap-container"
        onMouseLeave={handleLeave}
      >
        {items.length === 0 ? (
          <div className="text-gray-500 font-mono text-xs h-full flex items-center justify-center">
            {emptyText}
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={items}
                dataKey="value"
                stroke="#0E131F"
                aspectRatio={4 / 3}
                content={<TreemapCell onHover={handleHover} onLeave={handleLeave} />}
              />
            </ResponsiveContainer>
            {hoveredItem && (
              <div
                data-testid="treemap-hover-hud"
                className="absolute z-30 pointer-events-none bg-[#0E131F]/95 backdrop-blur-md border border-[#222C3D] shadow-2xl rounded px-3 py-2 text-xs font-mono transition-all duration-75"
                style={{
                  left: mousePos.x,
                  top: mousePos.y,
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <span className="font-bold text-amber-500 text-sm">{hoveredItem.name}</span>
                  <span
                    className={`text-[10px] font-semibold px-1 py-0.5 rounded ${
                      (hoveredItem.pl_pct ?? 0) >= 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-rose-500/15 text-rose-400"
                    }`}
                  >
                    {(hoveredItem.pl_pct ?? 0) >= 0 ? "+" : ""}
                    {Number(hoveredItem.pl_pct || 0).toFixed(2)}%
                  </span>
                </div>
                {hoveredItem.companyName && hoveredItem.companyName !== hoveredItem.name && (
                  <div className="text-[11px] text-gray-300 truncate max-w-[180px] mb-1 font-sans">
                    {hoveredItem.companyName}
                  </div>
                )}
                <div className="flex items-center justify-between text-gray-400 text-[10px] pt-1 border-t border-[#1C2533] gap-4">
                  <span>
                    VAL:{" "}
                    <span className="text-gray-100 font-semibold">
                      ${Number(hoveredItem.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                  {hoveredItem.weight_pct > 0 && (
                    <span>
                      WT: <span className="text-gray-100 font-semibold">{Number(hoveredItem.weight_pct).toFixed(1)}%</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

