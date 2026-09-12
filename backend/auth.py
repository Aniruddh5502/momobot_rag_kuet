import os, httpx
import json
from fastapi import Header, HTTPException, status
from pydantic import BaseModel

class currentUser(BaseModel):
    id: str
    email: str

async def getCurrentUser(authorization: str = Header(None)) -> currentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Missing or malformed Authorization header."
        )
        
    token = authorization.removeprefix("Bearer ").strip()
    supabaseURL = os.environ.get("SUPABASE_URL")
    supabaseServiceRoleKey = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabaseURL or not supabaseServiceRoleKey:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Server misconfiguration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing"
        )
    
    try:
        # Use HTTP/1.1 instead of HTTP/2 to avoid connection issues
        async with httpx.AsyncClient(
            timeout=30.0,
            http2=False,  # Disable HTTP/2
            follow_redirects=True
        ) as client:
            response = await client.get(
                f"{supabaseURL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": supabaseServiceRoleKey
                }
            )
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Authentication service timed out. Please try again"
        )
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not connect to authentication service: {str(e)}"
        )
    except Exception as e:
        print(f"DEBUG: Unexpected error in getCurrentUser: {type(e).__name__} - {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify authentication: {str(e)}"
        )
        
    if response.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session Expired or Invalid. Please sign in again."
        )
    elif response.status_code != 200:
        print(f"DEBUG: Supabase returned non-200: {response.status_code} - {response.text}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify authentication with supabase: {response.status_code}"
        )
    
    user_data = response.json()
    print(f"DEBUG: User data from Supabase: {user_data}")
    if "id" not in user_data:
        print("DEBUG: ERROR: 'id' missing from user_data")
        raise HTTPException(status_code=500, detail="User ID missing from auth response")
        
    return currentUser(id=user_data["id"], email=user_data.get("email"))