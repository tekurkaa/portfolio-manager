"""Dual-mode Database Adapter: Connects to MongoDB if available,
otherwise falls back automatically to a persistent local JSON document store.
Ensures zero-friction local development without hanging on connection timeouts.

IMPORTANT: If MONGO_URL points to a remote Atlas cluster, MongoDB is ALWAYS used
(with retries). Local JSON is only ever used for local dev (no MONGO_URL set or
MONGO_URL points to localhost/127.0.0.1).
"""
import os
import json
import asyncio
import logging
import time
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
from motor.motor_asyncio import AsyncIOMotorClient
import pymongo

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
LOCAL_DB_FILE = DATA_DIR / "local_storage.json"


class LocalCursor:
    def __init__(self, items: List[Dict[str, Any]], projection: Optional[Dict[str, Any]] = None):
        self._items = items
        self._projection = projection or {}

    async def to_list(self, length: int = 1000) -> List[Dict[str, Any]]:
        result = []
        for doc in self._items[:length]:
            copied = dict(doc)
            if self._projection:
                if self._projection.get("_id") == 0:
                    copied.pop("_id", None)
                # Check if positive projection (e.g. {"symbol": 1})
                pos_keys = [k for k, v in self._projection.items() if v == 1]
                if pos_keys:
                    copied = {k: copied[k] for k in pos_keys if k in copied}
            result.append(copied)
        return result


class UpdateResult:
    def __init__(self, matched_count: int = 0, modified_count: int = 0, upserted_id: Any = None):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.upserted_id = upserted_id


class DeleteResult:
    def __init__(self, deleted_count: int = 0):
        self.deleted_count = deleted_count


class InsertOneResult:
    def __init__(self, inserted_id: Any = None):
        self.inserted_id = inserted_id


class LocalCollection:
    def __init__(self, name: str, db_adapter: "LocalDatabase"):
        self.name = name
        self.db = db_adapter

    def _matches(self, doc: Dict[str, Any], filter_dict: Dict[str, Any]) -> bool:
        if not filter_dict:
            return True
        for k, v in filter_dict.items():
            if k == "_id":
                continue
            doc_val = doc.get(k)
            # Case-insensitive comparison for emails
            if k == "email" and isinstance(doc_val, str) and isinstance(v, str):
                if doc_val.strip().lower() != v.strip().lower():
                    return False
            elif doc_val != v:
                return False
        return True

    def _apply_projection(self, doc: Dict[str, Any], projection: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        copied = dict(doc)
        if not projection:
            return copied
        if projection.get("_id") == 0:
            copied.pop("_id", None)
        pos_keys = [k for k, v in projection.items() if v == 1]
        if pos_keys:
            copied = {k: copied[k] for k in pos_keys if k in copied}
        return copied

    async def find_one(self, filter_dict: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        filter_dict = filter_dict or {}
        items = self.db._get_collection_data(self.name)
        for doc in items:
            if self._matches(doc, filter_dict):
                return self._apply_projection(doc, projection)
        return None

    def find(self, filter_dict: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, Any]] = None) -> LocalCursor:
        filter_dict = filter_dict or {}
        items = self.db._get_collection_data(self.name)
        matched = [doc for doc in items if self._matches(doc, filter_dict)]
        return LocalCursor(matched, projection)

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        stored = dict(doc)
        if "_id" not in stored and "id" not in stored:
            import uuid
            stored["_id"] = str(uuid.uuid4())
        self.db._get_collection_data(self.name).append(stored)
        self.db._save()
        return InsertOneResult(stored.get("_id") or stored.get("id"))

    async def insert_many(self, docs: List[Dict[str, Any]]) -> None:
        for doc in docs:
            self.db._get_collection_data(self.name).append(dict(doc))
        self.db._save()

    async def update_one(self, filter_dict: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        items = self.db._get_collection_data(self.name)
        for doc in items:
            if self._matches(doc, filter_dict):
                set_vals = update.get("$set", {})
                doc.update(set_vals)
                self.db._save()
                return UpdateResult(matched_count=1, modified_count=1)
        if upsert:
            new_doc = dict(filter_dict)
            set_vals = update.get("$set", {})
            new_doc.update(set_vals)
            items.append(new_doc)
            self.db._save()
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=new_doc.get("id") or new_doc.get("_id"))
        return UpdateResult(matched_count=0, modified_count=0)

    async def delete_one(self, filter_dict: Dict[str, Any]) -> DeleteResult:
        items = self.db._get_collection_data(self.name)
        for i, doc in enumerate(items):
            if self._matches(doc, filter_dict):
                items.pop(i)
                self.db._save()
                return DeleteResult(deleted_count=1)
        return DeleteResult(deleted_count=0)

    async def delete_many(self, filter_dict: Dict[str, Any]) -> DeleteResult:
        items = self.db._get_collection_data(self.name)
        new_items = [doc for doc in items if not self._matches(doc, filter_dict)]
        count = len(items) - len(new_items)
        if count > 0:
            self.db._data[self.name] = new_items
            self.db._save()
        return DeleteResult(deleted_count=count)


class LocalDatabase:
    def __init__(self, filepath: Union[str, Path] = LOCAL_DB_FILE):
        self._filepath = Path(filepath)
        self._data: Dict[str, List[Dict[str, Any]]] = {}
        self._collections: Dict[str, LocalCollection] = {}
        self._load()

    def _load(self):
        try:
            self._filepath.parent.mkdir(parents=True, exist_ok=True)
            if self._filepath.exists():
                with open(self._filepath, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            else:
                self._data = {}
        except Exception as e:
            logger.warning(f"Could not load local database: {e}")
            self._data = {}

    def _save(self):
        try:
            self._filepath.parent.mkdir(parents=True, exist_ok=True)
            with open(self._filepath, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save local database: {e}")

    def _get_collection_data(self, name: str) -> List[Dict[str, Any]]:
        if name not in self._data:
            self._data[name] = []
        return self._data[name]

    def __getattr__(self, name: str) -> LocalCollection:
        if name not in self._collections:
            self._collections[name] = LocalCollection(name, self)
        return self._collections[name]

    def __getitem__(self, name: str) -> LocalCollection:
        return getattr(self, name)


def _is_remote_mongo(mongo_url: str) -> bool:
    """Returns True if the URL points to a remote (non-localhost) MongoDB."""
    return "localhost" not in mongo_url and "127.0.0.1" not in mongo_url


def get_database():
    """Initializes and returns the database.

    Strategy:
    - If MONGO_URL is set and points to a remote Atlas cluster, ALWAYS connect
      to MongoDB — retrying up to 3 times with increasing timeouts. Never
      silently fall back to local JSON when Atlas is the intended backend, because
      that local JSON is ephemeral on Render and causes data loss on restarts.
    - If MONGO_URL is not set or points to localhost, try MongoDB quickly and
      fall back to the persistent local JSON store for local dev convenience.
    """
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "portfolio_manager")
    is_remote = _is_remote_mongo(mongo_url)

    if is_remote:
        # --- Production / Atlas mode ---
        # Retry aggressively: we must use MongoDB so data survives restarts.
        timeouts = [8000, 15000, 25000]  # ms — 3 attempts, ~48s total
        last_err = None
        for attempt, timeout_ms in enumerate(timeouts, start=1):
            try:
                logger.info(f"Connecting to MongoDB Atlas (attempt {attempt}/{len(timeouts)}, timeout={timeout_ms}ms)...")
                sync_client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=timeout_ms)
                sync_client.server_info()
                sync_client.close()
                async_client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=timeout_ms)
                db_instance = async_client[db_name]
                db_instance._engine_type = "mongodb"
                logger.info(f"✓ Connected to MongoDB Atlas ({db_name}) on attempt {attempt}")
                return db_instance
            except Exception as e:
                last_err = e
                logger.warning(f"Atlas connection attempt {attempt} failed: {e}")
                if attempt < len(timeouts):
                    time.sleep(2)  # brief pause before retry

        # All retries exhausted — crash loudly so Render restarts the dyno
        # rather than silently losing all user data to ephemeral local JSON.
        raise RuntimeError(
            f"FATAL: Could not connect to MongoDB Atlas after {len(timeouts)} attempts. "
            f"Last error: {last_err}. "
            "Check MONGO_URL environment variable on Render and Atlas network access list."
        )
    else:
        # --- Local dev mode ---
        # Quick probe, fall back gracefully to local JSON.
        try:
            sync_client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=1200)
            sync_client.server_info()
            sync_client.close()
            async_client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1200)
            db_instance = async_client[db_name]
            db_instance._engine_type = "mongodb"
            logger.info(f"Connected to local MongoDB ({db_name})")
            return db_instance
        except Exception as e:
            logger.info(f"Local MongoDB not available ({e}). Using embedded persistent local database at {LOCAL_DB_FILE}")
            db_instance = LocalDatabase(LOCAL_DB_FILE)
            db_instance._engine_type = "local_json"
            return db_instance
