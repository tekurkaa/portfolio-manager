import pytest
import asyncio
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from db import LocalDatabase, get_database


@pytest.mark.asyncio
async def test_local_database_crud(tmp_path):
    test_db_path = tmp_path / "test_storage.json"
    ldb = LocalDatabase(str(test_db_path))

    # 1. Insert
    col = ldb["test_collection"]
    insert_res = await col.insert_one({"user_id": "u1", "symbol": "AAPL", "qty": 10})
    assert insert_res.inserted_id is not None

    # 2. Find one
    doc = await col.find_one({"symbol": "AAPL"})
    assert doc is not None
    assert doc["user_id"] == "u1"
    assert doc["qty"] == 10

    # 3. Find many
    await col.insert_one({"user_id": "u1", "symbol": "NVDA", "qty": 5})
    all_docs = await col.find({"user_id": "u1"}).to_list(100)
    assert len(all_docs) == 2

    # 4. Update
    await col.update_one({"symbol": "AAPL"}, {"$set": {"qty": 20}})
    updated_doc = await col.find_one({"symbol": "AAPL"})
    assert updated_doc["qty"] == 20

    # 5. Upsert
    await col.update_one({"symbol": "TSLA"}, {"$set": {"qty": 15, "user_id": "u1"}}, upsert=True)
    tsla_doc = await col.find_one({"symbol": "TSLA"})
    assert tsla_doc is not None
    assert tsla_doc["qty"] == 15

    # 6. Delete
    await col.delete_one({"symbol": "AAPL"})
    assert await col.find_one({"symbol": "AAPL"}) is None


@pytest.mark.asyncio
async def test_get_database_adapter():
    db_inst = get_database()
    assert db_inst is not None
    assert hasattr(db_inst, "users")
    assert hasattr(db_inst, "holdings")
    assert hasattr(db_inst, "watchlist")
