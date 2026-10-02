import { useEffect, useState } from "react";
import { api, fmtPct, openStockModal } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, Radar, Mail, Bell, ChevronRight, Sparkles, Zap } from "lucide-react";

const signalColor = (s) => {
  if (s === "STRONG BUY") return "text-emerald-400 border-emerald-800 bg-emerald-950/40";
  if (s === "BUY") return "text-amber-400 border-amber-800 bg-amber-950/40";
  return "text-gray-400 border-[#222C3D] bg-[#161C26]";
};

export default function ScannerTab() {
  const [data, setData] = useState({ candidates: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState("");
  const [enabled, setEnabled] = useState(false);

  const load = async (isBackground = false, isManual = false) => {
    if (!isBackground && (!data.candidates || data.candidates.length === 0)) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [scan, prefs] = await Promise.all([
        api.get("/scanner/breakouts"),
        api.get("/scanner/prefs").catch(() => ({ data: {} })),
      ]);
      setData(scan.data);
      setEmail(prefs.data.email || "");
      setEnabled(!!prefs.data.enabled);
    } catch {
      if (isManual) {
        toast.error("Failed to scan");
      } else if (!isBackground) {
        setTimeout(() => load(true), 4000);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePrefs = async () => {
    const trimmed = (email || "").trim();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      toast.error("Please enter a valid email address");
      return;
    }
    try {
      await api.post("/scanner/prefs", { email: trimmed, enabled });
      toast.success("Notification preferences saved");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to save";
      toast.error(msg);
    }
  };

  const sendDigest = async () => {
    const trimmed = (email || "").trim();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post("/scanner/notify", { email: trimmed });
      if (data.sent) toast.success(`Digest sent to ${trimmed}`);
      else {
        toast.warning("Email delivery notice", { description: data.reason?.slice(0, 150) });
      }
    } catch {
      toast.error("Failed to send email digest");
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="scanner-tab" className="space-y-4">
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm panel-raised">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="text-xs font-mono tracking-widest uppercase text-amber-500 flex items-center gap-2">
              <Radar className="w-4 h-4" /> Breakout Scanner
            </div>
            <div className="text-[11px] text-gray-500 font-mono mt-0.5">
              Scans {data.universe_size || 60}+ tickers (S&P + biotech + semis + AI + crypto). Momentum × volume surge × options × congress buys.
            </div>
          </div>
          <button onClick={() => load(false, true)} disabled={loading || refreshing} data-testid="scan-refresh"
            className="flex items-center gap-1.5 border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm font-semibold disabled:opacity-50 transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
            <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} /> Rescan
          </button>
        </div>
      </div>

      {/* Email notifications */}
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm panel-raised" data-testid="notify-block">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase">Email Alerts</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" data-testid="notify-email-input"
            className="bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500 flex-1 min-w-[240px] focus-visible:ring-2 focus-visible:ring-amber-500"
          />
          <label className="flex items-center gap-2 text-[11px] font-mono text-gray-400 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
              data-testid="notify-enabled" className="accent-amber-500" />
            Daily digest
          </label>
          <button onClick={savePrefs} data-testid="notify-save"
            className="border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-2 rounded-sm transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
            Save
          </button>
          <button onClick={sendDigest} disabled={sending || !email} data-testid="notify-send"
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs uppercase tracking-wider px-3 py-2 rounded-sm disabled:opacity-50 flex items-center gap-1 transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
            <Mail className="w-3.5 h-3.5" /> {sending ? "Sending..." : "Send Now"}
          </button>
        </div>
        <div className="text-[10px] font-mono text-gray-500 mt-2">
          Email delivery uses Resend. If not configured yet, "Send Now" returns the digest preview so you know exactly what will be sent.
        </div>
      </div>

      {/* Candidates */}
      <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden panel-raised">
        <div className="px-4 py-2.5 bg-[#0E131F] border-b border-[#222C3D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">Top Breakout Candidates</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400" data-testid="scanner-ai-model">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>AI Reasoning: <span className="text-gray-200 font-semibold">Gemini 3.8 Flash</span></span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]" data-testid="scanner-table">
            <thead className="bg-[#0E131F] border-b border-[#222C3D]">
              <tr className="text-left">
                {[
                  ["#", "w-8"],
                  ["SYMBOL", ""],
                  ["SIGNAL", "min-w-[110px] w-[110px]"],
                  ["SCORE", ""],
                  ["PRICE", ""],
                  ["MOM 5D", ""],
                  ["MOM 1M", ""],
                  ["VOL SURGE", ""],
                  ["52W%", ""],
                  ["OPT %", ""],
                  ["CGR ▲", ""],
                  ["DRIVERS", ""]
                ].map(([h, cls]) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase ${h === "DRIVERS" ? "" : "whitespace-nowrap"} ${cls}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (!data.candidates || data.candidates.length === 0) ? (
                <tr><td colSpan={12} className="p-8 text-center text-gray-500 font-mono text-xs">Scanning {data.universe_size || 60}+ tickers · this takes 30-60s...</td></tr>
              ) : data.candidates?.length === 0 ? (
                <tr><td colSpan={12} className="p-8 text-center text-gray-500 font-mono text-xs">No candidates. Try again during market hours.</td></tr>
              ) : data.candidates.map((c, i) => (
                <tr key={c.symbol} className="border-b border-[#1A2232] hover:bg-[#161C26]" data-testid={`scan-row-${c.symbol}`}>
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{i+1}</td>
                  <td className="px-3 py-2 font-mono font-bold text-amber-400 tracking-wider whitespace-nowrap">
                    <span
                      onClick={() => openStockModal(c.symbol)}
                      data-testid={`stock-trigger-${c.symbol}`}
                      className="cursor-pointer hover:underline hover:text-amber-300 transition-colors"
                      title="Click to view security terminal details"
                    >
                      {c.symbol}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap min-w-[110px] w-[110px]">
                    <span className={`inline-flex items-center justify-center whitespace-nowrap text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-sm border shrink-0 ${signalColor(c.signal)}`}>
                      {c.signal ? c.signal.replace(/\s+/g, '\u00A0') : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-100 font-bold whitespace-nowrap">{c.composite}</td>
                  <td className="px-3 py-2 font-mono text-gray-200 whitespace-nowrap">${c.price}</td>
                  <td className={`px-3 py-2 font-mono whitespace-nowrap ${c.momentum_5d >= 0 ? "text-emerald-400" : "text-rose-500"}`}>{fmtPct(c.momentum_5d)}</td>
                  <td className={`px-3 py-2 font-mono whitespace-nowrap ${c.momentum_20d >= 0 ? "text-emerald-400" : "text-rose-500"}`}>{fmtPct(c.momentum_20d)}</td>
                  <td className="px-3 py-2 font-mono text-cyan-400 whitespace-nowrap">{c.vol_surge}×</td>
                  <td className="px-3 py-2 font-mono text-gray-300 whitespace-nowrap">{c.near_52w_high_pct}%</td>
                  <td className="px-3 py-2 font-mono text-gray-300 whitespace-nowrap">{c.options_tilt}%</td>
                  <td className="px-3 py-2 font-mono text-emerald-400 whitespace-nowrap">{c.congress_buys || 0}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-[220px] sm:max-w-[260px] md:max-w-[320px] lg:max-w-[420px] text-[11px] break-words leading-relaxed">
                      <div className="text-gray-400">{c.drivers?.join(" · ")}</div>
                      {c.thesis && (
                        <div className="mt-2 p-2 rounded-xs bg-[#0E131F] border border-amber-500/30 text-gray-200 shadow-sm" data-testid={`thesis-${c.symbol}`}>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
                            <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>AI Thesis · {c.catalyst_type || "Breakout Setup"}</span>
                            {c.conviction && (
                              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                {c.conviction}/10 Conviction
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-300 font-sans leading-snug">{c.thesis}</p>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
