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
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "695086018873-b62qtmctg53m3mfsph6a28c8m8gh03kh.apps.googleusercontent.com")
SESSION_DAYS = 7


def _extract_token(request: Request) -> Optional[str]:
    """Get session_token from Authorization header first, then fallback to cookie."""
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get("session_token")


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


async def _upsert_user_and_session(db, response: Response, email: str, name: str, picture: Optional[str], session_token: str) -> dict:
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        update_fields = {"name": name, "email": email}
        if picture is not None:
            update_fields["picture"] = picture
        else:
            picture = existing.get("picture")
        await db.users.update_one({"user_id": user_id}, {"$set": update_fields})
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


GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


async def verify_google_credential(credential: str, db, response: Response) -> dict:
    """Verify Google ID token or OAuth access token via Google APIs and issue session."""
    if not credential or not isinstance(credential, str):
        raise HTTPException(status_code=400, detail="Missing Google credential")

    data = None
    async with httpx.AsyncClient() as client:
        # First attempt: tokeninfo (standard for ID tokens / JWTs)
        try:
            r = await client.get(GOOGLE_TOKENINFO_URL, params={"id_token": credential}, timeout=10.0)
            if r.status_code == 200:
                data = r.json()
        except Exception as e:
            logger.error(f"Google tokeninfo request failed: {e}")

        # Second attempt: userinfo (standard for OAuth access tokens)
        if not data:
            try:
                r_userinfo = await client.get(
                    GOOGLE_USERINFO_URL,
                    headers={"Authorization": f"Bearer {credential}"},
                    timeout=10.0
                )
                if r_userinfo.status_code == 200:
                    data = r_userinfo.json()
            except Exception as e:
                logger.error(f"Google userinfo request failed: {e}")

    if not data:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    # Verify audience matches client ID if set and present
    expected_aud = os.environ.get("GOOGLE_CLIENT_ID") or GOOGLE_CLIENT_ID
    aud = data.get("aud")
    if expected_aud and aud and aud != expected_aud:
        logger.warning(f"Google token aud mismatch: {aud} != {expected_aud}")
        raise HTTPException(status_code=401, detail="Google client ID mismatch")

    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="No email provided in Google token")

    name = (data.get("name") or "").strip() or email.split("@")[0].capitalize()
    picture = data.get("picture")
    session_token = f"sess_{uuid.uuid4().hex}"

    return await _upsert_user_and_session(db, response, email, name, picture, session_token)


async def exchange_session(session_id: str, db, response: Response) -> dict:
    """Exchange Emergent session_id → user + session_token cookie."""
    async with httpx.AsyncClient() as client:
        r = await client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id}, timeout=15.0)
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail=f"Session exchange failed: {r.status_code}")
    data = r.json()
    email = (data.get("email") or "").strip().lower()
    name = (data.get("name") or "").strip() or email.split("@")[0].capitalize()
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not (email and session_token):
        raise HTTPException(status_code=401, detail="Invalid session data")

    return await _upsert_user_and_session(db, response, email, name, picture, session_token)


async def create_dev_session(email: str, name: str, db, response: Response) -> dict:
    """Create or login as a local user without external OAuth."""
    clean_email = email.strip().lower()
    clean_name = name.strip() or clean_email.split("@")[0].capitalize()
    session_token = f"sess_{uuid.uuid4().hex}"
    return await _upsert_user_and_session(db, response, clean_email, clean_name, None, session_token)


async def logout_session(request: Request, db, response: Response):
    token = _extract_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE)
