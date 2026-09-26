import React, { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Calendar,
  TrendingUp,
  Clock,
  Sparkles,
  Layers,
  RotateCw,
  AlertTriangle,
} from "lucide-react";
import { api, fmtMoney, fmtPct, openStockModal } from "@/lib/api";

export default function DividendsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState("all"); // "all" | "upcoming" | "monthly"

  const fetchDividends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/portfolio/corporate-actions");
      setData(res.data);
    } catch (err) {
      console.error("Failed to load dividend data:", err);
      setError("Unable to retrieve dividend schedules and projected cash flows.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDividends();
  }, [fetchDividends]);

  const summary = data?.summary || {
    total_annual_income: 0,
    monthly_average_income: 0,
    portfolio_yield: 0,
    yield_on_cost: 0,
    dividend_paying_count: 0,
    total_holdings_count: 0,
  };

  const upcomingEvents = data?.upcoming_events || [];
  const monthlyFlows = data?.monthly_cash_flows || [];
  const maxMonthAmount = Math.max(...monthlyFlows.map((m) => m.amount || 0), 1);

  return (
    <div className="space-y-4" data-testid="dividends-tab-view">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#121721] border border-[#222C3D] rounded-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-mono text-sm sm:text-base font-bold tracking-wider uppercase text-gray-100 flex items-center gap-2">
              Dividends & Cash Flow Intelligence
            </h2>
            <p className="text-xs text-gray-400">
              Institutional ex-date schedule, 12-month projected distribution, and yield-on-cost analytics
            </p>
          </div>
        </div>

        {/* Sub-view switcher & controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 bg-[#0E131F] border border-[#222C3D] rounded-sm text-xs font-mono">
            {[
              { id: "all", label: "OVERVIEW" },
              { id: "upcoming", label: `EX-DATES (${upcomingEvents.length})` },
              { id: "monthly", label: "12-MO SCHEDULE" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                data-testid={`div-subtab-${tab.id}`}
                className={`px-3 py-1.5 rounded-sm transition-colors ${
                  activeSubTab === tab.id
                    ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchDividends}
            disabled={loading}
            data-testid="dividends-refresh-btn"
            className="p-2 rounded-sm border border-[#222C3D] bg-[#0E131F] hover:bg-[#1A2232] text-gray-400 hover:text-gray-200 transition-colors"
            title="Refresh dividend schedule"
          >
            <RotateCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-sm border border-rose-800 bg-rose-950/40 text-rose-300 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="dividends-summary-strip">
        <div className="p-3 rounded-sm bg-[#121721] border border-[#222C3D]">
          <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase flex items-center justify-between">
            <span>Annual Income</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-emerald-400 mt-1" data-testid="div-annual-income">
            {fmtMoney(summary.total_annual_income)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">projected 12-mo cash flow</div>
        </div>

        <div className="p-3 rounded-sm bg-[#121721] border border-[#222C3D]">
          <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase flex items-center justify-between">
            <span>Monthly Avg</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-gray-100 mt-1" data-testid="div-monthly-income">
            {fmtMoney(summary.monthly_average_income)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">average monthly payout</div>
        </div>

        <div className="p-3 rounded-sm bg-[#121721] border border-[#222C3D]">
          <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase flex items-center justify-between">
            <span>Portfolio Yield</span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-blue-400 mt-1" data-testid="div-portfolio-yield">
            {fmtPct(summary.portfolio_yield)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">weighted forward yield</div>
        </div>

        <div className="p-3 rounded-sm bg-[#121721] border border-[#222C3D]">
          <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase flex items-center justify-between">
            <span>Yield on Cost</span>
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-purple-400 mt-1" data-testid="div-yield-on-cost">
            {fmtPct(summary.yield_on_cost)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">on deployed capital basis</div>
        </div>

        <div className="col-span-2 md:col-span-1 p-3 rounded-sm bg-[#121721] border border-[#222C3D]">
          <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase flex items-center justify-between">
            <span>Dividend Assets</span>
            <Layers className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-gray-100 mt-1" data-testid="div-payer-count">
            {summary.dividend_paying_count} <span className="text-xs font-normal text-gray-500">/ {summary.total_holdings_count}</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">active dividend payers</div>
        </div>
      </div>

      {/* Upcoming Ex-Dividend Dates Schedule */}
      {(activeSubTab === "all" || activeSubTab === "upcoming") && (
        <div className="bg-[#121721] border border-[#222C3D] rounded-sm p-4">
          <div className="text-xs font-mono tracking-widest text-gray-400 uppercase mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-400" /> Upcoming Ex-Dividend Schedule & Payment Dates
            </span>
            <span className="text-[11px] text-gray-500 font-mono">
              {upcomingEvents.length} paying position{upcomingEvents.length === 1 ? "" : "s"}
            </span>
          </div>

          {upcomingEvents.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-gray-400 border border-dashed border-[#222C3D] rounded-sm">
              No dividend-paying equities or ETFs detected in your current portfolio holdings.
            </div>
          ) : (
            <div className="overflow-x-auto" data-testid="dividend-events-table">
              <table className="w-full text-xs">
                <thead className="bg-[#0E131F] border-b border-[#222C3D]">
                  <tr className="text-left text-[10px] font-mono tracking-wider text-gray-400 uppercase">
                    <th className="px-3 py-2.5">Symbol</th>
                    <th className="px-3 py-2.5">Ex-Dividend Date</th>
                    <th className="px-3 py-2.5">Payment Date</th>
                    <th className="px-3 py-2.5 text-right">Dividend / Share</th>
                    <th className="px-3 py-2.5 text-right">Est. Cash Flow</th>
                    <th className="px-3 py-2.5 text-right">Yield %</th>
                    <th className="px-3 py-2.5">Frequency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A2232] font-mono">
                  {upcomingEvents.map((evt) => {
                    const isUpcoming = evt.ex_dividend_date && evt.ex_dividend_date >= new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={evt.symbol} className="hover:bg-[#161C26] transition-colors">
                        <td className="px-3 py-3 font-bold text-amber-400">
                          <span
                            onClick={() => openStockModal(evt.symbol)}
                            data-testid={`div-trigger-${evt.symbol}`}
                            className="cursor-pointer hover:underline hover:text-amber-300 transition-colors text-sm"
                            title="Click to view security terminal details"
                          >
                            {evt.symbol}
                          </span>
                          <span className="text-[11px] font-normal text-gray-400 block truncate max-w-[160px]">
                            {evt.name}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {evt.ex_dividend_date ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] border ${
                                isUpcoming
                                  ? "text-emerald-300 bg-emerald-950/60 border-emerald-700/60 font-semibold"
                                  : "text-gray-300 bg-gray-900 border-gray-700"
                              }`}
                            >
                              {evt.ex_dividend_date}
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-300">
                          {evt.dividend_date ? evt.dividend_date : <span className="text-gray-500">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-200">
                          {fmtMoney(evt.amount_per_share)}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-emerald-400 text-sm">
                          {fmtMoney(evt.estimated_payout)}
                        </td>
                        <td className="px-3 py-3 text-right text-blue-400">
                          {fmtPct(evt.dividend_yield)}
                        </td>
                        <td className="px-3 py-3">
                          <span className="px-2 py-0.5 rounded-sm bg-[#1A2232] border border-[#222C3D] text-[10px] text-gray-300 uppercase tracking-wider">
                            {evt.payout_frequency}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 12-Month Projected Distribution Grid */}
      {(activeSubTab === "all" || activeSubTab === "monthly") && (
        <div className="bg-[#121721] border border-[#222C3D] rounded-sm p-4" data-testid="dividend-monthly-grid">
          <div className="text-xs font-mono tracking-widest text-gray-400 uppercase mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> 12-Month Projected Dividend Distribution
            </span>
            <span className="text-[11px] text-gray-500 font-mono">
              Monthly Average: {fmtMoney(summary.monthly_average_income)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-2.5">
            {monthlyFlows.map((flow) => {
              const pctHeight = Math.min(Math.round((flow.amount / maxMonthAmount) * 100), 100);
              const isCurrentMonth = new Date().getMonth() + 1 === flow.month_num;
              return (
                <div
                  key={flow.month}
                  className={`p-2.5 rounded-sm border transition-all flex flex-col justify-between ${
                    isCurrentMonth
                      ? "bg-[#161F2E] border-emerald-500/60 ring-1 ring-emerald-500/30"
                      : "bg-[#0E131F] border-[#222C3D]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[11px] font-mono font-bold ${isCurrentMonth ? "text-emerald-400" : "text-gray-400"}`}>
                      {flow.month}
                    </span>
                    {isCurrentMonth && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" title="Current Month" />
                    )}
                  </div>

                  <div className="font-mono text-xs font-bold text-emerald-400 mb-2">
                    {fmtMoney(flow.amount)}
                  </div>

                  {/* Micro progress bar */}
                  <div className="h-1.5 w-full bg-[#0A0D12] rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                      style={{ width: `${pctHeight}%` }}
                    />
                  </div>

                  {/* Payers badges */}
                  <div className="flex flex-wrap gap-1 min-h-[20px]">
                    {flow.payers && flow.payers.length > 0 ? (
                      flow.payers.slice(0, 3).map((p) => (
                        <span
                          key={p}
                          onClick={() => openStockModal(p)}
                          className="text-[9px] font-mono px-1 py-0.2 rounded-sm bg-[#1A2232] text-amber-300 border border-amber-900/40 cursor-pointer hover:underline"
                        >
                          {p}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] font-mono text-gray-600">—</span>
                    )}
                    {flow.payers && flow.payers.length > 3 && (
                      <span className="text-[9px] font-mono text-gray-500">
                        +{flow.payers.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
