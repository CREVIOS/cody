# ============================================================================
# BACKEND ENDPOINT: Sync auth user to public.users
# Add this to your FastAPI backend
# ============================================================================

from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from db import get_db
from uuid import UUID

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/sync-from-auth")
async def sync_user_from_auth(
    user_id: UUID,
    email: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Sync an auth user to public.users
    Called from frontend after signup if trigger doesn't work
    """
    try:
        # Check if user already exists
        result = await db.execute(
            text("SELECT user_id FROM public.users WHERE user_id = :user_id"),
            {"user_id": str(user_id)}
        )
        if result.fetchone():
            return {"message": "User already exists", "user_id": str(user_id)}
        
        # Extract username from email
        username = email.split('@')[0]
        
        # Insert user
        await db.execute(
            text("""
                INSERT INTO public.users (
                    user_id, username, email, password_hash, status, created_at
                ) VALUES (
                    :user_id, :username, :email, 'AUTH_USER_NO_PASSWORD', 'active', NOW()
                )
                ON CONFLICT (user_id) DO NOTHING
            """),
            {
                "user_id": str(user_id),
                "username": username,
                "email": email
            }
        )
        await db.commit()
        
        return {"message": "User synced successfully", "user_id": str(user_id)}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
