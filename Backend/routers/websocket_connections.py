from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from uuid import UUID
import crud
import schema as schemas
from db import get_db

router = APIRouter(prefix="/websocket-connections", tags=["websocket-connections"])


# Room summary API
@router.get("/room/{room_name}/summary")
async def room_summary(room_name: str, db: AsyncSession = Depends(get_db)):
    conns = await crud.crud_websocket_connection.get_multi(
        db, room_name=room_name, is_active=True, limit=1000
    )
    if not conns:
        return {
            "room_name": room_name,
            "active": 0,
            "editor_user_id": None,
            "editor_connection_id": None,
        }

    conns_sorted = sorted(conns, key=lambda c: c.created_at or c.id.hex)
    editor = conns_sorted[0]
    return {
        "room_name": room_name,
        "active": len(conns),
        "editor_user_id": str(editor.user_id),
        "editor_connection_id": str(editor.id),
    }


@router.get("/", response_model=schemas.PaginatedResponse[schemas.WebSocketConnection])
async def read_websocket_connections(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[UUID] = None,
    is_active: Optional[bool] = None,
    connection_type: Optional[str] = None,
    room_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if user_id:
        filters["user_id"] = user_id
    if is_active is not None:
        filters["is_active"] = is_active
    if connection_type:
        filters["connection_type"] = connection_type
    if room_name:
        filters["room_name"] = room_name

    items = await crud.crud_websocket_connection.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_websocket_connection.count(db, **filters)
    return schemas.PaginatedResponse[schemas.WebSocketConnection](
        items=items,
        total=total,
        page=skip // limit + 1,
        size=len(items),
        pages=(total + limit - 1) // limit
    )


@router.websocket("/ws/{room_name}/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_name: str,
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    user = await crud.crud_user.get(db, id=user_id)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    connection = None
    try:
        connection = await crud.crud_websocket_connection.create(
            db,
            obj_in=schemas.WebSocketConnectionCreate(
                user_id=user_id,
                room_name=room_name,
                connection_type="websocket",
                is_active=True
            )
        )

        while True:
            msg = await websocket.receive_text()
            await websocket.send_text(f"ack:{msg}")

    except WebSocketDisconnect:
        if connection:
            await crud.crud_websocket_connection.update(
                db, db_obj=connection, obj_in=schemas.WebSocketConnectionUpdate(is_active=False)
            )
    except Exception as e:
        if connection:
            await crud.crud_websocket_connection.update(
                db, db_obj=connection,
                obj_in=schemas.WebSocketConnectionUpdate(is_active=False, last_error=str(e))
            )
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
