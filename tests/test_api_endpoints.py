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
