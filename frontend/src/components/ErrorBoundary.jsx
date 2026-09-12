import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Terminal React ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0D12] text-gray-100 flex items-center justify-center p-4">
          <div className="border border-rose-800 bg-[#121721] p-6 rounded-sm max-w-md w-full shadow-2xl text-center">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <h2 className="text-lg font-mono font-bold text-rose-400 mb-2">Terminal View Error</h2>
            <p className="text-xs font-mono text-gray-400 mb-4 break-words">
              {this.state.error?.message || "An unexpected error occurred while rendering the view."}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider px-4 py-2 rounded-sm flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reload Terminal
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("pt_session_token");
                  localStorage.removeItem("pm_session_token");
                  window.location.href = "/";
                }}
                className="border border-[#222C3D] hover:bg-[#161C26] text-gray-300 text-xs font-mono px-3 py-2 rounded-sm"
              >
                Reset Session
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
