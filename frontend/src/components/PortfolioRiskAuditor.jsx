import { fmtMoney, fmtPct } from "@/lib/api";
import { ShieldAlert, ShieldCheck, Scale, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

// Symbol -> sector map (common S&P + crypto)
const SECTOR_MAP = {
  AAPL: "Tech", MSFT: "Tech", GOOGL: "Tech", GOOG: "Tech", META: "Tech", NVDA: "Tech",
  AMD: "Tech", AVGO: "Tech", ORCL: "Tech", CRM: "Tech", ADBE: "Tech", INTC: "Tech",
  QCOM: "Tech", MU: "Tech", PLTR: "Tech", ARM: "Tech", SMCI: "Tech", TSM: "Tech", ASML: "Tech",
  AMZN: "Consumer", TSLA: "Consumer", HD: "Consumer", NKE: "Consumer", MCD: "Consumer",
  WMT: "Consumer", COST: "Consumer", DIS: "Consumer", NFLX: "Consumer",
  JPM: "Finance", BAC: "Finance", GS: "Finance", MS: "Finance", V: "Finance", MA: "Finance",
  BRK: "Finance", C: "Finance", WFC: "Finance", SCHW: "Finance", COIN: "Finance", HOOD: "Finance",
  XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy", OXY: "Energy",
  LLY: "Healthcare", UNH: "Healthcare", JNJ: "Healthcare", PFE: "Healthcare", MRK: "Healthcare",
  ABBV: "Healthcare", MRNA: "Healthcare", BNTX: "Healthcare", REGN: "Healthcare", VRTX: "Healthcare",
};

// Approx dividend yields (%)
const DIV_YIELDS = {
  AAPL: 0.44, MSFT: 0.72, JPM: 2.20, KO: 3.00, PEP: 3.10, XOM: 3.30, CVX: 4.10,
  T: 6.50, VZ: 6.30, PG: 2.40, JNJ: 3.00, PFE: 6.10, MRK: 2.50, WMT: 1.30,
  HD: 2.30, MCD: 2.20, V: 0.75, MA: 0.55, ABBV: 3.60, LLY: 0.60, UNH: 1.50,
  NKE: 1.90, DIS: 0.90, BAC: 2.60, WFC: 2.60, C: 3.40, GS: 2.20, MS: 3.30,
};
const DEFAULT_STOCK_YIELD = 1.5;

const isCrypto = (h) => h.asset_type === "crypto";

const sectorFor = (h) => {
  if (isCrypto(h)) return "Crypto";
  const sym = (h.symbol || "").replace("-USD", "").toUpperCase();
  return SECTOR_MAP[sym] || "Other";
};

const divYieldFor = (h) => {
  if (isCrypto(h)) return 0;
  const sym = (h.symbol || "").toUpperCase();
  return DIV_YIELDS[sym] ?? DEFAULT_STOCK_YIELD;
};

export function assetRole(h) {
  if (isCrypto(h)) return { label: "Web3 / Digital Asset", cls: "text-cyan-400 border-cyan-800 bg-cyan-950/40" };
  if ((h.pl_pct ?? 0) <= -12) return { label: "Drawdown Watch", cls: "text-rose-400 border-rose-800 bg-rose-950/40" };
  if ((h.pl_pct ?? 0) >= 30) return { label: "Core Alpha Gainer", cls: "text-emerald-400 border-emerald-800 bg-emerald-950/40" };
  return { label: "Core Stability", cls: "text-amber-400 border-amber-800 bg-amber-950/40" };
}

export function computeDividendKPI(holdings, totalValue, totalCost) {
  let annual = 0;
  let weightedYield = 0;
  for (const h of holdings) {
    const y = divYieldFor(h);
    annual += (h.value || 0) * (y / 100);
    weightedYield += (h.value || 0) * y;
  }
  const blended = totalValue ? weightedYield / totalValue : 0;
  const yoc = totalCost ? (annual / totalCost) * 100 : 0;
  return { annual, monthly: annual / 12, blendedYield: blended, yieldOnCost: yoc };
}

export default function PortfolioRiskAuditor({ holdings, summary }) {
  if (!holdings || !holdings.length || !summary) return null;
  const totalValue = summary.total_value || 0;

  // 5/20 concentration checks
  const overExposed = holdings
    .map((h) => ({ symbol: h.symbol, pct: totalValue ? (h.value / totalValue) * 100 : 0 }))
    .filter((x) => x.pct > 5)
    .sort((a, b) => b.pct - a.pct);

  const sectorTotals = {};
  for (const h of holdings) {
    const s = sectorFor(h);
    sectorTotals[s] = (sectorTotals[s] || 0) + (h.value || 0);
  }
  const sectorPcts = Object.entries(sectorTotals)
    .map(([s, v]) => ({ sector: s, pct: totalValue ? (v / totalValue) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const overweightSectors = sectorPcts.filter((s) => s.pct > 20);

  // Health score
  let health = 100;
  overExposed.forEach((x) => (health -= Math.min(20, (x.pct - 5) * 2)));
  overweightSectors.forEach((x) => (health -= Math.min(20, (x.pct - 20) * 1.5)));
  const drawdowns = holdings.filter((h) => (h.pl_pct ?? 0) < -12);
  health -= drawdowns.length * 5;
  health = Math.max(0, Math.min(100, Math.round(health)));
  const healthColor = health >= 75 ? "text-emerald-400" : health >= 50 ? "text-amber-400" : "text-rose-400";
  const healthRing = health >= 75 ? "border-emerald-500" : health >= 50 ? "border-amber-500" : "border-rose-500";

  // Capital efficiency
  const trimmable = holdings.filter((h) => (h.pl_pct ?? 0) <= -12);
  const profitTakers = holdings.filter((h) => (h.pl_pct ?? 0) >= 30);
  const balanced = trimmable.length === 0 && profitTakers.length === 0;

  return (
    <div className="space-y-3" data-testid="portfolio-risk-auditor">
      {/* Risk & Diversification */}
      <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="risk-auditor-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">
              Portfolio Risk & Diversification Auditor
            </span>
          </div>
          <div className={`shrink-0 w-14 h-14 rounded-full border-2 ${healthRing} flex flex-col items-center justify-center`} data-testid="health-score">
            <span className={`text-lg font-mono font-bold ${healthColor} leading-none`}>{health}</span>
            <span className="text-[8px] font-mono text-gray-500 tracking-widest mt-0.5">HEALTH</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-2">
          {/* 5% single-asset */}
          <div className="border border-[#222C3D] bg-[#0E131F] rounded-sm p-3">
            <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-2 flex items-center gap-1">
              <Scale className="w-3 h-3" /> 5% Rule · Single Asset
            </div>
            {overExposed.length === 0 ? (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-sm border text-emerald-400 border-emerald-800 bg-emerald-950/40" data-testid="conc-ok">
                <ShieldCheck className="w-3 h-3" /> Single Asset Concentration Safe (&lt; 5.0%)
              </div>
            ) : (
              <div className="space-y-1" data-testid="conc-warn">
                {overExposed.map((x) => (
                  <div key={x.symbol} className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-sm border text-amber-300 border-amber-700 bg-amber-950/40 mr-1">
                    <AlertTriangle className="w-3 h-3" /> High Exposure: <span className="font-bold text-amber-400">{x.symbol}</span> is {x.pct.toFixed(1)}% (max 5.0%)
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 20% sector */}
          <div className="border border-[#222C3D] bg-[#0E131F] rounded-sm p-3">
            <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-2 flex items-center gap-1">
              <Scale className="w-3 h-3" /> 20% Rule · Sector Balance
            </div>
            {overweightSectors.length === 0 ? (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-sm border text-emerald-400 border-emerald-800 bg-emerald-950/40" data-testid="sector-ok">
                <ShieldCheck className="w-3 h-3" /> Sector Diversification Optimal
              </div>
            ) : (
              <div className="space-y-1" data-testid="sector-warn">
                {overweightSectors.map((x) => (
                  <div key={x.sector} className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-sm border text-amber-300 border-amber-700 bg-amber-950/40 mr-1">
                    <AlertTriangle className="w-3 h-3" /> Sector Overweight: <span className="font-bold text-amber-400">{x.sector}</span> is {x.pct.toFixed(1)}% (max 20.0%)
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {sectorPcts.map((s) => (
                <span key={s.sector} className="text-[10px] font-mono px-1.5 py-0.5 border border-[#222C3D] text-gray-400 rounded-sm bg-[#121721]">
                  {s.sector} {s.pct.toFixed(1)}%
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Capital Efficiency */}
      <div className="border border-[#222C3D] bg-[#121721] rounded-sm p-4" data-testid="capital-efficiency-card">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="w-4 h-4 text-rose-400" />
          <span className="text-[10px] font-mono tracking-widest text-rose-400 uppercase">
            Capital Efficiency & Drawdown Monitor
          </span>
        </div>
        {balanced ? (
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-sm border text-emerald-400 border-emerald-800 bg-emerald-950/40" data-testid="capital-ok">
            <ShieldCheck className="w-3 h-3" /> Capital Allocation Efficient · No Severe Drawdowns Detected
          </div>
        ) : (
          <div className="space-y-2">
            {trimmable.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="trimmable-table">
                  <thead className="bg-[#0E131F] border-b border-[#222C3D]">
                    <tr className="text-left">
                      {["SYMBOL","TRAPPED CAPITAL","UNREALIZED LOSS","P/L %","ACTION"].map((h) => (
                        <th key={h} className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trimmable.map((h) => (
                      <tr key={h.symbol} className="border-b border-[#1A2232]">
                        <td className="px-3 py-2 font-mono font-bold text-amber-400">{h.symbol}</td>
                        <td className="px-3 py-2 font-mono text-gray-200">{fmtMoney(h.value)}</td>
                        <td className="px-3 py-2 font-mono text-rose-400">{fmtMoney(h.pl)}</td>
                        <td className="px-3 py-2 font-mono text-rose-400">{fmtPct(h.pl_pct)}</td>
                        <td className="px-3 py-2">
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-sm border text-rose-400 border-rose-800 bg-rose-950/40">
                            Consider Trimming / Tax-Loss Harvesting
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {profitTakers.length > 0 && (
              <div className="border border-emerald-800/40 bg-emerald-950/20 rounded-sm p-3" data-testid="profit-takers">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase">Profit Target Reached</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {profitTakers.map((h) => (
                    <span key={h.symbol} className="text-[11px] font-mono px-2 py-1 rounded-sm border text-emerald-400 border-emerald-800 bg-emerald-950/40">
                      <span className="font-bold">{h.symbol}</span> {fmtPct(h.pl_pct)} · Consider rebalancing gains into yield/index assets
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
