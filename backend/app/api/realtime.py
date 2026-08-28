"""
Real-time WebSocket endpoint for live dashboard.
Broadcasts AMI events to connected admin/client browsers.
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.services.ami import ami_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/realtime", tags=["realtime"])

# Active dashboard WebSocket connections
_connections: list[WebSocket] = []


async def _broadcast_to_clients(event: dict):
    dead = []
    for ws in list(_connections):
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _connections:
            _connections.remove(ws)


@router.websocket("/ws/live")
async def live_dashboard_ws(websocket: WebSocket, token: str = Query("")):
    await websocket.accept()
    _connections.append(websocket)

    # Register with AMI broadcaster
    ami_client.add_listener(_broadcast_to_clients)

    # Send current state immediately on connect
    try:
        await websocket.send_json({"type": "init", **ami_client.get_live_state()})
    except Exception:
        pass

    try:
        while True:
            # Keep alive — send ping every 30s
            await asyncio.sleep(30)
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if websocket in _connections:
            _connections.remove(websocket)
        # Only remove listener if no connections left
        if not _connections:
            try:
                ami_client.remove_listener(_broadcast_to_clients)
            except ValueError:
                pass


@router.get("/live-state")
async def live_state_http():
    """HTTP fallback for dashboards that can't use WebSocket."""
    return ami_client.get_live_state()
