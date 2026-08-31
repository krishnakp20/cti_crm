"""
Asterisk AMI (Manager Interface) client.
Connects to Asterisk on port 5038, streams events,
updates CallRecord rows and broadcasts to WebSocket clients.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
import os

logger = logging.getLogger(__name__)

AMI_HOST = os.getenv("AMI_HOST", "192.168.10.30")
AMI_PORT = int(os.getenv("AMI_PORT", "5038"))
AMI_USER = os.getenv("AMI_USER", "dialdesk")
AMI_SECRET = os.getenv("AMI_SECRET", "dialdesk123")


class AMIClient:
    def __init__(self):
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self._connected = False
        self._listeners: list = []          # async callables
        self._active_calls: dict = {}       # uniqueid → call state
        self._queue_callers: dict = {}      # uniqueid → queue entry time

    def add_listener(self, fn):
        self._listeners.append(fn)

    def remove_listener(self, fn):
        self._listeners.remove(fn)

    async def _broadcast(self, event: dict):
        for fn in list(self._listeners):
            try:
                await fn(event)
            except Exception:
                pass

    async def connect(self):
        try:
            self.reader, self.writer = await asyncio.open_connection(AMI_HOST, AMI_PORT)
            await self.reader.readline()   # AMI banner
            await self._login()
            self._connected = True
            logger.info("AMI connected to %s:%s", AMI_HOST, AMI_PORT)
            asyncio.create_task(self._read_loop())
        except Exception as e:
            logger.warning("AMI connect failed: %s", e)

    async def _login(self):
        self.writer.write(
            f"Action: Login\r\nUsername: {AMI_USER}\r\nSecret: {AMI_SECRET}\r\n\r\n".encode()
        )
        await self.writer.drain()

    async def _read_loop(self):
        buf = []
        while True:
            try:
                line = await self.reader.readline()
                if not line:
                    break
                decoded = line.decode(errors="replace").rstrip("\r\n")
                if decoded == "":
                    if buf:
                        await self._handle_packet(dict(
                            (k.strip(), v.strip())
                            for k, _, v in (l.partition(":") for l in buf if ":" in l)
                        ))
                        buf = []
                else:
                    buf.append(decoded)
            except Exception as e:
                logger.warning("AMI read error: %s", e)
                break
        self._connected = False
        logger.warning("AMI disconnected — will retry in 10s")
        await asyncio.sleep(10)
        await self.connect()

    async def _handle_packet(self, pkt: dict):
        event = pkt.get("Event", "")
        uid = pkt.get("Uniqueid", pkt.get("UniqueID", ""))

        # -- IVR direct-dial tracking (no queues) --

        if event == "Newchannel":
            # Do nothing — QueueCallerJoin is the authoritative source for queue tracking
            pass

        elif event == "DialBegin":
            # Caller is now ringing an agent
            dest_uid = pkt.get("DestUniqueid", "")
            caller = pkt.get("CallerIDNum", "")
            dest_exten = pkt.get("DestExten", pkt.get("Destination", ""))
            # map DestChannel e.g. PJSIP/2001-000001 → 2001
            dest_chan = pkt.get("DestChannel", "")
            agent_ext = dest_chan.replace("PJSIP/", "").split("-")[0] if dest_chan else dest_exten
            dept = _ext_to_dept(agent_ext)
            self._active_calls[uid] = {
                "caller": caller,
                "agent_ext": agent_ext,
                "agent": agent_ext,
                "department": dept,
                "start": datetime.now(),
                "answered": False,
            }
            await self._broadcast({
                "type": "agent_called",
                "uniqueid": uid,
                "agent": agent_ext,
                "caller": caller,
                "department": dept,
                "timestamp": datetime.now().isoformat(),
            })

        elif event == "DialEnd":
            call = self._active_calls.get(uid)
            if call and pkt.get("DialStatus") == "ANSWER":
                call["answered"] = True
                call["answer_time"] = datetime.now()
                entry = self._queue_callers.get(uid)
                if entry and isinstance(entry, dict):
                    call["queue_duration"] = int(
                        (call["answer_time"] - entry["time"]).total_seconds()
                    )
                await self._broadcast({
                    "type": "agent_connect",
                    "uniqueid": uid,
                    "agent": call.get("agent", ""),
                    "caller": call.get("caller", ""),
                    "department": call.get("department", ""),
                    "timestamp": call["answer_time"].isoformat(),
                })
                await self._save_cdr_agent_connect(uid, pkt, call)

        elif event == "Hangup":
            call = self._active_calls.pop(uid, None)
            self._queue_callers.pop(uid, None)
            if call:
                if call.get("answered"):
                    answer_time = call.get("answer_time", call["start"])
                    duration = int((datetime.now() - answer_time).total_seconds())
                    await self._broadcast({
                        "type": "agent_complete",
                        "uniqueid": uid,
                        "agent": call.get("agent", ""),
                        "caller": call.get("caller", ""),
                        "department": call.get("department", ""),
                        "talk_time": str(duration),
                    })
                    await self._save_cdr_complete_hangup(uid, duration)
                else:
                    await self._broadcast({"type": "call_abandoned", "uniqueid": uid})
                    await self._save_cdr_abandoned(uid, pkt)

        # Queue-based events
        elif event == "QueueCallerJoin":
            caller = pkt.get("CallerIDNum", "")
            queue = pkt.get("Queue", "")
            self._queue_callers[uid] = {
                "caller": caller,
                "queue": queue,
                "department": _queue_to_dept(queue),
                "position": pkt.get("Position", "1"),
                "time": datetime.now(),
            }
            await self._broadcast({
                "type": "queue_join",
                "uniqueid": uid,
                "caller": caller,
                "queue": queue,
                "department": _queue_to_dept(queue),
                "position": pkt.get("Position", ""),
                "timestamp": datetime.now().isoformat(),
            })
            await self._save_cdr_queue_join(uid, pkt)

        elif event == "QueueCallerLeave":
            self._queue_callers.pop(uid, None)
            await self._broadcast({
                "type": "queue_leave",
                "uniqueid": uid,
                "queue": pkt.get("Queue", ""),
            })

        elif event == "AgentConnect":
            # AgentName from queue is like "PJSIP/2001" — strip prefix
            raw_agent = pkt.get("AgentName", "")
            agent_ext = raw_agent.replace("PJSIP/", "").replace("Local/", "").split("-")[0].split("@")[0]
            caller = pkt.get("CallerIDNum", "")
            caller_name = pkt.get("CallerIDName", "")
            queue = pkt.get("Queue", "")
            dept = _queue_to_dept(queue)
            entry = self._queue_callers.get(uid, {})
            if not caller and isinstance(entry, dict):
                caller = entry.get("caller", "")
            # Resolve agent user from DB (need id + full_name)
            agent_user = await self._resolve_agent_user(agent_ext)
            agent_name = (agent_user["full_name"] if agent_user else None) or agent_ext
            self._active_calls[uid] = {
                "caller": caller,
                "agent": agent_name,
                "agent_ext": agent_ext,
                "department": dept,
                "queue": queue,
                "start": datetime.now(),
                "answered": True,
            }
            self._queue_callers.pop(uid, None)
            await self._broadcast({
                "type": "agent_connect",
                "uniqueid": uid,
                "agent": agent_name,
                "caller": caller,
                "department": dept,
                "timestamp": datetime.now().isoformat(),
            })
            # Send call_arrive to the agent's browser so the Agent Panel pops up
            if agent_user and agent_user.get("id"):
                from app.websocket.manager import manager
                await manager.send_to_user(agent_user["id"], {
                    "type": "call_arrive",
                    "uniqueid": uid,
                    "caller_id": caller,
                    "caller_name": caller_name,
                    "department": dept,
                    "queue": queue,
                })
            await self._save_cdr_agent_connect(uid, pkt, {"agent_ext": agent_ext, "agent_name": agent_name, "department": dept})

        elif event in ("AgentComplete", "AgentDump"):
            call = self._active_calls.pop(uid, {})
            duration = int(pkt.get("TalkTime", 0))
            await self._broadcast({
                "type": "agent_complete",
                "uniqueid": uid,
                "agent": call.get("agent", ""),
                "caller": call.get("caller", ""),
                "department": call.get("department", ""),
                "talk_time": str(duration),
            })
            await self._save_cdr_complete_hangup(uid, duration)

        elif event == "MixMonitorStart":
            await self._save_recording_path(uid, pkt.get("FileName", ""))

        # Always broadcast raw for any extra consumers
        pkt["type"] = "ami_raw"
        await self._broadcast(pkt)

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------
    async def _resolve_agent_user(self, ext: str) -> dict:
        """Return {'id': int, 'full_name': str} for an agent extension, or None."""
        try:
            from app.models.user import User
            from sqlalchemy import select
            async with await self._db_session() as db:
                user = (await db.execute(select(User).where(User.extension == ext))).scalar_one_or_none()
                if user:
                    return {"id": user.id, "full_name": user.full_name}
        except Exception:
            pass
        return None

    async def _resolve_agent_name(self, ext: str) -> str:
        user = await self._resolve_agent_user(ext)
        return user["full_name"] if user else ""

    async def _db_session(self):
        from app.core.database import AsyncSessionLocal
        return AsyncSessionLocal()

    async def _save_cdr_queue_join(self, uid: str, pkt: dict):
        try:
            from app.models.cdr import CallRecord
            from app.models.user import User
            from sqlalchemy import select
            async with await self._db_session() as db:
                existing = (await db.execute(select(CallRecord).where(CallRecord.asterisk_unique_id == uid))).scalar_one_or_none()
                if not existing:
                    # Resolve client_id from any agent who has an extension (pick first active user)
                    client_id = None
                    any_user = (await db.execute(select(User).where(User.extension.isnot(None), User.client_id.isnot(None)).limit(1))).scalar_one_or_none()
                    if any_user:
                        client_id = any_user.client_id
                    db.add(CallRecord(
                        asterisk_unique_id=uid,
                        caller_number=pkt.get("CallerIDNum", ""),
                        queue_name=pkt.get("Queue", ""),
                        department=_queue_to_dept(pkt.get("Queue", "")),
                        queue_start_time=datetime.now(),
                        call_status="queued",
                        client_id=client_id,
                    ))
                    await db.commit()
        except Exception as e:
            logger.warning("CDR queue_join save error: %s", e)

    async def _save_cdr_agent_connect(self, uid: str, pkt: dict, call: dict):
        try:
            from app.models.cdr import CallRecord
            from app.models.user import User
            from sqlalchemy import select
            async with await self._db_session() as db:
                rec = (await db.execute(select(CallRecord).where(CallRecord.asterisk_unique_id == uid))).scalar_one_or_none()
                if not rec:
                    rec = CallRecord(
                        asterisk_unique_id=uid,
                        caller_number=pkt.get("CallerIDNum", call.get("caller", "")),
                    )
                    db.add(rec)

                now = datetime.now()
                # Support both queue AgentConnect and direct DialEnd
                agent_ext = (
                    call.get("agent_ext")
                    or pkt.get("AgentName", "").replace("PJSIP/", "").split("-")[0]
                    or pkt.get("DestChannel", "").replace("PJSIP/", "").split("-")[0]
                )
                rec.call_start_time = now
                rec.call_status = "answered"
                rec.agent_extension = agent_ext
                rec.queue_name = pkt.get("Queue", call.get("department", ""))
                rec.department = call.get("department") or _queue_to_dept(pkt.get("Queue", ""))

                if rec.queue_start_time:
                    qs = rec.queue_start_time
                    if qs.tzinfo is None:
                        from datetime import timezone as tz
                        qs = qs.replace(tzinfo=tz.utc)
                    rec.queue_duration = int((now - qs).total_seconds())
                elif call.get("queue_duration"):
                    rec.queue_duration = call["queue_duration"]

                user = (await db.execute(
                    select(User).where(User.extension == agent_ext)
                )).scalar_one_or_none()
                if user:
                    rec.agent_id = user.id
                    rec.agent_name = user.full_name
                    # Set client_id so agents can see their own CDR records
                    if not rec.client_id and user.client_id:
                        rec.client_id = user.client_id
                elif call.get("agent_name"):
                    rec.agent_name = call["agent_name"]
                await db.commit()
        except Exception as e:
            logger.warning("CDR agent_connect save error: %s", e)

    async def _save_cdr_complete_hangup(self, uid: str, duration: int):
        try:
            from app.models.cdr import CallRecord
            from sqlalchemy import select
            async with await self._db_session() as db:
                rec = (await db.execute(select(CallRecord).where(CallRecord.asterisk_unique_id == uid))).scalar_one_or_none()
                if rec:
                    rec.call_end_time = datetime.now()
                    rec.call_duration = duration
                    rec.call_status = "completed"
                    await db.commit()
        except Exception as e:
            logger.warning("CDR complete_hangup save error: %s", e)

    async def _save_cdr_complete(self, uid: str, pkt: dict):
        try:
            from app.models.cdr import CallRecord
            from sqlalchemy import select
            async with await self._db_session() as db:
                rec = (await db.execute(select(CallRecord).where(CallRecord.asterisk_unique_id == uid))).scalar_one_or_none()
                if rec:
                    rec.call_end_time = datetime.now()
                    rec.call_duration = int(pkt.get("TalkTime", 0))
                    rec.call_status = "completed"
                    await db.commit()
        except Exception as e:
            logger.warning("CDR complete save error: %s", e)

    async def _save_cdr_abandoned(self, uid: str, pkt: dict):
        try:
            from app.models.cdr import CallRecord
            from sqlalchemy import select
            async with await self._db_session() as db:
                rec = (await db.execute(select(CallRecord).where(CallRecord.asterisk_unique_id == uid))).scalar_one_or_none()
                if rec:
                    rec.call_end_time = datetime.now()
                    rec.call_status = "abandoned"
                    await db.commit()
        except Exception as e:
            logger.warning("CDR abandoned save error: %s", e)

    async def _save_recording_path(self, uid: str, filename: str):
        try:
            from app.models.cdr import CallRecord
            from sqlalchemy import select
            async with await self._db_session() as db:
                rec = (await db.execute(select(CallRecord).where(CallRecord.asterisk_unique_id == uid))).scalar_one_or_none()
                if rec and filename:
                    rec.recording_filename = filename.split("/")[-1]
                    rec.recording_path = filename
                    await db.commit()
        except Exception as e:
            logger.warning("CDR recording save error: %s", e)

    async def send_action(self, action: dict):
        """Send an AMI action dict and return immediately (fire-and-forget)."""
        if not self._connected or not self.writer:
            logger.warning("AMI not connected — cannot send action %s", action.get("Action"))
            return
        lines = "".join(f"{k}: {v}\r\n" for k, v in action.items()) + "\r\n"
        self.writer.write(lines.encode())
        await self.writer.drain()

    def get_live_state(self) -> dict:
        """Return current active calls and queue for dashboard."""
        now = datetime.now()
        queue_callers = []
        for uid, v in self._queue_callers.items():
            if isinstance(v, dict):
                queue_callers.append({
                    "uniqueid": uid,
                    "caller": v.get("caller", ""),
                    "queue": v.get("queue", ""),
                    "department": v.get("department", ""),
                    "position": v.get("position", ""),
                    "wait": int((now - v["time"]).total_seconds()),
                })
        return {
            "active_calls": [
                {
                    "uniqueid": uid,
                    "caller": v["caller"],
                    "agent": v.get("agent") or v.get("agent_ext", ""),
                    "agent_ext": v.get("agent_ext", ""),
                    "department": v.get("department", ""),
                    "queue": v.get("queue", v.get("department", "")),
                    "duration": int((now - v["start"]).total_seconds()),
                }
                for uid, v in self._active_calls.items()
            ],
            "queue_count": len(self._queue_callers),
            "queue_callers": queue_callers,
        }


def _queue_to_dept(queue: str) -> str:
    mapping = {
        "q-general": "General Enquiries",
        "q-sales-day": "Sales & Marketing",
        "q-sales-eve": "Sales & Marketing",
        "q-support-day": "Customer Service",
        "q-support-eve": "Customer Service",
        "q-accounts": "Accounts & Finance",
        "q-hr": "HR",
        "q-operator": "Speak with Operator",
        # legacy names
        "q-reception": "General Enquiries",
        "q-sales": "Sales & Marketing",
        "q-support": "Customer Service",
    }
    return mapping.get(queue, queue)


def _ext_to_dept(ext: str) -> str:
    # Map agent extension → department (matches your IVR routing)
    mapping = {
        "2001": "General Enquiries",   # Pankhuri
        "2002": "Sales & Marketing",   # Sanjiv
        "2003": "Sales & Marketing",   # Aman (evening sales/support)
        "2004": "Accounts & Finance",  # Rahul
        "2005": "HR",                  # Anvita
    }
    return mapping.get(ext, ext)


# Global singleton
ami_client = AMIClient()
