import { useEffect, useState } from "react";
import { api, fmtPct } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, Radar, Mail, Bell, ChevronRight } from "lucide-react";

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

  const load = async (isBackground = false) => {
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
      if (!isBackground) toast.error("Failed to scan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 3 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePrefs = async () => {
    try {
      await api.post("/scanner/prefs", { email, enabled });
      toast.success("Notification preferences saved");
    } catch { toast.error("Failed to save"); }
  };

  const sendDigest = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/scanner/notify");
      if (data.sent) toast.success(`Digest sent to ${email}`);
      else {
        toast.warning("Email delivery not configured", { description: data.reason?.slice(0, 120) });
      }
    } catch { toast.error("Failed to send"); }
    finally { setSending(false); }
  };

  return (
    <div data-testid="scanner-tab" className="space-y-4">
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="text-xs font-mono tracking-widest uppercase text-amber-500 flex items-center gap-2">
              <Radar className="w-4 h-4" /> Breakout Scanner
            </div>
            <div className="text-[11px] text-gray-500 font-mono mt-0.5">
              Scans {data.universe_size || 60}+ tickers (S&P + biotech + semis + AI + crypto). Momentum × volume surge × options × congress buys.
            </div>
          </div>
          <button onClick={() => load(true)} disabled={loading || refreshing} data-testid="scan-refresh"
            className="flex items-center gap-1.5 border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm font-semibold disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} /> Rescan
          </button>
        </div>
      </div>

      {/* Email notifications */}
      <div className="border border-[#222C3D] bg-[#121721] p-4 rounded-sm" data-testid="notify-block">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase">Email Alerts</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" data-testid="notify-email-input"
            className="bg-[#0E131F] border border-[#222C3D] text-gray-100 text-xs px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500 flex-1 min-w-[240px]"
          />
          <label className="flex items-center gap-2 text-[11px] font-mono text-gray-400 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
              data-testid="notify-enabled" />
            Daily digest
          </label>
          <button onClick={savePrefs} data-testid="notify-save"
            className="border border-[#222C3D] text-gray-300 hover:bg-[#161C26] hover:text-white text-xs uppercase tracking-wider px-3 py-2 rounded-sm">
            Save
          </button>
          <button onClick={sendDigest} disabled={sending || !email} data-testid="notify-send"
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs uppercase tracking-wider px-3 py-2 rounded-sm disabled:opacity-50 flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> {sending ? "Sending..." : "Send Now"}
          </button>
        </div>
        <div className="text-[10px] font-mono text-gray-500 mt-2">
          Email delivery uses Resend. If not configured yet, "Send Now" returns the digest preview so you know exactly what will be sent.
        </div>
      </div>

      {/* Candidates */}
      <div className="border border-[#222C3D] bg-[#121721] rounded-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-[#0E131F] border-b border-[#222C3D] flex items-center gap-2">
          <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">Top Breakout Candidates</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="scanner-table">
            <thead className="bg-[#0E131F] border-b border-[#222C3D]">
              <tr className="text-left">
                {["#","SYMBOL","SIGNAL","SCORE","PRICE","MOM 5D","MOM 1M","VOL SURGE","52W%","OPT %","CGR ▲","DRIVERS"].map((h,i) => (
                  <th key={i} className="px-3 py-2 font-mono text-[10px] tracking-widest text-gray-500 uppercase">{h}</th>
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
                  <td className="px-3 py-2 font-mono text-gray-600">{i+1}</td>
                  <td className="px-3 py-2 font-mono font-bold text-amber-400 tracking-wider">{c.symbol}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm border ${signalColor(c.signal)}`}>{c.signal}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-100 font-bold">{c.composite}</td>
                  <td className="px-3 py-2 font-mono text-gray-200">${c.price}</td>
                  <td className={`px-3 py-2 font-mono ${c.momentum_5d >= 0 ? "text-emerald-400" : "text-rose-500"}`}>{fmtPct(c.momentum_5d)}</td>
                  <td className={`px-3 py-2 font-mono ${c.momentum_20d >= 0 ? "text-emerald-400" : "text-rose-500"}`}>{fmtPct(c.momentum_20d)}</td>
                  <td className="px-3 py-2 font-mono text-cyan-400">{c.vol_surge}×</td>
                  <td className="px-3 py-2 font-mono text-gray-300">{c.near_52w_high_pct}%</td>
                  <td className="px-3 py-2 font-mono text-gray-300">{c.options_tilt}%</td>
                  <td className="px-3 py-2 font-mono text-emerald-400">{c.congress_buys || 0}</td>
                  <td className="px-3 py-2 text-gray-400 text-[11px]">{c.drivers?.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
