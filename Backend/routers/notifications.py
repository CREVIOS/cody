from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.post("/", response_model=schemas.Notification, status_code=status.HTTP_201_CREATED)
async def create_notification(
    notification_in: schemas.NotificationCreate,
    db: AsyncSession = Depends(get_db)
):
    # Verify user exists
    user = await crud.crud_user.get(db, id=notification_in.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return await crud.crud_notification.create(db, obj_in=notification_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.Notification])
async def read_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[UUID] = None,
    is_read: Optional[bool] = None,
    notification_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if user_id:
        filters["user_id"] = user_id
    if is_read is not None:
        filters["is_read"] = is_read
    if notification_type:
        filters["notification_type"] = notification_type
    
    notifications = await crud.crud_notification.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_notification.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.Notification](
        items=notifications,
        total=total,
        page=skip // limit + 1,
        size=len(notifications),
        pages=(total + limit - 1) // limit
    )

@router.get("/{notification_id}", response_model=schemas.Notification)
async def read_notification(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    notification = await crud.crud_notification.get(db, id=notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    return notification

@router.put("/{notification_id}", response_model=schemas.Notification)
async def update_notification(
    notification_id: UUID,
    notification_update: schemas.NotificationUpdate,
    db: AsyncSession = Depends(get_db)
):
    notification = await crud.crud_notification.get(db, id=notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return await crud.crud_notification.update(db, db_obj=notification, obj_in=notification_update)

@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    notification = await crud.crud_notification.remove(db, id=notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

@router.put("/{notification_id}/mark-read", response_model=schemas.Notification)
async def mark_notification_read(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    notification = await crud.crud_notification.get(db, id=notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return await crud.crud_notification.update(
        db,
        db_obj=notification,
        obj_in=schemas.NotificationUpdate(is_read=True)
    )

@router.put("/user/{user_id}/mark-all-read", response_model=List[schemas.Notification])
async def mark_all_notifications_read(
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    # Verify user exists
    user = await crud.crud_user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get all unread notifications for the user
    notifications = await crud.crud_notification.get_multi(
        db,
        user_id=user_id,
        is_read=False
    )
    
    # Mark all as read
    updated_notifications = []
    for notification in notifications:
        updated = await crud.crud_notification.update(
            db,
            db_obj=notification,
            obj_in=schemas.NotificationUpdate(is_read=True)
        )
        updated_notifications.append(updated)
    
    return updated_notifications 