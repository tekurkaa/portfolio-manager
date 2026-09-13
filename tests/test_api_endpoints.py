import pytest
import httpx
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from server import app


@pytest.mark.asyncio
async def test_auth_dev_login_and_me():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Dev login
        login_res = await client.post("/api/auth/dev-login", json={"email": "trader@terminus.local", "name": "Senior Trader"})
        assert login_res.status_code == 200
        data = login_res.json()
        assert data["email"] == "trader@terminus.local"
        assert "session_token" in data

        # Check cookie
        assert "session_token" in login_res.cookies

        # 2. Get /api/auth/me
        me_res = await client.get("/api/auth/me", cookies=login_res.cookies)
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["email"] == "trader@terminus.local"


@pytest.mark.asyncio
async def test_market_indices_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/market/indices")
        assert res.status_code == 200
        data = res.json()
        assert "indices" in data
        assert len(data["indices"]) >= 8


@pytest.mark.asyncio
async def test_portfolio_holdings_and_history():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/auth/dev-login", json={"email": "trader@terminus.local", "name": "Senior Trader"})
        cookies = login_res.cookies

        holdings_res = await client.get("/api/portfolio/holdings", cookies=cookies)
        assert holdings_res.status_code == 200
        holdings_data = holdings_res.json()
        assert "holdings" in holdings_data
        assert "summary" in holdings_data
        assert "total_value" in holdings_data["summary"]

        hist_res = await client.get("/api/portfolio/history?range=1M", cookies=cookies)
        assert hist_res.status_code == 200
        hist_data = hist_res.json()
        assert "points" in hist_data
        assert len(hist_data["points"]) > 0


@pytest.mark.asyncio
async def test_scanner_prefs_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/auth/dev-login", json={"email": "trader@terminus.local", "name": "Senior Trader"})
        cookies = login_res.cookies

        # Save preferences
        save_res = await client.post("/api/scanner/prefs", json={"email": "trader@terminus.local", "enabled": True}, cookies=cookies)
        assert save_res.status_code == 200

        # Get preferences
        get_res = await client.get("/api/scanner/prefs", cookies=cookies)
        assert get_res.status_code == 200
        prefs_data = get_res.json()
        assert prefs_data["email"] == "trader@terminus.local"
        assert prefs_data["enabled"] is True


@pytest.mark.asyncio
async def test_portfolio_holding_crud():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/auth/dev-login", json={"email": "trader@terminus.local", "name": "Senior Trader"})
        cookies = login_res.cookies

        # Create holding
        add_res = await client.post("/api/portfolio/holdings", json={
            "symbol": "AMD",
            "name": "Advanced Micro Devices",
            "quantity": 10.0,
            "avg_cost": 120.0,
            "asset_type": "stock",
        }, cookies=cookies)
        assert add_res.status_code == 200
        h = add_res.json()
        assert h["symbol"] == "AMD"
        assert h["quantity"] == 10.0
        hid = h["id"]

        # Update holding
        up_res = await client.patch(f"/api/portfolio/holdings/{hid}", json={"quantity": 15.0}, cookies=cookies)
        assert up_res.status_code == 200
        assert up_res.json()["quantity"] == 15.0

        # Delete holding
        del_res = await client.delete(f"/api/portfolio/holdings/{hid}", cookies=cookies)
        assert del_res.status_code == 200


@pytest.mark.asyncio
async def test_portfolio_history_benchmark():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/auth/dev-login", json={"email": "trader@terminus.local", "name": "Senior Trader"})
        cookies = login_res.cookies

        # Test history with SPY benchmark
        hist_res = await client.get("/api/portfolio/history?range=1M&benchmark=SPY", cookies=cookies)
        assert hist_res.status_code == 200
        hist_data = hist_res.json()
        assert "points" in hist_data
        assert "benchmark" in hist_data
        assert hist_data["benchmark"]["symbol"] == "SPY"
        assert "alpha_vs_benchmark" in hist_data


@pytest.mark.asyncio
async def test_chat_endpoints():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/auth/dev-login", json={"email": "trader@terminus.local", "name": "Senior Trader"})
        cookies = login_res.cookies

        # 1. Send chat message
        chat_res = await client.post("/api/chat/message", json={"message": "What is the outlook on AAPL?"}, cookies=cookies)
        assert chat_res.status_code == 200
        chat_data = chat_res.json()
        assert "conversation_id" in chat_data
        assert "answer" in chat_data
        assert len(chat_data["answer"]) > 0
        conv_id = chat_data["conversation_id"]

        # 2. List conversations
        list_res = await client.get("/api/chat/conversations", cookies=cookies)
        assert list_res.status_code == 200
        list_data = list_res.json()
        assert "conversations" in list_data
        assert any(c["conversation_id"] == conv_id for c in list_data["conversations"])

        # 3. Get conversation detail
        detail_res = await client.get(f"/api/chat/conversations/{conv_id}", cookies=cookies)
        assert detail_res.status_code == 200
        detail_data = detail_res.json()
        assert len(detail_data.get("messages", [])) >= 2

        # 4. Delete conversation
        del_res = await client.delete(f"/api/chat/conversations/{conv_id}", cookies=cookies)
        assert del_res.status_code == 200


@pytest.mark.asyncio
async def test_watchlist_endpoints():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/auth/dev-login", json={"email": "trader@terminus.local", "name": "Senior Trader"})
        cookies = login_res.cookies

        # Add to watchlist
        add_res = await client.post("/api/watchlist", json={"symbol": "PLTR"}, cookies=cookies)
        assert add_res.status_code == 200

        # List watchlist
        list_res = await client.get("/api/watchlist", cookies=cookies)
        assert list_res.status_code == 200
        assert "PLTR" in list_res.json().get("symbols", [])

        # Remove from watchlist
        del_res = await client.delete("/api/watchlist/PLTR", cookies=cookies)
        assert del_res.status_code == 200


@pytest.mark.asyncio
async def test_health_endpoints():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r1 = await client.get("/health")
        assert r1.status_code == 200
        assert r1.json() == {"status": "ok"}

        r2 = await client.get("/api/health")
        assert r2.status_code == 200
        assert r2.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_fifo_cost_basis_logic():
    from trade_import_service import derive_holdings_fifo

    trades = [
        {"id": "1", "symbol": "AAPL", "trans_code": "Buy", "quantity": 5.0, "price": 180.0, "activity_date": "2026-01-01", "asset_type": "stock", "row_index": 3},
        {"id": "2", "symbol": "AAPL", "trans_code": "Buy", "quantity": 3.0, "price": 200.0, "activity_date": "2026-01-15", "asset_type": "stock", "row_index": 2},
        {"id": "3", "symbol": "AAPL", "trans_code": "Sell", "quantity": 4.0, "price": 220.0, "activity_date": "2026-02-01", "asset_type": "stock", "row_index": 1},
    ]

    res = derive_holdings_fifo(trades)
    assert len(res["holdings"]) == 1
    h = res["holdings"][0]
    assert h["symbol"] == "AAPL"
    assert h["quantity"] == 4.0
    assert h["avg_cost"] == 195.0
    assert h["date_of_purchase"] == "2026-01-01"
    assert h["lot_count"] == 2
    assert len(h["active_lots"]) == 2
    assert h["active_lots"][0]["quantity"] == 1.0
    assert h["active_lots"][0]["price"] == 180.0
    assert h["active_lots"][1]["quantity"] == 3.0
    assert h["active_lots"][1]["price"] == 200.0


@pytest.mark.asyncio
async def test_import_activity_preview_and_confirm():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/auth/dev-login", json={"email": "trader@terminus.local", "name": "Senior Trader"})
        cookies = login_res.cookies

        # Prepare a sample Robinhood CSV with options, ACH, and stock/crypto
        csv_content = (
            "Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n"
            "8/19/26,8/19/26,8/20/26,NVDA,NVDA 8/28/2026 Call $255.00,STC,1,$0.29,$28.94\n"
            "8/17/26,8/17/26,8/18/26,VOO,Vanguard S&P 500 ETF,Buy,0.5,$700.00,($350.00)\n"
            "8/17/26,8/17/26,8/18/26,,ACH Deposit,ACH,,,$150.00\n"
            "8/10/26,8/10/26,8/10/26,BTC,Bitcoin,Buy,0.01,$60000.00,($600.00)\n"
            "8/7/26,8/7/26,8/7/26,SPCX,Stock Lending,SLIP,,,$0.01\n"
        )

        # 1. Preview
        files = {"file": ("robinhood_activity.csv", csv_content.encode("utf-8"), "text/csv")}
        preview_res = await client.post("/api/portfolio/import-activity/preview", files=files, cookies=cookies)
        assert preview_res.status_code == 200
        data = preview_res.json()
        assert "holdings" in data
        assert len(data["holdings"]) == 2
        symbols = [h["symbol"] for h in data["holdings"]]
        assert "VOO" in symbols
        assert "BTC" in symbols
        assert data["ignored_options_count"] == 1
        assert data["ignored_other_count"] == 2

        # 2. Confirm in replace mode
        confirm_res = await client.post("/api/portfolio/import-activity/confirm", json={
            "holdings": data["holdings"],
            "trades": data["trades"],
            "mode": "replace",
        }, cookies=cookies)
        assert confirm_res.status_code == 200
        confirm_data = confirm_res.json()
        assert confirm_data["ok"] is True
        assert confirm_data["imported_count"] == 2

        # Verify holdings endpoint returns new holdings with date_of_purchase
        holdings_res = await client.get("/api/portfolio/holdings", cookies=cookies)
        assert holdings_res.status_code == 200
        cur_holdings = holdings_res.json()["holdings"]
        voo_holding = next(h for h in cur_holdings if h["symbol"] == "VOO")
        assert voo_holding["quantity"] == 0.5
        assert voo_holding["avg_cost"] == 700.0
        assert voo_holding["date_of_purchase"] == "2026-08-17"
        assert voo_holding["lot_count"] == 1

        # 3. Confirm in merge mode with a new asset
        new_holding = {
            "symbol": "ETH",
            "name": "Ethereum",
            "quantity": 2.0,
            "avg_cost": 3000.0,
            "asset_type": "crypto",
            "date_of_purchase": "2026-08-01",
            "lot_count": 1,
            "active_lots": [{
                "symbol": "ETH",
                "asset_type": "crypto",
                "quantity": 2.0,
                "price": 3000.0,
                "trade_date": "2026-08-01",
                "broker": "robinhood",
            }],
        }
        merge_res = await client.post("/api/portfolio/import-activity/confirm", json={
            "holdings": [new_holding],
            "mode": "merge",
        }, cookies=cookies)
        assert merge_res.status_code == 200

        # Verify both previous VOO and new ETH exist
        merged_res = await client.get("/api/portfolio/holdings", cookies=cookies)
        merged_symbols = [h["symbol"] for h in merged_res.json()["holdings"]]
        assert "VOO" in merged_symbols
        assert "ETH" in merged_symbols
