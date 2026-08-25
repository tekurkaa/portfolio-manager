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
