from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.websocket.manager import manager
from app.core.security import decode_token

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = int(payload.get("sub", 0))
    client_id = payload.get("client_id")

    await manager.connect(websocket, user_id, client_id)
    try:
        await websocket.send_text('{"type":"connected","message":"WebSocket connected"}')
        while True:
            data = await websocket.receive_text()
            import json
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, client_id)
