from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Depends, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import io
import csv
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from quotes import get_quote, get_quotes, get_market_indices  # noqa: E402
from news_service import get_stock_news, get_macro_news  # noqa: E402
from sentiment_service import analyze_portfolio_public, market_fear_greed_from_social, analyze_symbol_public  # noqa: E402
from insider_service import get_insider_summary, get_congress_trades, get_sec_form4  # noqa: E402
from history_service import portfolio_history  # noqa: E402
from signal_service import get_portfolio_options_flow, get_options_flow, alpha_signal  # noqa: E402
from backtest_service import backtest_portfolio  # noqa: E402
from auth import get_current_user, exchange_session, logout_session, create_dev_session  # noqa: E402
from scanner_service import scan_breakouts, build_digest_html, send_digest_email  # noqa: E402
from chat_service import chat_answer  # noqa: E402
from db import get_database  # noqa: E402
from trade_import_service import parse_robinhood_csv, derive_holdings_fifo  # noqa: E402
from asset_metadata_service import resolve_asset_metadata  # noqa: E402

db = get_database()

app = FastAPI(title="Investment Terminal API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- AUTH DEPENDENCY ----------
async def current_user(request: Request):
    return await get_current_user(request, db)


async def current_user_id(request: Request) -> str:
    u = await get_current_user(request, db)
    return u["user_id"]


# ---------- AUTH ROUTES ----------
class SessionExchange(BaseModel):
    session_id: str


class DevLoginRequest(BaseModel):
    email: Optional[str] = "trader@terminus.local"
    name: Optional[str] = "Senior Trader"


@api_router.post("/auth/callback")
async def auth_callback(data: SessionExchange, response: Response):
    return await exchange_session(data.session_id, db, response)


@api_router.post("/auth/dev-login")
async def auth_dev_login(data: DevLoginRequest, response: Response):
    return await create_dev_session(data.email or "trader@terminus.local", data.name or "Senior Trader", db, response)


@api_router.get("/auth/me")
async def auth_me(user=Depends(current_user)):
    return {"user_id": user["user_id"], "email": user["email"], "name": user.get("name"), "picture": user.get("picture")}


@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    await logout_session(request, db, response)
    return {"ok": True}


# ---------- MODELS ----------
class Holding(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    symbol: str
    name: Optional[str] = None
    quantity: float
    avg_cost: float
    asset_type: str = "stock"
    is_broad_market: Optional[bool] = None
    sub_type: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    date_of_purchase: Optional[str] = None
    lot_count: Optional[int] = None


class HoldingCreate(BaseModel):
    symbol: str
    name: Optional[str] = None
    quantity: float
    avg_cost: float
    asset_type: Optional[str] = None
    is_broad_market: Optional[bool] = None
    sub_type: Optional[str] = None
    date_of_purchase: Optional[str] = None
    lot_count: Optional[int] = None


class HoldingUpdate(BaseModel):
    quantity: Optional[float] = None
    avg_cost: Optional[float] = None
    name: Optional[str] = None
    asset_type: Optional[str] = None
    is_broad_market: Optional[bool] = None
    sub_type: Optional[str] = None
    date_of_purchase: Optional[str] = None
    lot_count: Optional[int] = None


class ImportActivityConfirmRequest(BaseModel):
    holdings: List[dict]
    trades: Optional[List[dict]] = None
    mode: Literal["replace", "merge"] = "replace"


# ---------- ROUTES: PORTFOLIO ----------
def _serialize_holding(h: dict) -> dict:
    h.pop("_id", None)
    if isinstance(h.get("created_at"), datetime):
        h["created_at"] = h["created_at"].isoformat()
    return h


@api_router.get("/health")
async def health():
    engine = getattr(db, "_engine_type", "unknown")
    mongo_url = os.environ.get("MONGO_URL", "local")
    if "@" in mongo_url:
        host = mongo_url.split("@")[-1].split("/")[0]
        source = f"atlas@{host}"
    else:
        source = mongo_url
    return {"status": "ok", "db_engine": engine, "db_source": source,
            "time": datetime.now(timezone.utc).isoformat()}



@api_router.get("/portfolio/holdings")
async def list_holdings(uid: str = Depends(current_user_id)):
    docs = await db.holdings.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    symbols = [d["symbol"] for d in docs]
    quotes = await get_quotes(symbols) if symbols else {}
    enriched = []
    total_value = 0.0
    total_cost = 0.0
    total_day_change = 0.0
    for d in docs:
        if d.get("is_broad_market") is None or d.get("sub_type") is None:
            meta = resolve_asset_metadata(d.get("symbol", ""), d.get("name", ""), d.get("asset_type"))
            d["asset_type"] = meta["asset_type"]
            d["is_broad_market"] = meta["is_broad_market"]
            d["sub_type"] = meta["sub_type"]
        q = quotes.get(d["symbol"].upper())
        price = q["price"] if q else d.get("avg_cost", 0)
        prev_close = q["previous_close"] if q and q.get("previous_close") else price
        value = price * d["quantity"]
        cost_basis = d["avg_cost"] * d["quantity"]
        pl = value - cost_basis
        pl_pct = (pl / cost_basis * 100) if cost_basis else 0
        day_change = (price - prev_close) * d["quantity"] if prev_close else 0
        total_value += value
        total_cost += cost_basis
        total_day_change += day_change
        enriched.append({
            **d,
            "price": price,
            "previous_close": prev_close,
            "value": round(value, 2),
            "cost_basis": round(cost_basis, 2),
            "pl": round(pl, 2),
            "pl_pct": round(pl_pct, 3),
            "day_change": round(day_change, 2),
            "day_change_pct": round((q.get("change_percent") if q else 0) or 0, 3),
            "quote_source": q["source"] if q else "cost",
            "live": q is not None,
        })
    total_pl = total_value - total_cost
    total_pl_pct = (total_pl / total_cost * 100) if total_cost else 0
    day_pct = (total_day_change / (total_value - total_day_change) * 100) if (total_value - total_day_change) else 0
    return {
        "holdings": enriched,
        "summary": {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_pl": round(total_pl, 2),
            "total_pl_pct": round(total_pl_pct, 3),
            "day_change": round(total_day_change, 2),
            "day_change_pct": round(day_pct, 3),
            "count": len(enriched),
            "stock_count": sum(1 for h in enriched if h.get("asset_type") == "stock"),
            "crypto_count": sum(1 for h in enriched if h.get("asset_type") == "crypto"),
            "etf_count": sum(1 for h in enriched if h.get("asset_type") == "etf"),
        },
    }


@api_router.post("/portfolio/holdings")
async def create_holding(data: HoldingCreate, uid: str = Depends(current_user_id)):
    meta = resolve_asset_metadata(data.symbol, data.name or "", data.asset_type)
    h = Holding(
        symbol=data.symbol.upper().strip(),
        name=data.name,
        quantity=data.quantity,
        avg_cost=data.avg_cost,
        asset_type=data.asset_type or meta["asset_type"],
        is_broad_market=data.is_broad_market if data.is_broad_market is not None else meta["is_broad_market"],
        sub_type=data.sub_type or meta["sub_type"],
        date_of_purchase=data.date_of_purchase,
        lot_count=data.lot_count,
    )
    doc = h.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["user_id"] = uid
    await db.holdings.insert_one(doc)
    return _serialize_holding(doc)


@api_router.patch("/portfolio/holdings/{holding_id}")
async def update_holding(holding_id: str, data: HoldingUpdate, uid: str = Depends(current_user_id)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "No fields to update")
    result = await db.holdings.update_one({"id": holding_id, "user_id": uid}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Holding not found")
    doc = await db.holdings.find_one({"id": holding_id, "user_id": uid}, {"_id": 0})
    return _serialize_holding(doc) if doc else {}


@api_router.delete("/portfolio/holdings/{holding_id}")
async def delete_holding(holding_id: str, uid: str = Depends(current_user_id)):
    result = await db.holdings.delete_one({"id": holding_id, "user_id": uid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Holding not found")
    return {"ok": True, "id": holding_id}


@api_router.delete("/portfolio/holdings")
async def clear_holdings(uid: str = Depends(current_user_id)):
    await db.holdings.delete_many({"user_id": uid})
    return {"ok": True}


@api_router.post("/portfolio/import-activity/preview")
async def import_activity_preview(file: UploadFile = File(...), uid: str = Depends(current_user_id)):
    """
    Parses a Robinhood Trade Activity CSV, applies strict FIFO lot clearing,
    and returns a preview of derived active holdings and stats without writing to DB.
    """
    content = await file.read()
    try:
        trades, stats = parse_robinhood_csv(content)
        derived = derive_holdings_fifo(trades, stats)
        return {
            **derived,
            "trades": trades,
        }
    except Exception as e:
        logger.exception("Failed to parse trade activity CSV")
        raise HTTPException(status_code=400, detail=f"Failed to process trade activity CSV: {str(e)}")


@api_router.post("/portfolio/import-activity/confirm")
async def import_activity_confirm(data: ImportActivityConfirmRequest, uid: str = Depends(current_user_id)):
    """
    Confirms and writes derived holdings and lots to the database.
    Supports 'replace' (clears old holdings/lots) or 'merge' (upserts matching symbols).
    """
    if not data.holdings:
        raise HTTPException(status_code=400, detail="No holdings to import")

    if data.mode == "replace":
        await db.holdings.delete_many({"user_id": uid})
        await db.trade_lots.delete_many({"user_id": uid})

    imported_count = 0
    lots_stored = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    for h in data.holdings:
        sym_up = str(h.get("symbol", "")).upper().strip()
        if not sym_up:
            continue
        qty = float(h.get("quantity", 0))
        avg = float(h.get("avg_cost", 0))
        if qty <= 0:
            continue

        meta = resolve_asset_metadata(sym_up, h.get("name") or sym_up, h.get("asset_type"))
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "symbol": sym_up,
            "name": h.get("name") or sym_up,
            "quantity": qty,
            "avg_cost": avg,
            "asset_type": h.get("asset_type") or meta["asset_type"],
            "is_broad_market": h.get("is_broad_market") if h.get("is_broad_market") is not None else meta["is_broad_market"],
            "sub_type": h.get("sub_type") or meta["sub_type"],
            "date_of_purchase": h.get("date_of_purchase"),
            "lot_count": h.get("lot_count", 1),
            "created_at": now_iso,
        }

        if data.mode == "replace":
            await db.holdings.insert_one(doc)
            imported_count += 1
        else:
            # Merge mode: upsert by (user_id, symbol)
            existing = await db.holdings.find_one({"user_id": uid, "symbol": sym_up})
            if existing:
                await db.holdings.update_one(
                    {"user_id": uid, "symbol": sym_up},
                    {"$set": {
                        "quantity": qty,
                        "avg_cost": avg,
                        "name": doc["name"],
                        "asset_type": doc["asset_type"],
                        "is_broad_market": doc["is_broad_market"],
                        "sub_type": doc["sub_type"],
                        "date_of_purchase": doc["date_of_purchase"],
                        "lot_count": doc["lot_count"],
                    }}
                )
            else:
                await db.holdings.insert_one(doc)
            imported_count += 1

        # Store active lots
        active_lots = h.get("active_lots") or []
        for lot in active_lots:
            lot_doc = {
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "symbol": sym_up,
                "asset_type": lot.get("asset_type", doc["asset_type"]),
                "quantity": float(lot.get("quantity", 0)),
                "price": float(lot.get("price", 0)),
                "trade_date": lot.get("trade_date"),
                "broker": lot.get("broker", "robinhood"),
                "imported_at": now_iso,
            }
            await db.trade_lots.insert_one(lot_doc)
            lots_stored += 1

    return {
        "ok": True,
        "mode": data.mode,
        "imported_count": imported_count,
        "lots_stored": lots_stored,
    }


@api_router.post("/portfolio/upload-csv")
async def upload_csv(file: UploadFile = File(...), uid: str = Depends(current_user_id)):
    """Parse a Robinhood-exported CSV. Flexible column matching."""
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    imported = []
    errors = []
    for row in reader:
        norm = {k.strip().lower(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k}
        # Try several column name variants
        symbol = (
            norm.get("symbol") or norm.get("ticker") or norm.get("instrument")
            or norm.get("stock") or norm.get("asset")
        )
        qty = (
            norm.get("quantity") or norm.get("shares") or norm.get("qty")
            or norm.get("amount") or norm.get("units")
        )
        avg = (
            norm.get("average cost") or norm.get("avg cost") or norm.get("avg_cost")
            or norm.get("cost basis per share") or norm.get("cost basis")
            or norm.get("purchase price") or norm.get("price")
        )
        name = norm.get("description") or norm.get("name") or None
        if not symbol or not qty or not avg:
            continue
        try:
            def _n(v):
                return float(str(v).replace("$", "").replace(",", "").strip())
            quantity = _n(qty)
            avg_cost = _n(avg)
            if quantity <= 0 or avg_cost <= 0:
                continue
            sym_up = symbol.upper().strip()
            meta = resolve_asset_metadata(sym_up, name or "", None)
            h = Holding(
                symbol=sym_up,
                name=name,
                quantity=quantity,
                avg_cost=avg_cost,
                asset_type=meta["asset_type"],
                is_broad_market=meta["is_broad_market"],
                sub_type=meta["sub_type"],
            )
            doc = h.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            doc["user_id"] = uid
            # upsert by (user_id, symbol)
            existing = await db.holdings.find_one({"user_id": uid, "symbol": sym_up})
            if existing:
                await db.holdings.update_one(
                    {"user_id": uid, "symbol": sym_up},
                    {"$set": {
                        "quantity": quantity,
                        "avg_cost": avg_cost,
                        "name": name or existing.get("name"),
                        "asset_type": meta["asset_type"],
                        "is_broad_market": meta["is_broad_market"],
                        "sub_type": meta["sub_type"],
                    }},
                )
            else:
                await db.holdings.insert_one(doc)
            imported.append(sym_up)
        except Exception as e:
            errors.append(f"{symbol}: {e}")
    return {"imported": imported, "count": len(imported), "errors": errors}


@api_router.post("/portfolio/seed-demo")
async def seed_demo(uid: str = Depends(current_user_id)):
    """Load a demo Robinhood-style portfolio."""
    await db.holdings.delete_many({"user_id": uid})
    demo = [
        ("AAPL", "Apple Inc.", 25, 152.30, "stock"),
        ("NVDA", "NVIDIA Corp.", 12, 420.50, "stock"),
        ("TSLA", "Tesla Inc.", 8, 245.20, "stock"),
        ("MSFT", "Microsoft Corp.", 10, 305.10, "stock"),
        ("AMZN", "Amazon.com", 15, 132.80, "stock"),
        ("GOOGL", "Alphabet Inc.", 18, 128.40, "stock"),
        ("META", "Meta Platforms", 7, 315.60, "stock"),
        ("VOO", "Vanguard S&P 500 ETF", 20, 410.00, "etf"),
        ("GLD", "SPDR Gold Shares", 15, 185.00, "etf"),
        ("BTC-USD", "Bitcoin", 0.35, 42800.00, "crypto"),
        ("ETH-USD", "Ethereum", 4.2, 2350.00, "crypto"),
        ("SOL-USD", "Solana", 30, 105.00, "crypto"),
    ]
    for sym, name, qty, avg, atype in demo:
        meta = resolve_asset_metadata(sym, name, atype)
        h = Holding(
            symbol=sym,
            name=name,
            quantity=qty,
            avg_cost=avg,
            asset_type=meta["asset_type"],
            is_broad_market=meta["is_broad_market"],
            sub_type=meta["sub_type"],
        )
        doc = h.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["user_id"] = uid
        await db.holdings.insert_one(doc)
    return {"ok": True, "count": len(demo)}


# ---------- ROUTES: MARKET ----------
@api_router.get("/market/indices")
async def market_indices():
    return {"indices": await get_market_indices()}


@api_router.get("/market/quote/{symbol}")
async def market_quote(symbol: str):
    q = await get_quote(symbol)
    if not q:
        raise HTTPException(404, f"No quote for {symbol}")
    return q


# ---------- ROUTES: NEWS ----------
async def _get_held_symbols(uid: str) -> List[str]:
    docs = await db.holdings.find({"user_id": uid}, {"_id": 0, "symbol": 1}).to_list(1000)
    return sorted({d["symbol"] for d in docs})


@api_router.get("/news/stocks")
async def stock_news(uid: str = Depends(current_user_id)):
    symbols = await _get_held_symbols(uid)
    clean = [s.replace("-USD", "") for s in symbols]
    return await get_stock_news(clean)


@api_router.get("/news/macro")
async def macro_news():
    return await get_macro_news()


# ---------- ROUTES: SENTIMENT ----------
@api_router.get("/sentiment/portfolio")
async def sentiment_portfolio(uid: str = Depends(current_user_id)):
    symbols = await _get_held_symbols(uid)
    clean = [s.replace("-USD", "") for s in symbols]
    results = await analyze_portfolio_public(clean)
    if results:
        avg_score = round(sum(r["score"] for r in results) / len(results), 1)
    else:
        avg_score = 50
    fear_greed = await market_fear_greed_from_social()
    return {
        "per_symbol": results,
        "average_score": avg_score,
        "fear_greed": fear_greed,
    }


@api_router.get("/sentiment/{symbol}")
async def sentiment_symbol(symbol: str):
    return await analyze_symbol_public(symbol)


# ---------- ROUTES: INSIDER FLOW ----------
@api_router.get("/insider/summary")
async def insider_summary(uid: str = Depends(current_user_id)):
    symbols = await _get_held_symbols(uid)
    clean = [s.replace("-USD", "") for s in symbols]
    return await get_insider_summary(clean)


@api_router.get("/insider/congress")
async def congress_route(symbol: Optional[str] = None, limit: int = 80):
    return {"trades": await get_congress_trades(limit=limit, symbol_filter=symbol)}


@api_router.get("/insider/sec-form4")
async def sec_form4_route(symbol: Optional[str] = None, limit: int = 40):
    return {"filings": await get_sec_form4(limit=limit, symbol_filter=symbol)}


# ---------- ROUTES: HISTORY ----------
@api_router.get("/portfolio/history")
async def portfolio_history_route(range: str = "1M", benchmark: Optional[str] = None, uid: str = Depends(current_user_id)):
    docs = await db.holdings.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    return await portfolio_history(docs, range.upper(), benchmark=benchmark)


# ---------- ROUTES: OPTIONS FLOW & ALPHA SIGNAL ----------
@api_router.get("/options/flow")
async def options_flow_route(uid: str = Depends(current_user_id)):
    symbols = await _get_held_symbols(uid)
    clean = [s.replace("-USD", "") for s in symbols]
    return await get_portfolio_options_flow(clean)


@api_router.get("/options/{symbol}")
async def options_symbol(symbol: str):
    return await get_options_flow(symbol)


@api_router.get("/signal/alpha")
async def alpha_signal_route(uid: str = Depends(current_user_id)):
    symbols = await _get_held_symbols(uid)
    clean = [s.replace("-USD", "") for s in symbols]
    from sentiment_service import analyze_portfolio_public
    sent_results = await analyze_portfolio_public(clean)
    sent_map = {r["symbol"]: r["score"] for r in sent_results}
    return {"signals": await alpha_signal(clean, sent_map)}


@api_router.get("/signal/backtest")
async def signal_backtest_route(uid: str = Depends(current_user_id)):
    symbols = await _get_held_symbols(uid)
    clean = [s.replace("-USD", "") for s in symbols]
    return {"backtests": await backtest_portfolio(clean)}


# ---------- ROUTES: WATCHLIST ----------
class WatchlistSymbol(BaseModel):
    symbol: str


@api_router.get("/watchlist")
async def watchlist_list(uid: str = Depends(current_user_id)):
    docs = await db.watchlist.find({"user_id": uid}, {"_id": 0}).to_list(200)
    return {"symbols": sorted({d["symbol"] for d in docs})}


@api_router.post("/watchlist")
async def watchlist_add(data: WatchlistSymbol, uid: str = Depends(current_user_id)):
    sym = data.symbol.upper().strip()
    if not sym:
        raise HTTPException(400, "symbol required")
    await db.watchlist.update_one({"user_id": uid, "symbol": sym}, {"$set": {"user_id": uid, "symbol": sym}}, upsert=True)
    return {"ok": True, "symbol": sym}


@api_router.delete("/watchlist/{symbol}")
async def watchlist_remove(symbol: str, uid: str = Depends(current_user_id)):
    await db.watchlist.delete_one({"user_id": uid, "symbol": symbol.upper()})
    return {"ok": True}


@api_router.get("/watchlist/signals")
async def watchlist_signals(uid: str = Depends(current_user_id)):
    docs = await db.watchlist.find({"user_id": uid}, {"_id": 0}).to_list(200)
    symbols = sorted({d["symbol"] for d in docs})
    if not symbols:
        return {"signals": []}
    sent_map = {}
    tasks = [analyze_symbol_public(s) for s in symbols[:15]]
    sent_results = await asyncio.gather(*tasks)
    for r in sent_results:
        sent_map[r["symbol"]] = r["score"]
    signals = await alpha_signal(symbols, sent_map)
    quotes = await get_quotes(symbols)
    for s in signals:
        q = quotes.get(s["symbol"])
        if q:
            s["price"] = q["price"]
            s["change_pct"] = q["change_percent"]
    return {"signals": signals}


@api_router.get("/watchlist/congress/{symbol}")
async def watchlist_congress(symbol: str):
    from insider_service import get_trades_for_symbol
    return {"symbol": symbol.upper(), "trades": await get_trades_for_symbol(symbol, 20)}


# ---------- ROUTES: BREAKOUT SCANNER ----------
class NotifyPref(BaseModel):
    email: Optional[str] = None
    enabled: Optional[bool] = None


@api_router.get("/scanner/breakouts")
async def scanner_breakouts_route(uid: str = Depends(current_user_id)):
    # Include user's watchlist as extras
    wl = await db.watchlist.find({"user_id": uid}, {"_id": 0, "symbol": 1}).to_list(200)
    extras = [d["symbol"] for d in wl]
    return await scan_breakouts(extras)


@api_router.post("/scanner/notify")
async def scanner_notify_route(user=Depends(current_user)):
    pref = await db.notify_prefs.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    to_email = pref.get("email") or user["email"]
    # scan
    wl = await db.watchlist.find({"user_id": user["user_id"]}, {"_id": 0, "symbol": 1}).to_list(200)
    extras = [d["symbol"] for d in wl]
    scan = await scan_breakouts(extras, top_n=10)
    html = build_digest_html(scan, to_email)
    result = await send_digest_email(to_email, html)
    if result.get("sent"):
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await db.notify_prefs.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"last_sent_date": today_str}}
        )
    return {**result, "candidates_count": len(scan.get("candidates", []))}


@api_router.get("/scanner/prefs")
async def scanner_prefs_get(user=Depends(current_user)):
    pref = await db.notify_prefs.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    return {
        "email": pref.get("email") or user["email"],
        "enabled": pref.get("enabled", False),
        "last_sent_date": pref.get("last_sent_date"),
    }


@api_router.post("/scanner/prefs")
async def scanner_prefs_set(data: NotifyPref, user=Depends(current_user)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["user_id"] = user["user_id"]
    await db.notify_prefs.update_one({"user_id": user["user_id"]}, {"$set": update}, upsert=True)
    return update


# ---------- ROUTES: AI CHAT ----------
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str


async def _portfolio_snapshot(uid: str) -> tuple:
    docs = await db.holdings.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    held = sorted({d["symbol"].replace("-USD", "") for d in docs})
    if not docs:
        return held, {}
    quotes = await get_quotes([d["symbol"] for d in docs])
    total_value = 0.0
    total_cost = 0.0
    stock_count = 0
    crypto_count = 0
    for d in docs:
        q = quotes.get(d["symbol"].upper())
        price = q["price"] if q else d.get("avg_cost", 0)
        total_value += price * d["quantity"]
        total_cost += d["avg_cost"] * d["quantity"]
        if d.get("asset_type") == "crypto":
            crypto_count += 1
        else:
            stock_count += 1
    pl = total_value - total_cost
    pl_pct = (pl / total_cost * 100) if total_cost else 0
    return held, {
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_pl": round(pl, 2),
        "total_pl_pct": round(pl_pct, 3),
        "count": len(docs),
        "stock_count": stock_count,
        "crypto_count": crypto_count,
    }


@api_router.post("/chat/message")
async def chat_message_route(data: ChatRequest, user=Depends(current_user)):
    uid = user["user_id"]
    conv_id = data.conversation_id or f"conv_{uuid.uuid4().hex[:12]}"
    conv = await db.chat_conversations.find_one({"user_id": uid, "conversation_id": conv_id}, {"_id": 0}) or {"messages": []}
    history = conv.get("messages", [])
    held, summary = await _portfolio_snapshot(uid)
    result = await chat_answer(data.message, history, held, summary, conv_id)

    new_history = history + [
        {"role": "user", "content": data.message, "ts": datetime.now(timezone.utc).isoformat()},
        {"role": "assistant", "content": result["answer"], "sources": result.get("sources", []),
         "tickers": result.get("extracted_tickers", []), "ts": datetime.now(timezone.utc).isoformat()},
    ]
    await db.chat_conversations.update_one(
        {"user_id": uid, "conversation_id": conv_id},
        {"$set": {"user_id": uid, "conversation_id": conv_id, "messages": new_history,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"conversation_id": conv_id, "answer": result["answer"], "sources": result.get("sources", []),
            "extracted_tickers": result.get("extracted_tickers", [])}


@api_router.get("/chat/conversations")
async def chat_list_route(user=Depends(current_user)):
    uid = user["user_id"]
    convs = await db.chat_conversations.find({"user_id": uid}, {"_id": 0}).to_list(30)
    convs.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
    return {"conversations": [{
        "conversation_id": c["conversation_id"],
        "updated_at": c.get("updated_at"),
        "preview": (c.get("messages") or [{}])[0].get("content", "")[:80],
        "message_count": len(c.get("messages", [])),
    } for c in convs]}


@api_router.get("/chat/conversations/{conversation_id}")
async def chat_get_route(conversation_id: str, user=Depends(current_user)):
    conv = await db.chat_conversations.find_one({"user_id": user["user_id"], "conversation_id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "conversation not found")
    return conv


@api_router.delete("/chat/conversations/{conversation_id}")
async def chat_delete_route(conversation_id: str, user=Depends(current_user)):
    await db.chat_conversations.delete_one({"user_id": user["user_id"], "conversation_id": conversation_id})
    return {"ok": True}


@app.get("/health")
async def root_health():
    return {"status": "ok"}


# ---------- MIDDLEWARE ----------
app.include_router(api_router)

cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=r"https:\/\/.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _daily_scheduler_loop():
    """Background task to automatically send daily breakout digests to opted-in users."""
    while True:
        try:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            prefs = await db.notify_prefs.find({"enabled": True}, {"_id": 0}).to_list(100)
            for p in prefs:
                if p.get("last_sent_date") != today_str and p.get("email"):
                    logger.info(f"Auto-triggering daily breakout email for {p['email']}")
                    wl = await db.watchlist.find({"user_id": p.get("user_id")}, {"_id": 0, "symbol": 1}).to_list(200)
                    extras = [d["symbol"] for d in wl]
                    scan = await scan_breakouts(extras, top_n=10)
                    html = build_digest_html(scan, p["email"])
                    res = await send_digest_email(p["email"], html)
                    if res.get("sent"):
                        await db.notify_prefs.update_one(
                            {"user_id": p["user_id"]},
                            {"$set": {"last_sent_date": today_str}}
                        )
        except Exception as e:
            logger.warning(f"Daily email scheduler loop error: {e}")
        await asyncio.sleep(3600)  # Check hourly


@app.on_event("startup")
async def startup_scheduler():
    asyncio.create_task(_daily_scheduler_loop())
    # Non-crashing async DB ping — confirms Atlas connectivity at startup
    if getattr(db, "_engine_type", "") == "mongodb":
        try:
            await db.command("ping")
            logger.info("✓ MongoDB Atlas ping successful")
        except Exception as e:
            logger.error(f"✗ MongoDB Atlas ping failed: {e}")
            logger.error("Portfolio data will not persist. Check MONGO_URL and Atlas Network Access.")



@app.on_event("shutdown")
async def shutdown_db_client():
    if getattr(db, "_engine_type", "") == "mongodb":
        client = getattr(db, "client", None)
        if client and hasattr(client, "close") and callable(client.close):
            client.close()
