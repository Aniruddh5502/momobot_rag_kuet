# auth.py
import os
import httpx
from fastapi import Header, HTTPException, status

# Strip trailing slashes to prevent double-slash URL issues (e.g., https://...co//auth)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

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

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfiguration: SUPABASE_URL or SERVICE_ROLE_KEY is missing."
        )

    try:
        # Increased timeout to 10s to handle Supabase "wake up" delays on free tier
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_SERVICE_ROLE_KEY
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