# UI Design Choices & Frontend Layout Guidelines

These guidelines represent established user preferences and design standards for the **Terminus** command center. Whenever a new feature is added, or an existing UI component is modified, you MUST adhere to these rules.

---

## 1. Summary KPI Cards — Fixed 3-Tier Vertical Structure

All metric summary cards (e.g. the 6-card summary strip in `PortfolioTab`) MUST adhere to a strict 3-tier vertical structure to ensure that adjacent cards never wrap or become vertically staggered:

- **Tier 1 (Metric Title Header)**:
  - Single-line fixed height: `h-5 flex items-center justify-between mb-2 gap-1.5`.
  - Title text MUST be concise and single-line: `text-[10px] font-mono tracking-widest text-gray-500 uppercase whitespace-nowrap truncate` with a `title={label}` attribute.
  - **Never allow title text to wrap to a second line or truncate into ellipsis (...)**. For example, use `"Annual Cash Flow"` instead of `"Projected Annual Cash Flow"`, and `"Personal Return"` (with `"Annualized (XIRR)"` subtitle) instead of `"Personal Return (MWR)"` which causes `...` ellipsis truncation.
  - All 6 cards in the summary grid MUST include a top-right icon (`shrink-0 w-4 h-4 text-gray-500`) for visual balance and symmetry (e.g. `DollarSign` on Total Value, Cost Basis, and Annual Cash Flow; `TrendingUp`/`TrendingDown` on Day P/L, Total P/L, and Personal Return).
  - When providing a card tooltip, render an inline `<Info className="w-3 h-3" />` trigger with a non-clipping hover/focus popup (`z-50`, `bottom-full mb-2`) that preserves the `h-5` header height.
- **Tier 2 (Metric Value)**:
  - Fixed baseline container: `h-8 flex items-baseline text-2xl font-mono font-bold text-gray-100 tabular-nums whitespace-nowrap truncate`.
  - Guarantees all large numbers across adjacent cards share the exact same horizontal baseline regardless of currency symbol or decimals.
- **Tier 3 (Subscripts & Metadata)**:
  - Fixed starting top offset: `min-h-[2.5rem] flex flex-col justify-start mt-1`.
  - Text styling: `text-xs font-mono leading-relaxed line-clamp-2 ${subColor || "text-gray-400"}`.
  - Ensures secondary indicators (positions, percent changes, yields, descriptions) begin on the exact same horizontal line across all cards (e.g. `"Annualized (XIRR)"`).
- **Card Container Shell**:
  - `border border-[#222C3D] bg-[#121721] p-4 rounded-sm panel-raised transition-transform active:scale-[0.98] flex flex-col justify-between h-full relative`.

---

## 2. Risk & Warning Indicators — Clean, Non-Redundant Signals

- **Single Left Warning Triangle Only (No Duplicate Badges)**:
  - In risk sections (such as single-asset exposure alerts in `PortfolioRiskAuditor`), do NOT display duplicate warning indicators on the same row.
  - Keep ONLY the triangle warning icon and message on the left (`<AlertTriangle /> Warning: ...` or `<AlertTriangle /> High Exposure: ...`) and the asset class badge on the right (`Thematic / Leveraged ETF`, etc.).
  - **Do NOT render any secondary warning badge on the right side** — neither yellow square (`■ WARNING`) nor red high exposure (`▲ HIGH EXPOSURE`). The left triangle icon and clear prefix text provide clean, non-color-distinguishable signaling without visual repetition.
- **Clean Sector Balance Warnings**:
  - In sector overweight alerts, use only the yellow triangle icon (`<AlertTriangle className="w-3 h-3" />`) alongside the alert text.
  - **Do NOT insert a redundant yellow square symbol (`■`)** inside the alert message string.

---

## 3. High-Density Terminal Aesthetics & Tokens

- **Theme Palette**:
  - Base Background: `#0A0D12`
  - Secondary / Card Surface: `#121721`
  - Elevated Surface / Hover: `#161C26`
  - Border Grid: `#222C3D`
  - Accent Primary: Amber `#F59E0B`
  - Gains / Positive: Emerald `#10B981` (background `bg-emerald-950/40`, border `border-emerald-800`)
  - Losses / Critical: Rose `#EF4444` (background `bg-rose-950/40`, border `border-rose-800`)
  - Macro / Intelligence: Blue `#3B82F6`
  - Options / Digital Assets: Cyan `#06B6D4`
- **Monospace Numerics**:
  - ALL prices, quantities, P/L values, percentages, dates, and scores MUST use `font-mono tabular-nums` to prevent column jitter during live updates.
- **Directional Indicators**:
  - Financial values showing gains or losses MUST be paired with directional glyphs: `▲` for positive and `▼` for negative, alongside appropriate emerald/rose color styling.

---

## 4. Accessibility & Interactive Polish (WCAG 2.1 AA)

- **Modals & Drawers**:
  - All modal overlays and drawer panels MUST specify `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="<title-id>"`.
  - Must include keyboard `Escape` dismissal listener.
- **Semantic Progress Bars**:
  - Any visual percentage bar, range gauge (e.g. 52-week or day price range in `StockDetailModal`), or allocation breakdown MUST include `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, and a descriptive `aria-label`.
- **Scrollable Regions**:
  - Any table container with horizontal scroll (`overflow-x-auto`) or vertical scroll MUST include `role="region"`, a descriptive `aria-label`, and `tabIndex={0}` with focus outline styling so keyboard users can scroll through all columns.
- **Tactile Feedback & Focus Rings**:
  - All interactive buttons, action icons, and filter pills MUST feature tactile compression on click (`active:scale-[0.97]` or `active:scale-[0.98]`).
  - Interactive elements MUST feature visible focus rings: `focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none`.
- **Navigation Tabs**:
  - Active tab button MUST include `aria-current="page"`, `data-active="true"`, and an accessible text indicator `<span className="sr-only">(Active)</span>`.
- **Data Test IDs**:
  - ALL interactive buttons, links, tabs, table rows, and metric widgets MUST specify unique, kebab-case `data-testid` attributes.

---

## 5. App Name & Webpage Favicon Brand Rules

- **Brand Name**:
  - The application name is **Terminus** (rendered in uppercase `TERMINUS` in headers and monospace brand badges).
  - **Do NOT use `Terminus / Invest` or generic `Portfolio Manager`** in user-facing UI, page titles, or headers.
  - Subtitle: `PERSONAL INVESTMENT COMMAND CENTER`.
  - Document Title: `Terminus · Investment Command Center`.
- **Brand Icon & Favicon**:
  - The official brand mark is the terminal prompt: `>_`.
  - Color: Amber `#F59E0B` on Terminal Dark Navy `#0A0E17`.
  - Favicon formats: `favicon.svg` (crisp scalable vector with rx=6), `favicon.ico` (multi-res 16/32/48), and `apple-touch-icon.png` (180x180).
  - Webpage `<head>` in `public/index.html` MUST always link to `/favicon.svg` and fallback icons.

