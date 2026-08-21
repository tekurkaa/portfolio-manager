import { useEffect, useState, useRef } from "react";
import { api, fmtMoney, fmtPct, fmtNum, colorForPL } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Plus, Trash2, RefreshCw, Sparkles, Bitcoin, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { PortfolioHistoryChart, AllocationTreemap } from "@/components/PortfolioCharts";

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
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 pt-3 border-t border-[#222C3D]">
      <input
        data-testid="add-symbol-input"
        placeholder="SYMBOL (e.g. AAPL, BTC)"
        value={f.symbol}
        onChange={(e) => setF({ ...f, symbol: e.target.value })}
        className="bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs font-mono px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500"
      />
      <input
        data-testid="add-quantity-input"
        placeholder="QUANTITY"
        type="number"
        step="any"
        value={f.quantity}
        onChange={(e) => setF({ ...f, quantity: e.target.value })}
        className="bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs font-mono px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500"
      />
      <input
        data-testid="add-cost-input"
        placeholder="AVG COST $"
        type="number"
        step="any"
        value={f.avg_cost}
        onChange={(e) => setF({ ...f, avg_cost: e.target.value })}
        className="bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs font-mono px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500"
      />
      <input
        data-testid="add-name-input"
        placeholder="NAME (optional)"
        value={f.name}
        onChange={(e) => setF({ ...f, name: e.target.value })}
        className="bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500 col-span-2 md:col-span-1"
      />
      <button
        data-testid="add-holding-submit"
        onClick={submit}
        disabled={busy}
        className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm disabled:opacity-50 flex items-center gap-1 justify-center"
      >
        <Plus className="w-3.5 h-3.5" /> Add
      </button>
    </div>
  );
};

const SummaryCard = ({ label, value, sub, subColor, icon: Icon }) => (
  <div
    className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm"
    data-testid={`summary-${label.toLowerCase().replace(/\s/g, "-")}`}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">{label}</span>
      {Icon && <Icon className="w-4 h-4 text-gray-500" />}
    </div>
    <div className="text-2xl font-mono font-bold text-gray-100">{value}</div>
    {sub && <div className={`text-xs font-mono mt-1 ${subColor || "text-gray-400"}`}>{sub}</div>}
  </div>
);

export default function PortfolioTab() {
  const [data, setData] = useState({ holdings: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [sortBy, setSortBy] = useState({ key: "value", dir: "desc" });
  const [filter, setFilter] = useState("all");
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get("/portfolio/holdings");
      setData(data);
    } catch (e) {
      toast.error("Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
    if (!window.confirm("Delete all holdings?")) return;
    await api.delete("/portfolio/holdings");
    toast.success("Cleared");
    load();
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
      const va = a[key] ?? 0, vb = b[key] ?? 0;
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
              onClick={() => fileRef.current?.click()}
              data-testid="upload-csv-button"
              className="flex items-center gap-1.5 border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm font-semibold transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
            <button
              onClick={seedDemo}
              data-testid="seed-demo-button"
              className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm"
            >
              <Sparkles className="w-3.5 h-3.5" /> Load Demo
            </button>
            <button
              onClick={() => setShowAdd((x) => !x)}
              data-testid="toggle-add-button"
              className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Manual
            </button>
            <button
              onClick={load}
              data-testid="refresh-button"
              className="flex items-center gap-1.5 border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            {rows.length > 0 && (
              <button
                onClick={clearAll}
                data-testid="clear-all-button"
                className="flex items-center gap-1.5 border border-rose-800 text-rose-500 hover:bg-rose-950 text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        </div>
        {showAdd && <AddHoldingForm onDone={load} />}
      </div>

      {/* Summary */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="summary-grid">
          <SummaryCard
            label="Total Value"
            value={fmtMoney(s.total_value)}
            icon={DollarSign}
            sub={`${s.count} positions · ${s.stock_count} stocks · ${s.crypto_count} crypto`}
          />
          <SummaryCard
            label="Day P/L"
            value={fmtMoney(s.day_change)}
            sub={fmtPct(s.day_change_pct)}
            subColor={colorForPL(s.day_change)}
            icon={s.day_change >= 0 ? TrendingUp : TrendingDown}
          />
          <SummaryCard
            label="Total P/L"
            value={fmtMoney(s.total_pl)}
            sub={fmtPct(s.total_pl_pct)}
            subColor={colorForPL(s.total_pl)}
            icon={s.total_pl >= 0 ? TrendingUp : TrendingDown}
          />
          <SummaryCard
            label="Cost Basis"
            value={fmtMoney(s.total_cost)}
            sub="lifetime capital deployed"
          />
        </div>
      )}

      {/* Charts */}
      {rows.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-3" data-testid="portfolio-charts">
          <PortfolioHistoryChart />
          <AllocationTreemap holdings={data.holdings || []} />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2" data-testid="filter-pills">
        {["all", "stock", "crypto"].map((k) => (
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
            {k === "all" ? "All" : k === "stock" ? "Stocks" : "Crypto"}
          </button>
        ))}
      </div>

      {/* Holdings Table */}
      <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="holdings-table">
            <thead className="bg-[#0E131F] border-b border-[#222C3D]">
              <tr className="text-left">
                {[
                  ["symbol", "SYMBOL"],
                  ["asset_type", "TYPE"],
                  ["quantity", "QTY"],
                  ["avg_cost", "AVG COST"],
                  ["price", "PRICE"],
                  ["day_change_pct", "DAY %"],
                  ["value", "VALUE"],
                  ["pl", "P/L $"],
                  ["pl_pct", "P/L %"],
                ].map(([k, l]) => (
                  <th
                    key={k}
                    onClick={() => clickSort(k)}
                    data-testid={`sort-${k}`}
                    className="px-3 py-2.5 font-mono text-[10px] tracking-widest text-gray-500 uppercase cursor-pointer hover:text-amber-500 select-none"
                  >
                    {l} {sortBy.key === k && (sortBy.dir === "asc" ? "▲" : "▼")}
                  </th>
                ))}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-500 font-mono text-xs" data-testid="loading-row">
                    Loading positions...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-500 font-mono text-xs" data-testid="empty-row">
                    No positions. Import a Robinhood CSV, load the demo, or add manually.
                  </td>
                </tr>
              ) : (
                rows.map((h) => (
                  <tr
                    key={h.id}
                    data-testid={`holding-row-${h.symbol}`}
                    className="border-b border-[#1A2232] hover:bg-[#161C26] transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {h.asset_type === "crypto" && <Bitcoin className="w-3.5 h-3.5 text-cyan-400" />}
                        <span className="font-mono font-bold text-amber-400 tracking-wider">{h.symbol}</span>
                      </div>
                      {h.name && <div className="text-[10px] text-gray-500 truncate max-w-[160px]">{h.name}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm border ${
                          h.asset_type === "crypto"
                            ? "border-cyan-800 text-cyan-400 bg-cyan-950/40"
                            : "border-blue-800 text-blue-400 bg-blue-950/40"
                        }`}
                      >
                        {h.asset_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-200">{fmtNum(h.quantity, 4)}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-400">{fmtMoney(h.avg_cost)}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-100 font-semibold">
                      {fmtMoney(h.price)}
                      {!h.live && <span className="text-[9px] text-gray-500 ml-1">(cost)</span>}
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${colorForPL(h.day_change_pct)}`}>{fmtPct(h.day_change_pct)}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-100 font-semibold">{fmtMoney(h.value)}</td>
                    <td className={`px-3 py-2.5 font-mono ${colorForPL(h.pl)}`}>{fmtMoney(h.pl)}</td>
                    <td className={`px-3 py-2.5 font-mono ${colorForPL(h.pl_pct)}`}>{fmtPct(h.pl_pct)}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
