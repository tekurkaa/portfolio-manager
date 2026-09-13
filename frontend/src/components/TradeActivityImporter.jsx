import React, { useState, useRef } from "react";
import { api, fmtMoney, fmtNum } from "@/lib/api";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Info,
  X,
  RefreshCw,
  Layers,
  ShieldAlert,
  Bitcoin
} from "lucide-react";

export default function TradeActivityImporter({ isOpen, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [importMode, setImportMode] = useState("replace");
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.name.endsWith(".csv")) {
        setFile(dropped);
      } else {
        toast.error("Please upload a .csv file");
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handlePreview = async () => {
    if (!file) {
      toast.error("Please select a Robinhood activity CSV file");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post("/portfolio/import-activity/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreviewData(data);
      setStep(2);
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to process CSV file";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || !previewData.holdings) return;

    setLoading(true);
    try {
      const payload = {
        holdings: previewData.holdings,
        trades: previewData.trades,
        mode: importMode,
      };
      const { data } = await api.post("/portfolio/import-activity/confirm", payload);
      toast.success(
        `Imported ${data.imported_count} positions (${data.lots_stored} active lots stored · ${importMode} mode)`
      );
      if (onSuccess) onSuccess(data);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to confirm portfolio import";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      data-testid="trade-importer-modal"
    >
      <div className="bg-[#0D121D] border border-[#222C3D] rounded-md shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col text-gray-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222C3D] bg-[#111726]">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-sm font-mono font-bold tracking-wider uppercase text-amber-400">
                Robinhood Trade Activity Import
              </h2>
              <div className="text-[11px] font-mono text-gray-500">
                Derive active holdings & FIFO cost basis from raw trade history
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            data-testid="close-trade-importer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-[#090D15] border-b border-[#1C2536] text-[11px] font-mono uppercase tracking-wider">
          <div
            className={`flex items-center gap-1.5 ${
              step === 1 ? "text-amber-400 font-bold" : step > 1 ? "text-emerald-400" : "text-gray-500"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                step === 1
                  ? "bg-amber-500 text-black font-bold"
                  : step > 1
                  ? "bg-emerald-500 text-black font-bold"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              1
            </span>
            Upload CSV
          </div>
          <div className="text-gray-600">───</div>
          <div
            className={`flex items-center gap-1.5 ${
              step === 2 ? "text-amber-400 font-bold" : step > 2 ? "text-emerald-400" : "text-gray-500"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                step === 2
                  ? "bg-amber-500 text-black font-bold"
                  : step > 2
                  ? "bg-emerald-500 text-black font-bold"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              2
            </span>
            Preview & FIFO
          </div>
          <div className="text-gray-600">───</div>
          <div
            className={`flex items-center gap-1.5 ${
              step === 3 ? "text-amber-400 font-bold" : "text-gray-500"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                step === 3
                  ? "bg-amber-500 text-black font-bold"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              3
            </span>
            Import Mode
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                data-testid="csv-dropzone"
                className="border-2 border-dashed border-[#2A374E] hover:border-amber-500/80 bg-[#121824]/60 hover:bg-[#151D2C] p-8 rounded-sm text-center cursor-pointer transition-colors group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="file-upload-input"
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-mono font-medium text-gray-200">
                    {file ? file.name : "Drop your Robinhood Trade Activity CSV here"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {file ? `${(file.size / 1024).toFixed(1)} KB selected` : "or click to browse from device"}
                  </div>
                </div>
              </div>

              {/* Step by step guide */}
              <div className="border border-[#222C3D] bg-[#101520] p-4 rounded-sm space-y-2.5 text-xs font-mono">
                <div className="flex items-center gap-2 text-amber-400 font-semibold uppercase tracking-wider text-[11px]">
                  <Info className="w-4 h-4" /> How to export from Robinhood
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-400 leading-relaxed text-[11px]">
                  <li>
                    Open Robinhood and go to <span className="text-gray-200 font-semibold">Account</span> (profile icon) → <span className="text-gray-200 font-semibold">Statements & History</span>.
                  </li>
                  <li>
                    Under <span className="text-gray-200 font-semibold">Account Statements</span>, select <span className="text-gray-200 font-semibold">Activity</span>.
                  </li>
                  <li>
                    Click <span className="text-gray-200 font-semibold">Download CSV</span> and upload the downloaded file above.
                  </li>
                </ol>
                <div className="pt-2 border-t border-[#1D2738] flex items-center gap-2 text-[10px] text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Automatically filters out options contracts (BTO/STC), ACH deposits, dividends & stock lending entries.
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === 2 && previewData && (
            <div className="space-y-4">
              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="bg-[#121824] border border-[#222C3D] p-2.5 rounded-sm">
                  <div className="text-[10px] text-gray-500 uppercase">Active Holdings</div>
                  <div className="text-lg font-bold text-amber-400">
                    {previewData.holdings?.length || 0}
                  </div>
                </div>
                <div className="bg-[#121824] border border-[#222C3D] p-2.5 rounded-sm">
                  <div className="text-[10px] text-gray-500 uppercase">Active Buy Lots</div>
                  <div className="text-lg font-bold text-cyan-400">
                    {previewData.total_active_lots || 0}
                  </div>
                </div>
                <div className="bg-[#121824] border border-[#222C3D] p-2.5 rounded-sm">
                  <div className="text-[10px] text-gray-500 uppercase">Options Skipped</div>
                  <div className="text-lg font-bold text-gray-300">
                    {previewData.ignored_options_count || 0}
                  </div>
                </div>
                <div className="bg-[#121824] border border-[#222C3D] p-2.5 rounded-sm">
                  <div className="text-[10px] text-gray-500 uppercase">Other Skipped</div>
                  <div className="text-lg font-bold text-gray-400">
                    {previewData.ignored_other_count || 0}
                  </div>
                </div>
              </div>

              {/* Closed Positions Notice */}
              {previewData.closed_positions && previewData.closed_positions.length > 0 && (
                <div className="border border-amber-900/50 bg-amber-950/20 p-3 rounded-sm flex items-start gap-2 text-xs font-mono text-amber-300/90">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      {previewData.closed_positions.length} closed position(s) excluded
                    </span>{" "}
                    (net quantity cleared to 0 after FIFO sales):{" "}
                    <span className="text-gray-300">
                      {previewData.closed_positions.join(", ")}
                    </span>
                  </div>
                </div>
              )}

              {/* Cost Basis Calculation Note */}
              <div className="border border-[#222C3D] bg-[#101520] p-3 rounded-sm text-[11px] font-mono text-gray-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-gray-200 font-semibold">Strict FIFO Execution:</span> Remaining buy lots were preserved in order of execution. Each position's Average Cost reflects the weighted average of surviving FIFO lots, exactly matching your Robinhood terminal view.
                </div>
              </div>

              {/* Derived Holdings Table */}
              <div className="border border-[#222C3D] rounded-sm overflow-hidden bg-[#111724]">
                <div className="max-h-[260px] overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#0A0E18] text-[10px] text-gray-400 uppercase sticky top-0 border-b border-[#222C3D]">
                      <tr>
                        <th className="px-3 py-2">Symbol</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Net Qty</th>
                        <th className="px-3 py-2">Avg Cost</th>
                        <th className="px-3 py-2">First Bought</th>
                        <th className="px-3 py-2">Lots</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1A2333]">
                      {previewData.holdings?.map((h) => (
                        <tr key={h.symbol} className="hover:bg-[#161D2E]">
                          <td className="px-3 py-2 font-bold text-amber-400">
                            <div className="flex items-center gap-1.5">
                              {h.asset_type === "crypto" && <Bitcoin className="w-3.5 h-3.5 text-cyan-400" />}
                              <span>{h.symbol}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[10px] uppercase text-gray-400">
                            {h.asset_type}
                          </td>
                          <td className="px-3 py-2 text-gray-200">
                            {fmtNum(h.quantity, 4)}
                          </td>
                          <td className="px-3 py-2 text-gray-200">
                            {fmtMoney(h.avg_cost)}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-[11px]">
                            {fmtDate(h.date_of_purchase)}
                          </td>
                          <td className="px-3 py-2 text-cyan-400">
                            {h.lot_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: IMPORT MODE */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-xs font-mono text-gray-400">
                Select how you would like to apply the{" "}
                <span className="text-amber-400 font-bold">
                  {previewData?.holdings?.length || 0}
                </span>{" "}
                derived positions to your portfolio:
              </div>

              <div className="space-y-3 font-mono">
                {/* Replace Option */}
                <label
                  onClick={() => setImportMode("replace")}
                  className={`block border p-4 rounded-sm cursor-pointer transition-all ${
                    importMode === "replace"
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-[#222C3D] bg-[#111724] hover:bg-[#151D2C]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                      className="mt-1 text-amber-500 focus:ring-amber-500"
                    />
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-gray-100 flex items-center gap-2">
                        Replace current portfolio entirely
                        <span className="text-[10px] font-normal px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded">
                          Recommended
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 leading-relaxed">
                        Clears all existing holdings and imports these {previewData?.holdings?.length || 0} positions fresh. Best when this CSV represents your complete Robinhood portfolio history.
                      </div>
                    </div>
                  </div>
                </label>

                {/* Merge Option */}
                <label
                  onClick={() => setImportMode("merge")}
                  className={`block border p-4 rounded-sm cursor-pointer transition-all ${
                    importMode === "merge"
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-[#222C3D] bg-[#111724] hover:bg-[#151D2C]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === "merge"}
                      onChange={() => setImportMode("merge")}
                      className="mt-1 text-amber-500 focus:ring-amber-500"
                    />
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-gray-100">
                        Merge with existing holdings
                      </div>
                      <div className="text-[11px] text-gray-400 leading-relaxed">
                        Updates quantities and cost basis for matching symbols, adds any new symbols, and leaves any existing portfolio holdings not in this CSV untouched.
                      </div>
                    </div>
                  </div>
                </label>
              </div>

              <div className="border border-[#222C3D] bg-[#101520] p-3.5 rounded-sm text-[11px] font-mono text-gray-400 space-y-1">
                <div className="text-gray-200 font-semibold">Import Summary</div>
                <div>• Positions to write: {previewData?.holdings?.length || 0}</div>
                <div>• Tax lots to persist: {previewData?.total_active_lots || 0}</div>
                <div>• Selected action: {importMode === "replace" ? "Overwrite existing portfolio" : "Merge into existing portfolio"}</div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Navigation Buttons */}
        <div className="px-6 py-4 border-t border-[#222C3D] bg-[#111726] flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={loading}
                className="flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-gray-400 hover:text-white px-3 py-1.5 border border-[#222C3D] hover:bg-[#1B2333] rounded-sm transition-colors"
                data-testid="trade-importer-back"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="text-xs font-mono uppercase tracking-wider text-gray-400 hover:text-white px-3 py-1.5 rounded-sm"
              data-testid="trade-importer-cancel"
            >
              Cancel
            </button>

            {step === 1 && (
              <button
                onClick={handlePreview}
                disabled={!file || loading}
                data-testid="trade-importer-preview-button"
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-mono font-semibold uppercase tracking-wider px-4 py-1.5 rounded-sm transition-colors"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    Preview Holdings <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}

            {step === 2 && (
              <button
                onClick={() => setStep(3)}
                data-testid="trade-importer-choose-mode-button"
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-semibold uppercase tracking-wider px-4 py-1.5 rounded-sm transition-colors"
              >
                Choose Mode <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 3 && (
              <button
                onClick={handleConfirmImport}
                disabled={loading}
                data-testid="trade-importer-confirm-button"
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-mono font-bold uppercase tracking-wider px-4 py-1.5 rounded-sm transition-colors shadow-lg"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" /> Confirm & Import
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
