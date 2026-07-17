from typing import Dict, List, Set
from fastapi import WebSocket
import json
import enum
from loguru import logger


class _EnumEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, enum.Enum):
            return obj.value
        return super().default(obj)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.client_connections: Dict[int, Set[int]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, client_id: int = None):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

        if client_id:
            if client_id not in self.client_connections:
                self.client_connections[client_id] = set()
            self.client_connections[client_id].add(user_id)

    def disconnect(self, websocket: WebSocket, user_id: int, client_id: int = None):
        if user_id in self.active_connections:
            self.active_connections[user_id] = [
                ws for ws in self.active_connections[user_id] if ws != websocket
            ]
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            dead = []
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_text(json.dumps(message, cls=_EnumEncoder))
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.active_connections[user_id].remove(ws)

    async def broadcast_to_client(self, client_id: int, message: dict):
        if client_id in self.client_connections:
            for user_id in self.client_connections[client_id]:
                await self.send_to_user(user_id, message)

    async def broadcast_all(self, message: dict):
        for user_id in list(self.active_connections.keys()):
            await self.send_to_user(user_id, message)


manager = ConnectionManager()
