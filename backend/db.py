"""Triple-mode Database Adapter:
  1. Atlas Data API (HTTPS/port 443) — preferred for production on Render.
     Configured via ATLAS_APP_ID + ATLAS_DATA_API_KEY env vars.
     Bypasses all port-27017 TLS wire-protocol issues.
  2. PyMongo / Motor (port 27017) — used when MONGO_URL is set.
     Works locally or when wire-protocol TLS is not an issue.
  3. Local JSON file — fallback for zero-config local development.
"""
import os
import re
import json
import asyncio
import logging
import time
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
LOCAL_DB_FILE = DATA_DIR / "local_storage.json"


# ---------------------------------------------------------------------------
# Shared result types
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Mode 1: MongoDB Atlas Data API (HTTPS – no wire-protocol TLS)
# ---------------------------------------------------------------------------

class DataAPICursor:
    """Lazy cursor that fetches on to_list()."""
    def __init__(self, collection: "DataAPICollection", filter_dict: dict, projection: Optional[dict]):
        self._collection = collection
        self._filter = filter_dict
        self._projection = projection

    async def to_list(self, length: int = 1000) -> List[Dict[str, Any]]:
        payload: Dict[str, Any] = {"filter": self._collection._normalize_filter(self._filter), "limit": length}
        if self._projection:
            payload["projection"] = self._projection
        result = await self._collection._post("find", payload)
        docs = result.get("documents", [])
        return [self._fix_id(d) for d in docs]

    @staticmethod
    def _fix_id(doc: dict) -> dict:
        if "_id" in doc and isinstance(doc["_id"], dict):
            doc["_id"] = str(doc["_id"].get("$oid", ""))
        return doc


class DataAPICollection:
    """MongoDB Atlas Data API collection — communicates over HTTPS."""

    def __init__(self, name: str, db: "DataAPIDatabase"):
        self.name = name
        self.db = db

    # --- helpers ---

    def _normalize_filter(self, filter_dict: dict) -> dict:
        """Make email comparisons case-insensitive via MongoDB $regex."""
        if not filter_dict:
            return {}
        normalized = dict(filter_dict)
        if "email" in normalized and isinstance(normalized["email"], str):
            email = normalized["email"].strip().lower()
            normalized["email"] = {"$regex": f"^{re.escape(email)}$", "$options": "i"}
        return normalized

    async def _post(self, action: str, payload: dict) -> dict:
        import httpx
        url = f"{self.db.base_url}/action/{action}"
        full_payload = {
            "dataSource": self.db.data_source,
            "database": self.db.db_name,
            "collection": self.name,
            **payload,
        }
        async with httpx.AsyncClient(headers=self.db.headers, timeout=30.0) as client:
            r = await client.post(url, json=full_payload)
            r.raise_for_status()
            return r.json()

    @staticmethod
    def _fix_id(doc: dict) -> dict:
        if doc and "_id" in doc and isinstance(doc["_id"], dict):
            doc["_id"] = str(doc["_id"].get("$oid", ""))
        return doc

    # --- collection interface (matches LocalCollection / Motor) ---

    async def find_one(self, filter_dict: Optional[dict] = None, projection: Optional[dict] = None) -> Optional[dict]:
        payload: Dict[str, Any] = {"filter": self._normalize_filter(filter_dict or {})}
        if projection:
            payload["projection"] = projection
        result = await self._post("findOne", payload)
        return self._fix_id(result.get("document")) if result.get("document") else None

    def find(self, filter_dict: Optional[dict] = None, projection: Optional[dict] = None) -> DataAPICursor:
        return DataAPICursor(self, filter_dict or {}, projection)

    async def insert_one(self, doc: dict) -> InsertOneResult:
        stored = dict(doc)
        if "_id" not in stored and "id" not in stored:
            stored["id"] = str(uuid.uuid4())
        result = await self._post("insertOne", {"document": stored})
        return InsertOneResult(result.get("insertedId") or stored.get("id"))

    async def insert_many(self, docs: List[dict]) -> None:
        await self._post("insertMany", {"documents": docs})

    async def update_one(self, filter_dict: dict, update: dict, upsert: bool = False) -> UpdateResult:
        result = await self._post("updateOne", {
            "filter": self._normalize_filter(filter_dict),
            "update": update,
            "upsert": upsert,
        })
        return UpdateResult(
            matched_count=result.get("matchedCount", 0),
            modified_count=result.get("modifiedCount", 0),
            upserted_id=result.get("upsertedId"),
        )

    async def delete_one(self, filter_dict: dict) -> DeleteResult:
        result = await self._post("deleteOne", {"filter": self._normalize_filter(filter_dict)})
        return DeleteResult(deleted_count=result.get("deletedCount", 0))

    async def delete_many(self, filter_dict: dict) -> DeleteResult:
        result = await self._post("deleteMany", {"filter": self._normalize_filter(filter_dict)})
        return DeleteResult(deleted_count=result.get("deletedCount", 0))


class DataAPIDatabase:
    """Thin wrapper that holds connection config and vends DataAPICollection instances."""

    def __init__(self, app_id: str, api_key: str, db_name: str = "portfolio_manager", data_source: str = "Cluster0"):
        self.base_url = f"https://data.mongodb-api.com/app/{app_id}/endpoint/data/v1"
        self.headers = {"Content-Type": "application/json", "apiKey": api_key}
        self.db_name = db_name
        self.data_source = data_source
        self._engine_type = "data_api"
        self._collections: Dict[str, DataAPICollection] = {}

    def __getattr__(self, name: str) -> DataAPICollection:
        if name.startswith("_"):
            raise AttributeError(name)
        if name not in self._collections:
            self._collections[name] = DataAPICollection(name, self)
        return self._collections[name]

    def __getitem__(self, name: str) -> DataAPICollection:
        return getattr(self, name)

    def probe(self) -> bool:
        """Synchronous probe: sends a findOne to a throwaway collection."""
        import httpx
        try:
            payload = {
                "dataSource": self.data_source,
                "database": self.db_name,
                "collection": "_probe",
                "filter": {},
            }
            r = httpx.post(
                f"{self.base_url}/action/findOne",
                json=payload,
                headers=self.headers,
                timeout=15.0,
            )
            # 200 = found or not found; 401 = bad API key; 404 = bad app_id
            logger.info(f"Atlas Data API probe → HTTP {r.status_code}")
            return r.status_code < 500
        except Exception as e:
            logger.warning(f"Atlas Data API probe failed: {e}")
            return False


# ---------------------------------------------------------------------------
# Mode 3: Local JSON store (development / last-resort fallback)
# ---------------------------------------------------------------------------

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
                pos_keys = [k for k, v in self._projection.items() if v == 1]
                if pos_keys:
                    copied = {k: copied[k] for k in pos_keys if k in copied}
            result.append(copied)
        return result


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
                doc.update(update.get("$set", {}))
                self.db._save()
                return UpdateResult(matched_count=1, modified_count=1)
        if upsert:
            new_doc = dict(filter_dict)
            new_doc.update(update.get("$set", {}))
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


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_database():
    """
    Priority order:
      1. Atlas Data API   — if ATLAS_APP_ID + ATLAS_DATA_API_KEY are set.
                            Uses HTTPS (port 443). No wire-protocol TLS issues.
      2. PyMongo / Motor  — if MONGO_URL is set to a remote Atlas URI.
      3. Local JSON       — zero-config fallback for local development.
    """
    # ── 1. Atlas Data API ──────────────────────────────────────────────────
    atlas_app_id  = os.environ.get("ATLAS_APP_ID", "").strip()
    atlas_api_key = os.environ.get("ATLAS_DATA_API_KEY", "").strip()
    db_name       = os.environ.get("DB_NAME", "portfolio_manager")
    data_source   = os.environ.get("ATLAS_DATA_SOURCE", "Cluster0")

    if atlas_app_id and atlas_api_key:
        logger.info(f"Attempting Atlas Data API connection (app={atlas_app_id})...")
        db_instance = DataAPIDatabase(atlas_app_id, atlas_api_key, db_name, data_source)
        if db_instance.probe():
            logger.info(f"✓ Atlas Data API connected (db={db_name}, source={data_source})")
            return db_instance
        else:
            logger.error("Atlas Data API probe failed — check ATLAS_APP_ID and ATLAS_DATA_API_KEY.")
            raise RuntimeError(
                "FATAL: Atlas Data API is configured (ATLAS_APP_ID/ATLAS_DATA_API_KEY set) "
                "but the probe request failed. "
                "Check your App ID, API key, and that Data API is enabled in Atlas App Services."
            )

    # ── 2. PyMongo wire protocol ───────────────────────────────────────────
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    is_remote = "localhost" not in mongo_url and "127.0.0.1" not in mongo_url

    if is_remote:
        # Remote Atlas — must succeed; do NOT fall back to ephemeral local JSON.
        try:
            import certifi
            from motor.motor_asyncio import AsyncIOMotorClient
            import pymongo

            logger.info("Attempting PyMongo connection to MongoDB Atlas...")
            for attempt, timeout_ms in enumerate([10000, 20000, 25000], start=1):
                try:
                    sc = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=timeout_ms,
                                             tlsCAFile=certifi.where())
                    sc.server_info(); sc.close()
                    ac = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=timeout_ms,
                                           tlsCAFile=certifi.where())
                    db_instance = ac[db_name]
                    db_instance._engine_type = "mongodb"
                    logger.info(f"✓ PyMongo connected to Atlas ({db_name}) on attempt {attempt}")
                    return db_instance
                except Exception as e:
                    logger.warning(f"PyMongo attempt {attempt} failed: {type(e).__name__}: {e}")
                    if attempt < 3:
                        time.sleep(2)
        except ImportError:
            pass

        raise RuntimeError(
            "FATAL: MONGO_URL is set to a remote Atlas URI but the connection failed. "
            "To work around Render TLS issues, set ATLAS_APP_ID + ATLAS_DATA_API_KEY "
            "to use the Atlas Data API over HTTPS instead."
        )

    # ── 3. Local JSON ──────────────────────────────────────────────────────
    try:
        import certifi
        from motor.motor_asyncio import AsyncIOMotorClient
        import pymongo
        sc = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=1200, tlsCAFile=certifi.where())
        sc.server_info(); sc.close()
        from motor.motor_asyncio import AsyncIOMotorClient
        ac = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1200, tlsCAFile=certifi.where())
        db_instance = ac[db_name]
        db_instance._engine_type = "mongodb"
        logger.info(f"Connected to local MongoDB ({db_name})")
        return db_instance
    except Exception as e:
        logger.info(f"Local MongoDB not available ({e}). Using local JSON at {LOCAL_DB_FILE}")
        db_instance = LocalDatabase(LOCAL_DB_FILE)
        db_instance._engine_type = "local_json"
        return db_instance
