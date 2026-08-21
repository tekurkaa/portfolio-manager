import { useEffect, useState } from "react";
import { api, fmtNum, fmtPct } from "@/lib/api";

export default function TopTickerBar() {
  const [indices, setIndices] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/market/indices");
      setIndices(data.indices || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div
        className="border-b border-[#222C3D] bg-[#0E131F] py-2 px-4 text-[11px] font-mono text-gray-500"
        data-testid="ticker-bar-loading"
      >
        Loading market data...
      </div>
    );
  }

  const items = indices.length ? [...indices, ...indices] : [];

  return (
    <div
      className="border-b border-[#222C3D] bg-[#0E131F] overflow-hidden relative"
      data-testid="ticker-bar"
    >
      <div className="flex ticker-scroll whitespace-nowrap py-2">
        {items.map((it, i) => {
          const up = (it.change_percent ?? 0) >= 0;
          return (
            <div
              key={i}
              className="flex items-center gap-2 px-4 border-r border-[#222C3D] shrink-0"
              data-testid={`ticker-item-${it.symbol}`}
            >
              <span className="text-amber-500 font-mono font-bold text-xs tracking-wider">
                {it.display_name || it.symbol}
              </span>
              <span className="text-gray-200 font-mono text-xs">
                {fmtNum(it.price, 2)}
              </span>
              <span
                className={`font-mono text-xs ${up ? "text-emerald-400" : "text-rose-500"}`}
              >
                {fmtPct(it.change_percent)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
