import pytest
from datetime import date, datetime, timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from xirr_service import (
    calculate_xirr,
    compute_holding_xirr,
    compute_portfolio_xirr,
)


def test_xirr_single_year_exact_return():
    # $10,000 invested on 2023-01-01, worth $12,000 on 2024-01-01 -> exactly 20.0%
    flows = [("2023-01-01", -10000.0), ("2024-01-01", 12000.0)]
    rate = calculate_xirr(flows)
    assert rate is not None
    assert abs(rate - 20.0) < 0.2


def test_xirr_multi_lot_investment():
    # $1,000 on 2023-01-01, $500 on 2023-07-01, worth $1,800 on 2024-01-01
    flows = [
        ("2023-01-01", -1000.0),
        ("2023-07-01", -500.0),
        ("2024-01-01", 1800.0),
    ]
    rate = calculate_xirr(flows)
    assert rate is not None
    assert 23.5 < rate < 25.0


def test_xirr_loss_scenario():
    # $10,000 on 2023-01-01, worth $8,000 on 2024-01-01 -> -20%
    flows = [("2023-01-01", -10000.0), ("2024-01-01", 8000.0)]
    rate = calculate_xirr(flows)
    assert rate is not None
    assert abs(rate - (-20.0)) < 0.2


def test_xirr_edge_cases():
    # Empty or single flow
    assert calculate_xirr([]) is None
    assert calculate_xirr([("2023-01-01", -1000.0)]) is None
    # All same sign
    assert calculate_xirr([("2023-01-01", -1000.0), ("2023-05-01", -500.0)]) is None


def test_compute_holding_xirr():
    holding = {
        "symbol": "AAPL",
        "quantity": 10.0,
        "avg_cost": 150.0,
        "price": 180.0,
        "date_of_purchase": (date.today() - timedelta(days=365)).isoformat(),
    }
    rate = compute_holding_xirr(holding)
    assert rate is not None
    # 1500 cost -> 1800 value in 1 year = 20%
    assert abs(rate - 20.0) < 0.5


def test_compute_portfolio_xirr():
    holdings = [
        {
            "symbol": "AAPL",
            "quantity": 10.0,
            "avg_cost": 150.0,
            "price": 180.0,
            "date_of_purchase": (date.today() - timedelta(days=365)).isoformat(),
        },
        {
            "symbol": "MSFT",
            "quantity": 5.0,
            "avg_cost": 300.0,
            "price": 360.0,
            "date_of_purchase": (date.today() - timedelta(days=365)).isoformat(),
        },
    ]
    rate = compute_portfolio_xirr(holdings, total_value=3600.0)
    assert rate is not None
    assert abs(rate - 20.0) < 0.5


@pytest.mark.asyncio
async def test_portfolio_holdings_api_returns_xirr():
    from httpx import AsyncClient, ASGITransport
    from server import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Dev login
        login_res = await client.post(
            "/api/auth/dev-login",
            json={"email": "xirr-tester@terminus.local", "name": "XIRR Tester"},
        )
        assert login_res.status_code == 200
        token = login_res.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Seed 1 holding
        p_date = (date.today() - timedelta(days=180)).isoformat()
        res = await client.post(
            "/api/portfolio/holdings",
            json={"symbol": "AAPL", "quantity": 10, "avg_cost": 150, "date_of_purchase": p_date},
            headers=headers,
        )
        assert res.status_code == 200

        # Fetch holdings
        get_res = await client.get(
            "/api/portfolio/holdings",
            headers=headers,
        )
        assert get_res.status_code == 200
        data = get_res.json()
        assert "summary" in data
        assert "xirr" in data["summary"]
        assert len(data["holdings"]) > 0
        first = data["holdings"][0]
        assert "xirr" in first


