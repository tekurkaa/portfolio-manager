import axios from "axios";

// Determine backend: use Render in production, localhost in dev.
// process.env.NODE_ENV is "production" on Vercel builds, "development" locally.
const BACKEND_URL =
  process.env.NODE_ENV === "production"
    ? "https://portfolio-manager-2yyr.onrender.com"
    : "http://localhost:8000";

export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 90000, withCredentials: true });

// Token helpers — store session token in localStorage so it survives page reloads
// and works cross-origin (Vercel → Render) where cookies may be blocked.
const TOKEN_KEY = "pm_session_token";
export const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
export const getToken = () => localStorage.getItem(TOKEN_KEY);

// Attach token to every request via Authorization header (backed up by cookie)
api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers["Authorization"] = `Bearer ${t}`;
  return config;
});

export const fmtMoney = (n, digits = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

export const fmtNum = (n, digits = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export const fmtPct = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(2)}%`;
};

export const colorForPL = (n) => {
  if (n === null || n === undefined || Number.isNaN(n) || n === 0) return "text-gray-400";
  return n > 0 ? "text-emerald-400" : "text-rose-500";
};

export const timeAgo = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

