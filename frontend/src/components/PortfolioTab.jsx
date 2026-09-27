import { useEffect, useState, useRef } from "react";
import { api, fmtMoney, fmtPct, fmtNum, colorForPL, openStockModal } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Plus, Trash2, RefreshCw, Sparkles, Bitcoin, TrendingUp, TrendingDown, DollarSign, FileSpreadsheet, Info } from "lucide-react";
import { PortfolioHistoryChart, AllocationTreemap } from "@/components/PortfolioCharts";
import PortfolioRiskAuditor, { assetRole, computeDividendKPI } from "@/components/PortfolioRiskAuditor";
import AlphaReportCard from "@/components/AlphaReportCard";
import TradeActivityImporter from "@/components/TradeActivityImporter";

const fmtDate = (dStr) => {
  if (!dStr) return "—";
  try {
    const parts = dStr.split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return dStr;
  } catch {
    return dStr;
  }
};

const fmtHeldDuration = (dStr) => {
  if (!dStr) return "—";
  try {
    const parts = dStr.split("-");
    if (parts.length !== 3) return "—";
    const start = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const now = new Date();
    const diffMs = now - start;
    if (diffMs < 0) return "0d";
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 30) return `${diffDays}d`;
    const diffMonths = Math.floor(diffDays / 30.4375);
    if (diffMonths < 12) return `${diffMonths} mo`;
    const years = Math.floor(diffMonths / 12);
    const remMonths = diffMonths % 12;
    return remMonths > 0 ? `${years}y ${remMonths}mo` : `${years}y`;
  } catch {
    return "—";
  }
};

const AddHoldingForm = ({ onDone }) => {
  const [f, setF] = useState({ symbol: "", quantity: "", avg_cost: "", name: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.symbol || !f.quantity || !f.avg_cost) {
      toast.error("Symbol, quantity, and avg cost required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/portfolio/holdings", {
        symbol: f.symbol,
        quantity: parseFloat(f.quantity),
        avg_cost: parseFloat(f.avg_cost),
        name: f.name || null,
      });
      toast.success(`Added ${f.symbol.toUpperCase()}`);
      setF({ symbol: "", quantity: "", avg_cost: "", name: "" });
      onDone();
    } catch (e) {
      toast.error("Failed to add");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 pt-3 border-t border-[#222C3D] items-end">
      <div>
        <label htmlFor="add-symbol-input" className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
          Symbol
        </label>
        <input
          id="add-symbol-input"
          name="symbol"
          data-testid="add-symbol-input"
          placeholder="e.g. AAPL, BTC"
          value={f.symbol}
          onChange={(e) => setF({ ...f, symbol: e.target.value })}
          className="w-full bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs font-mono px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500"
        />
      </div>
      <div>
        <label htmlFor="add-quantity-input" className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
          Quantity
        </label>
        <input
          id="add-quantity-input"
          name="quantity"
          data-testid="add-quantity-input"
          placeholder="0.00"
          type="number"
          step="any"
          value={f.quantity}
          onChange={(e) => setF({ ...f, quantity: e.target.value })}
          className="w-full bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs font-mono px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500 tabular-nums"
        />
      </div>
      <div>
        <label htmlFor="add-cost-input" className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
          Avg Cost $
        </label>
        <input
          id="add-cost-input"
          name="avg_cost"
          data-testid="add-cost-input"
          placeholder="0.00"
          type="number"
          step="any"
          value={f.avg_cost}
          onChange={(e) => setF({ ...f, avg_cost: e.target.value })}
          className="w-full bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs font-mono px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500 tabular-nums"
        />
      </div>
      <div className="col-span-2 md:col-span-1">
        <label htmlFor="add-name-input" className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
          Name (optional)
        </label>
        <input
          id="add-name-input"
          name="name"
          data-testid="add-name-input"
          placeholder="Asset Name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="w-full bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500"
        />
      </div>
      <button
        data-testid="add-holding-submit"
        onClick={submit}
        disabled={busy}
        className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm disabled:opacity-50 flex items-center gap-1 justify-center transition-all active:scale-[0.97]"
      >
        <Plus className="w-3.5 h-3.5" /> Add
      </button>
    </div>
  );
};

const SummaryCard = ({ label, value, sub, subColor, icon: Icon, tooltip, onClick, className, testId }) => (
  <div
    onClick={onClick}
    className={`border border-[#222C3D] bg-[#121721] p-4 rounded-sm panel-raised transition-transform active:scale-[0.98] flex flex-col justify-between h-full relative ${
      onClick ? "cursor-pointer hover:border-gray-500" : ""
    } ${className || ""}`}
    data-testid={testId || `summary-${label.toLowerCase().replace(/\s/g, "-")}`}
  >
    {/* Row 1: Fixed single-line Metric Title */}
    <div className="h-5 flex items-center justify-between mb-2 gap-1.5 relative">
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[10px] font-mono tracking-widest text-gray-500 uppercase whitespace-nowrap truncate" title={label}>
          {label}
        </span>
        {tooltip && (
          <div className="relative group/tip flex items-center shrink-0">
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={typeof tooltip === "string" ? tooltip : "Info"}
              className="text-gray-500 hover:text-amber-400 focus:text-amber-400 focus:outline-none transition-colors p-0.5"
              data-testid="summary-card-info-btn"
            >
              <Info className="w-3 h-3 shrink-0" />
            </button>
            <div
              role="tooltip"
              data-testid="summary-card-tooltip"
              className="pointer-events-none absolute left-0 bottom-full mb-2 hidden group-hover/tip:block group-focus-within/tip:block z-50 w-64 p-2.5 text-[11px] font-mono text-gray-200 bg-[#0E131F] border border-[#222C3D] rounded shadow-2xl leading-relaxed whitespace-normal normal-case break-words animate-fadeIn"
            >
              <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1 text-[11px]">
                <Info className="w-3 h-3 text-amber-400 shrink-0" /> {label}
              </div>
              <div className="text-gray-300 text-[10.5px] leading-relaxed">
                {tooltip}
              </div>
              <div className="absolute top-full left-3 -mt-px border-4 border-transparent border-t-[#222C3D]" />
            </div>
          </div>
        )}
      </div>
      {Icon && <Icon className="w-4 h-4 text-gray-500 shrink-0" />}
    </div>

    {/* Row 2: Fixed baseline Metric Value */}
    <div className="h-8 flex items-baseline text-2xl font-mono font-bold text-gray-100 tabular-nums whitespace-nowrap truncate">
      {value}
    </div>

    {/* Row 3: Fixed starting offset Subscripts */}
    <div className="min-h-[2.5rem] flex flex-col justify-start mt-1">
      {sub ? (
        <div className={`text-xs font-mono leading-relaxed line-clamp-2 ${subColor || "text-gray-400"}`}>
          {sub}
        </div>
      ) : (
        <div className="text-xs font-mono text-gray-600">—</div>
      )}
    </div>
  </div>
);

export default function PortfolioTab() {
  const [data, setData] = useState({ holdings: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showTradeImporter, setShowTradeImporter] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sortBy, setSortBy] = useState({ key: "value", dir: "desc" });
  const [filter, setFilter] = useState("all");
  const fileRef = useRef(null);

  const load = async (isBackground = false) => {
    if (!isBackground && (!data.holdings || data.holdings.length === 0)) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const { data: res } = await api.get("/portfolio/holdings");
      setData(res);
    } catch (e) {
      if (!isBackground) toast.error("Failed to load portfolio");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data: r } = await api.post("/portfolio/upload-csv", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Imported ${r.count} positions`);
      load();
    } catch (e) {
      toast.error("CSV upload failed");
    }
  };

  const seedDemo = async () => {
    try {
      await api.post("/portfolio/seed-demo");
      toast.success("Loaded demo portfolio");
      load();
    } catch { toast.error("Seed failed"); }
  };

  const clearAll = async () => {
    setConfirmClear(false);
    try {
      await api.delete("/portfolio/holdings");
      toast.success("Cleared");
      load();
    } catch {
      toast.error("Failed to clear holdings");
    }
  };

  const delOne = async (id, sym) => {
    await api.delete(`/portfolio/holdings/${id}`);
    toast.success(`Removed ${sym}`);
    load();
  };

  const sortedFiltered = () => {
    let list = [...(data.holdings || [])];
    if (filter !== "all") list = list.filter((h) => h.asset_type === filter);
    const { key, dir } = sortBy;
    list.sort((a, b) => {
      let va = a[key] ?? 0, vb = b[key] ?? 0;
      if (key === "held_duration" || key === "date_of_purchase") {
        va = a.date_of_purchase || "";
        vb = b.date_of_purchase || "";
      }
      if (key === "xirr") {
        va = a.xirr ?? -999999;
        vb = b.xirr ?? -999999;
      }
      if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return dir === "asc" ? va - vb : vb - va;
    });
    return list;
  };

  const clickSort = (k) => {
    setSortBy((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  };

  const s = data.summary;
  const rows = sortedFiltered();

  return (
    <div data-testid="portfolio-tab" className="space-y-4">
      {/* Toolbar */}
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="text-xs font-mono tracking-widest uppercase text-amber-500">
              Positions & Allocation
            </div>
            <div className="text-[11px] text-gray-500 font-mono mt-0.5">
              Import Robinhood CSV export or add positions manually
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
              data-testid="csv-file-input"
            />
            <button
              onClick={() => setShowTradeImporter(true)}
              data-testid="from-trade-activity-button"
              className="flex items-center gap-1.5 border border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-black text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm font-semibold transition-all active:scale-[0.97]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> From Trade Activity
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              data-testid="upload-csv-button"
              className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all active:scale-[0.97]"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
            <button
              onClick={seedDemo}
              data-testid="seed-demo-button"
              className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all active:scale-[0.97]"
            >
              <Sparkles className="w-3.5 h-3.5" /> Load Demo
            </button>
            <button
              onClick={() => setShowAdd((x) => !x)}
              data-testid="toggle-add-button"
              className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all active:scale-[0.97]"
            >
              <Plus className="w-3.5 h-3.5" /> Manual
            </button>
            <button
              onClick={() => load(true)}
              data-testid="refresh-button"
              className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all active:scale-[0.97]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            {rows.length > 0 && (
              confirmClear ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={clearAll}
                    data-testid="confirm-clear-button"
                    className="flex items-center gap-1 border border-rose-600 bg-rose-950/80 text-rose-300 hover:bg-rose-900 text-xs uppercase tracking-wider px-2.5 py-1.5 rounded-sm font-semibold transition-all active:scale-[0.97]"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Confirm Clear?
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    data-testid="cancel-clear-button"
                    className="border border-[#222C3D] text-gray-400 hover:text-gray-200 text-xs uppercase tracking-wider px-2 py-1.5 rounded-sm transition-colors active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  data-testid="clear-all-button"
                  className="flex items-center gap-1.5 border border-rose-800 text-rose-500 hover:bg-rose-950 text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all active:scale-[0.97]"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              )
            )}
          </div>
        </div>
        {showAdd && <AddHoldingForm onDone={load} />}
      </div>

      {/* Summary */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="summary-grid">
          <SummaryCard
            label="Total Value"
            value={fmtMoney(s.total_value)}
            icon={DollarSign}
            sub={`${s.count} positions · ${s.stock_count} stocks · ${s.crypto_count} crypto`}
          />
          <SummaryCard
            label="Day P/L"
            value={`${s.day_change > 0 ? "▲ " : s.day_change < 0 ? "▼ " : ""}${fmtMoney(s.day_change)}`}
            sub={`${s.day_change_pct > 0 ? "▲ " : s.day_change_pct < 0 ? "▼ " : ""}${fmtPct(s.day_change_pct)}`}
            subColor={colorForPL(s.day_change)}
            icon={s.day_change >= 0 ? TrendingUp : TrendingDown}
          />
          <SummaryCard
            label="Total P/L"
            value={`${s.total_pl > 0 ? "▲ " : s.total_pl < 0 ? "▼ " : ""}${fmtMoney(s.total_pl)}`}
            sub={`${s.total_pl_pct > 0 ? "▲ " : s.total_pl_pct < 0 ? "▼ " : ""}${fmtPct(s.total_pl_pct)}`}
            subColor={colorForPL(s.total_pl)}
            icon={s.total_pl >= 0 ? TrendingUp : TrendingDown}
          />
          <SummaryCard
            label="Personal Return"
            testId="summary-personal-return"
            value={s.xirr != null ? fmtPct(s.xirr) : "—"}
            sub="Annualized (XIRR)"
            subColor={s.xirr != null ? colorForPL(s.xirr) : undefined}
            icon={s.xirr >= 0 ? TrendingUp : TrendingDown}
            tooltip="Personal Return (Money-Weighted / XIRR) calculates your annualized rate of return factoring in the exact timing and dollar amount of all deposits, withdrawals, and current portfolio balance."
          />
          <SummaryCard
            label="Cost Basis"
            value={fmtMoney(s.total_cost)}
            sub="lifetime capital deployed"
            icon={DollarSign}
          />
          {(() => {
            const div = computeDividendKPI(data.holdings || [], s.total_value, s.total_cost);
            return (
              <SummaryCard
                label="Annual Cash Flow"
                testId="summary-projected-annual-cash-flow"
                value={`${fmtMoney(div.annual)} / yr`}
                sub={`Est. Monthly: ${fmtMoney(div.monthly)} · Yield on Cost: ${div.yieldOnCost.toFixed(2)}%`}
                icon={DollarSign}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("terminus:switch-tab", { detail: { tab: "dividends" } }));
                }}
                className="cursor-pointer transition-transform active:scale-[0.98] hover:border-emerald-500/50"
              />
            );
          })()}
        </div>
      )}

      {/* Risk Auditor + Capital Efficiency */}
      {s && data.holdings?.length > 0 && (
        <>
          <AlphaReportCard />
          <PortfolioRiskAuditor holdings={data.holdings} summary={s} />
        </>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-3" data-testid="portfolio-charts">
        <PortfolioHistoryChart currentValue={s?.total_value} />
        <AllocationTreemap holdings={data.holdings || []} activeFilter={filter} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2" data-testid="filter-pills">
        {["all", "stock", "etf", "crypto"].map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            data-testid={`filter-${k}-button`}
            className={`text-xs uppercase tracking-widest font-mono px-3 py-1.5 rounded-sm border ${
              filter === k
                ? "border-amber-500 bg-amber-500/10 text-amber-500"
                : "border-[#222C3D] text-gray-400 hover:text-white hover:bg-[#161C26]"
            }`}
          >
            {k === "all" ? "All" : k === "stock" ? "Stocks" : k === "etf" ? "ETFs" : "Crypto"}
          </button>
        ))}
      </div>

      {/* Holdings Table */}
      {(() => {
        const hasDateOfPurchase = rows.some((h) => h.date_of_purchase);
        const colCount = (hasDateOfPurchase ? 13 : 11) + 1;
        const columns = [
          ["symbol", "SYMBOL"],
          ["asset_type", "TYPE"],
          ["role", "ASSET ROLE"],
          ["quantity", "QTY"],
          ["avg_cost", "AVG COST"],
          ...(hasDateOfPurchase
            ? [
                ["date_of_purchase", "FIRST BOUGHT"],
                ["held_duration", "HELD"],
              ]
            : []),
          ["price", "PRICE"],
          ["day_change_pct", "DAY %"],
          ["value", "VALUE"],
          ["pl", "P/L $"],
          ["pl_pct", "P/L %"],
          ["xirr", "XIRR %"],
        ];

        return (
          <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="holdings-table">
                <thead className="bg-[#0E131F] border-b border-[#222C3D]">
                  <tr className="text-left">
                    {columns.map(([k, l]) => (
                      <th
                        key={k}
                        scope="col"
                        onClick={() => k !== "role" && clickSort(k)}
                        data-testid={`sort-${k}`}
                        className={`px-3 py-2.5 font-mono text-[10px] tracking-widest text-gray-500 uppercase select-none ${
                          k !== "role" ? "cursor-pointer hover:text-amber-500" : ""
                        }`}
                      >
                        {l} {sortBy.key === k && (sortBy.dir === "asc" ? "▲" : "▼")}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={colCount} className="p-8 text-center text-gray-500 font-mono text-xs" data-testid="loading-row">
                        Loading positions...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={colCount} className="p-8 text-center text-gray-500 font-mono text-xs" data-testid="empty-row">
                        No positions. Import Robinhood Trade Activity, load the demo, or add manually.
                      </td>
                    </tr>
                  ) : (
                    rows.map((h) => {
                      const role = assetRole(h);
                      return (
                        <tr
                          key={h.id}
                          data-testid={`holding-row-${h.symbol}`}
                          className="border-b border-[#1A2232] hover:bg-[#161C26] transition-colors"
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {h.asset_type === "crypto" && <Bitcoin className="w-3.5 h-3.5 text-cyan-400" />}
                              <span
                                onClick={() => openStockModal(h.symbol)}
                                data-testid={`stock-trigger-${h.symbol}`}
                                className="font-mono font-bold text-amber-400 tracking-wider cursor-pointer hover:underline hover:text-amber-300 transition-colors"
                                title="Click to view full Bloomberg terminal security details"
                              >
                                {h.symbol}
                              </span>
                            </div>
                            {h.name && <div className="text-[10px] text-gray-500 truncate max-w-[160px]">{h.name}</div>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm border ${
                                h.asset_type === "crypto"
                                  ? "border-cyan-800 text-cyan-400 bg-cyan-950/40"
                                  : h.asset_type === "etf"
                                  ? "border-purple-800 text-purple-400 bg-purple-950/40"
                                  : "border-blue-800 text-blue-400 bg-blue-950/40"
                              }`}
                            >
                              {h.asset_type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${role.cls}`}
                              data-testid={`role-${h.symbol}`}
                            >
                              {role.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-gray-200 tabular-nums">{fmtNum(h.quantity, 4)}</td>
                          <td className="px-3 py-2.5 font-mono text-gray-400 tabular-nums">{fmtMoney(h.avg_cost)}</td>
                          {hasDateOfPurchase && (
                            <>
                              <td className="px-3 py-2.5 font-mono text-gray-300 text-[11px] tabular-nums" data-testid={`first-bought-${h.symbol}`}>
                                {fmtDate(h.date_of_purchase)}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-gray-400 text-[11px]" data-testid={`held-${h.symbol}`}>
                                {fmtHeldDuration(h.date_of_purchase)}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2.5 font-mono text-gray-100 font-semibold tabular-nums">
                            {fmtMoney(h.price)}
                            {!h.live && <span className="text-[9px] text-gray-500 ml-1">(cost)</span>}
                          </td>
                          <td className={`px-3 py-2.5 font-mono tabular-nums ${colorForPL(h.day_change_pct)}`} data-testid={`holding-day-change-${h.symbol}`}>
                            {h.day_change_pct > 0 ? "▲ " : h.day_change_pct < 0 ? "▼ " : ""}{fmtPct(h.day_change_pct)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-gray-100 font-semibold tabular-nums">
                            {fmtMoney(h.value)}
                          </td>
                          <td className={`px-3 py-2.5 font-mono tabular-nums ${colorForPL(h.pl)}`} data-testid={`holding-pl-${h.symbol}`}>
                            {h.pl > 0 ? "▲ " : h.pl < 0 ? "▼ " : ""}{fmtMoney(h.pl)}
                          </td>
                          <td className={`px-3 py-2.5 font-mono tabular-nums ${colorForPL(h.pl_pct)}`} data-testid={`holding-pl-pct-${h.symbol}`}>
                            {h.pl_pct > 0 ? "▲ " : h.pl_pct < 0 ? "▼ " : ""}{fmtPct(h.pl_pct)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-right tabular-nums" data-testid={`holding-xirr-${h.symbol}`}>
                            <span className={h.xirr != null ? colorForPL(h.xirr) : "text-gray-500"}>
                              {h.xirr != null ? `${h.xirr > 0 ? "▲ " : h.xirr < 0 ? "▼ " : ""}${fmtPct(h.xirr)}` : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => delOne(h.id, h.symbol)}
                              data-testid={`delete-${h.symbol}-button`}
                              className="text-gray-600 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <TradeActivityImporter
        isOpen={showTradeImporter}
        onClose={() => setShowTradeImporter(false)}
        onSuccess={() => load()}
      />
    </div>
  );
}
