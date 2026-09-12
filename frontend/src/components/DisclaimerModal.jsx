import { ShieldAlert, X, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function DisclaimerModal({ open, onClose, onAccept }) {
  if (!open) return null;

  const handleAccept = () => {
    try {
      localStorage.setItem("terminus_disclaimer_accepted_v1", "true");
    } catch {}
    if (onAccept) onAccept();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="disclaimer-modal"
    >
      <div
        className="bg-[#0A0D12] border border-[#222C3D] rounded-sm w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Header */}
        <div className="px-4 py-3 bg-[#0E131F] border-b border-[#222C3D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span className="text-[11px] font-mono tracking-widest text-amber-500 font-bold uppercase">
              Regulatory Notice & Disclaimer
            </span>
          </div>
          <button
            onClick={onClose}
            data-testid="close-disclaimer-modal"
            className="text-gray-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs text-gray-300 leading-relaxed">
          {/* Highlight Callout */}
          <div className="border border-amber-500/40 bg-amber-500/10 p-3.5 rounded-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-amber-400 font-bold text-sm tracking-wide">
                NOT FINANCIAL ADVICE
              </div>
              <p className="text-gray-200 text-xs font-medium leading-normal">
                This application is for informational purposes only and does not constitute financial advice.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1 text-gray-400 text-[11px]">
            <div className="space-y-1">
              <span className="text-gray-200 font-semibold uppercase tracking-wider block">
                1. No Investment Advice or Solicitation
              </span>
              <p>
                Terminus / Invest is a personal analytical intelligence terminal. All tools, automated signals, S&amp;P 500 alpha comparisons, risk audits, stock scanners, and AI financial syntheses are intended strictly for educational, research, and self-directed informational purposes. Nothing within this platform constitutes a recommendation, offer, or solicitation to buy, sell, or hold any security, cryptocurrency, or investment product.
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-gray-200 font-semibold uppercase tracking-wider block">
                2. Market Risk &amp; Accuracy
              </span>
              <p>
                Financial markets involve substantial risk of loss. Historical performance, backtested projections, and dividend cash flow forecasts do not guarantee future results. While market feeds are retrieved from institutional-grade public sources (Yahoo Finance, SEC EDGAR, Google News, StockTwits, and Kadoa), data latency, rounding, and exchange anomalies may occur.
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-gray-200 font-semibold uppercase tracking-wider block">
                3. Independent Consultation
              </span>
              <p>
                Before executing trades or making capital allocation decisions, always conduct independent due diligence and consult a licensed Financial Advisor, Certified Financial Planner (CFP), or Registered Investment Advisor (RIA).
              </p>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="px-5 py-3 bg-[#0E131F] border-t border-[#222C3D] flex items-center justify-between gap-3">
          <span className="text-[10px] text-gray-500 font-mono hidden sm:inline">
            Terminal Compliance · Version 1.0
          </span>
          <button
            onClick={handleAccept}
            data-testid="accept-disclaimer-button"
            className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider px-5 py-2 rounded-sm transition-colors flex items-center justify-center gap-1.5 shadow-md ml-auto"
          >
            <CheckCircle2 className="w-4 h-4 text-black" />
            I Understand &amp; Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}
