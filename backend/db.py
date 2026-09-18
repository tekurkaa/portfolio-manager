"""Database adapter: Motor (async) for remote Atlas, local JSON for dev."""
import os
import json
import uuid
import logging
from pathlib import Path
from typing import Dict, Any, List, NamedTuple

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
LOCAL_DB_FILE = DATA_DIR / "local_storage.json"


# ── Shared result types ────────────────────────────────────────────────────

class UpdateResult(NamedTuple):
    matched_count: int = 0
    modified_count: int = 0
    upserted_id: Any = None

class DeleteResult(NamedTuple):
    deleted_count: int = 0

class InsertOneResult(NamedTuple):
    inserted_id: Any = None


# ── Local JSON fallback (dev / offline) ───────────────────────────────────

class LocalCursor:
    def __init__(self, items, projection=None):
        self._items = items
        self._projection = projection or {}

    async def to_list(self, length=1000):
        result = []
        for doc in self._items[:length]:
            copied = dict(doc)
            if self._projection:
                if self._projection.get("_id") == 0:
                    copied.pop("_id", None)
                pos = [k for k, v in self._projection.items() if v == 1]
                if pos:
                    copied = {k: copied[k] for k in pos if k in copied}
            result.append(copied)
        return result


class LocalCollection:
    def __init__(self, name, db_adapter):
        self.name = name
        self.db = db_adapter

    def _matches(self, doc, flt):
        for k, v in flt.items():
            if k == "_id":
                continue
            dv = doc.get(k)
            if k == "email" and isinstance(dv, str) and isinstance(v, str):
                if dv.strip().lower() != v.strip().lower():
                    return False
            elif dv != v:
                return False
        return True

    async def find_one(self, flt=None, projection=None):
        flt = flt or {}
        for doc in self.db._get(self.name):
            if self._matches(doc, flt):
                return dict(doc)
        return None

    def find(self, flt=None, projection=None):
        flt = flt or {}
        matched = [d for d in self.db._get(self.name) if self._matches(d, flt)]
        return LocalCursor(matched, projection)

    async def insert_one(self, doc):
        stored = dict(doc)
        if "_id" not in stored and "id" not in stored:
            stored["_id"] = str(uuid.uuid4())
        self.db._get(self.name).append(stored)
        self.db._save()
        return InsertOneResult(stored.get("_id") or stored.get("id"))

    async def insert_many(self, docs):
        for doc in docs:
            self.db._get(self.name).append(dict(doc))
        self.db._save()

    async def update_one(self, flt, update, upsert=False):
        for doc in self.db._get(self.name):
            if self._matches(doc, flt):
                doc.update(update.get("$set", {}))
                self.db._save()
                return UpdateResult(1, 1)
        if upsert:
            new = {**flt, **update.get("$set", {})}
            self.db._get(self.name).append(new)
            self.db._save()
            return UpdateResult(0, 1, new.get("id") or new.get("_id"))
        return UpdateResult(0, 0)

    async def delete_one(self, flt):
        items = self.db._get(self.name)
        for i, doc in enumerate(items):
            if self._matches(doc, flt):
                items.pop(i)
                self.db._save()
                return DeleteResult(1)
        return DeleteResult(0)

    async def delete_many(self, flt):
        items = self.db._get(self.name)
        kept = [d for d in items if not self._matches(d, flt)]
        removed = len(items) - len(kept)
        if removed:
            self.db._data[self.name] = kept
            self.db._save()
        return DeleteResult(removed)


class LocalDatabase:
    def __init__(self, filepath=LOCAL_DB_FILE):
        self._filepath = Path(filepath)
        self._data: Dict[str, List] = {}
        self._cols: Dict[str, LocalCollection] = {}
        self._load()

    def _load(self):
        try:
            self._filepath.parent.mkdir(parents=True, exist_ok=True)
            if self._filepath.exists():
                self._data = json.loads(self._filepath.read_text())
        except Exception as e:
            logger.warning(f"Could not load local DB: {e}")
            self._data = {}

    def _save(self):
        try:
            self._filepath.parent.mkdir(parents=True, exist_ok=True)
            self._filepath.write_text(json.dumps(self._data, indent=2, default=str))
        except Exception as e:
            logger.error(f"Failed to save local DB: {e}")

    def _get(self, name):
        return self._data.setdefault(name, [])

    def __getattr__(self, name):
        if name not in self._cols:
            self._cols[name] = LocalCollection(name, self)
        return self._cols[name]

    def __getitem__(self, name):
        return getattr(self, name)


# ── Factory ────────────────────────────────────────────────────────────────

def get_database():
    """
    Returns a Motor database for remote Atlas, or LocalDatabase for local dev.
    Motor is lazy: it does NOT open a socket until the first database call,
    so this function never blocks and never raises on startup.
    TLS is configured with certifi for proper certificate validation.
    """
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name   = os.environ.get("DB_NAME", "portfolio_manager")
    is_remote = "localhost" not in mongo_url and "127.0.0.1" not in mongo_url

    try:
        import certifi
        from motor.motor_asyncio import AsyncIOMotorClient

        if is_remote:
            client = AsyncIOMotorClient(
                mongo_url,
                tls=True,
                tlsCAFile=certifi.where(),
                tlsAllowInvalidCertificates=False,
                serverSelectionTimeoutMS=30000,
                connectTimeoutMS=30000,
                socketTimeoutMS=30000,
                retryWrites=True,
            )
            db_instance = client[db_name]
            db_instance._engine_type = "mongodb"
            logger.info(f"Motor client created for Atlas ({db_name}) — connection is lazy.")
            return db_instance

        # Local dev fallback
        import pymongo
        sc = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=1000)
        sc.server_info()
        sc.close()
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1000)
        db_instance = client[db_name]
        db_instance._engine_type = "mongodb"
        logger.info(f"Motor connected to local MongoDB ({db_name})")
        return db_instance
    except Exception as e:
        if is_remote:
            logger.error(f"Could not create Motor client: {e}")

    logger.info(f"Using local JSON DB at {LOCAL_DB_FILE}")
    db_instance = LocalDatabase(LOCAL_DB_FILE)
    db_instance._engine_type = "local_json"
    return db_instance
