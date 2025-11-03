from fastapi import APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/websocket-connections", tags=["websocket-connections"])

@router.post("/", response_model=schemas.WebSocketConnection, status_code=status.HTTP_201_CREATED)
async def create_websocket_connection(
    connection_in: schemas.WebSocketConnectionCreate,
    db: AsyncSession = Depends(get_db)
):
    # Verify user exists
    user = await crud.crud_user.get(db, id=connection_in.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return await crud.crud_websocket_connection.create(db, obj_in=connection_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.WebSocketConnection])
async def read_websocket_connections(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[UUID] = None,
    is_active: Optional[bool] = None,
    connection_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if user_id:
        filters["user_id"] = user_id
    if is_active is not None:
        filters["is_active"] = is_active
    if connection_type:
        filters["connection_type"] = connection_type
    
    connections = await crud.crud_websocket_connection.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_websocket_connection.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.WebSocketConnection](
        items=connections,
        total=total,
        page=skip // limit + 1,
        size=len(connections),
        pages=(total + limit - 1) // limit
    )

@router.get("/{connection_id}", response_model=schemas.WebSocketConnection)
async def read_websocket_connection(
    connection_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    connection = await crud.crud_websocket_connection.get(db, id=connection_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WebSocket connection not found"
        )
    return connection

@router.put("/{connection_id}", response_model=schemas.WebSocketConnection)
async def update_websocket_connection(
    connection_id: UUID,
    connection_update: schemas.WebSocketConnectionUpdate,
    db: AsyncSession = Depends(get_db)
):
    connection = await crud.crud_websocket_connection.get(db, id=connection_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WebSocket connection not found"
        )
    
    return await crud.crud_websocket_connection.update(db, db_obj=connection, obj_in=connection_update)

@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_websocket_connection(
    connection_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    connection = await crud.crud_websocket_connection.remove(db, id=connection_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WebSocket connection not found"
        )

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    # Verify user exists
    user = await crud.crud_user.get(db, id=user_id)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    # Accept the connection
    await websocket.accept()
    
    try:
        # Create connection record
        connection = await crud.crud_websocket_connection.create(
            db,
            obj_in=schemas.WebSocketConnectionCreate(
                user_id=user_id,
                connection_type="websocket",
                is_active=True
            )
        )
        
        while True:
            # Receive and process messages
            data = await websocket.receive_text()
            # Process the message here
            # You can add your message handling logic
            
            # Send response
            await websocket.send_text(f"Message received: {data}")
            
    except WebSocketDisconnect:
        # Update connection status when disconnected
        if connection:
            await crud.crud_websocket_connection.update(
                db,
                db_obj=connection,
                obj_in=schemas.WebSocketConnectionUpdate(is_active=False)
            )
    except Exception as e:
        # Handle any other exceptions
        if connection:
            await crud.crud_websocket_connection.update(
                db,
                db_obj=connection,
                obj_in=schemas.WebSocketConnectionUpdate(
                    is_active=False,
                    last_error=str(e)
                )
            )
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR) 