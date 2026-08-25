"""Emergent Google Auth integration - session verification + per-user data isolation."""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import Request, HTTPException, Response

logger = logging.getLogger(__name__)

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7


def _extract_token(request: Request) -> Optional[str]:
    """Get session_token from cookie first, then Authorization header."""
    t = request.cookies.get("session_token")
    if t:
        return t
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


async def get_current_user(request: Request, db) -> dict:
    """Dependency: validate session and return user dict. Raises 401 if invalid."""
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = sess.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
# Cross-origin cookies (Vercel → Render) require samesite=none + secure=true.
# Local dev uses samesite=lax (no HTTPS needed).
COOKIE_SAMESITE = "none" if COOKIE_SECURE else "lax"


def _set_auth_cookie(response: Response, session_token: str):
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
    )


async def exchange_session(session_id: str, db, response: Response) -> dict:
    """Exchange Emergent session_id → user + session_token cookie."""
    async with httpx.AsyncClient() as client:
        r = await client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id}, timeout=15.0)
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail=f"Session exchange failed: {r.status_code}")
    data = r.json()
    email = data.get("email")
    name = data.get("name")
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not (email and session_token):
        raise HTTPException(status_code=401, detail="Invalid session data")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc),
        })

    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    _set_auth_cookie(response, session_token)
    return {"user_id": user_id, "email": email, "name": name, "picture": picture, "session_token": session_token}


async def create_dev_session(email: str, name: str, db, response: Response) -> dict:
    """Create or login as a local user without external OAuth."""
    email = email.strip().lower()
    name = name.strip() or email.split("@")[0].capitalize()
    session_token = f"sess_{uuid.uuid4().hex}"

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name}})
        picture = existing.get("picture")
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        picture = None
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc),
        })

    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    _set_auth_cookie(response, session_token)
    return {"user_id": user_id, "email": email, "name": name, "picture": picture, "session_token": session_token}


async def logout_session(request: Request, db, response: Response):
    token = _extract_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE)
