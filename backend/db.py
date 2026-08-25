"""Dual-mode Database Adapter: Connects to MongoDB if available,
otherwise falls back automatically to a persistent local JSON document store.
Ensures zero-friction local development without hanging on connection timeouts.
"""
import os
import json
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
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
            if doc.get(k) != v:
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
        self.db._get_collection_data(self.name).append(stored)
        self.db._save()
        return InsertOneResult(stored.get("id") or stored.get("_id"))

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
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=new_doc.get("id"))
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
    def __init__(self, filepath: Path = LOCAL_DB_FILE):
        self._filepath = filepath
        self._data: Dict[str, List[Dict[str, Any]]] = {}
        self._collections: Dict[str, LocalCollection] = {}
        self._load()

    def _load(self):
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
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
            DATA_DIR.mkdir(parents=True, exist_ok=True)
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


def get_database():
    """Initializes and returns the database: Mongo if reachable, otherwise persistent local store."""
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "portfolio_manager")

    try:
        # Quick sync probe to test if MongoDB is reachable
        sync_client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=1000)
        sync_client.server_info()  # Will throw ServerSelectionTimeoutError if not reachable
        sync_client.close()

        logger.info(f"Connected to MongoDB at {mongo_url} ({db_name})")
        async_client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
        return async_client[db_name]
    except Exception as e:
        logger.info(f"MongoDB not available ({e}). Using embedded persistent local database at {LOCAL_DB_FILE}")
        return LocalDatabase(LOCAL_DB_FILE)
