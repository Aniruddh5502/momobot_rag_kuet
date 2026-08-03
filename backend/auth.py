# auth.py
import os
import httpx
from fastapi import Header, HTTPException, status

from config import settings

class CurrentUser:
    def __init__(self, id: str, email: str | None):
        self.id = id
        self.email = email

async def get_current_user(authorization: str = Header(None)) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header."
        )
    
    token = authorization.removeprefix("Bearer ").strip()

    supabase_url = settings.SUPABASE_URL.rstrip("/") if settings.SUPABASE_URL else ""
    supabase_key = settings.SUPABASE_SERVICE_ROLE_KEY

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfiguration: SUPABASE_URL or SERVICE_ROLE_KEY is missing."
        )

    try:
        # Increased timeout to 10s to handle Supabase "wake up" delays on free tier
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": supabase_key
                }
            )
    except httpx.ReadTimeout:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Authentication service timed out. Please try again."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect to authentication service: {str(e)}"
        )

    if response.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please sign in again."
        )
    elif response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify authentication with Supabase."
        )

    user_data = response.json()
    return CurrentUser(id=user_data["id"], email=user_data.get("email"))