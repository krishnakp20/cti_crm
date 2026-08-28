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
            # Track inbound channels so we know callers waiting in IVR
            context = pkt.get("Context", "")
            if context in ("from-vicidial", "ivr-main"):
                caller = pkt.get("CallerIDNum", "")
                if caller and uid not in self._queue_callers:
                    self._queue_callers[uid] = datetime.now(timezone.utc)
                    await self._broadcast({
                        "type": "queue_join",
                        "uniqueid": uid,
                        "caller": caller,
                        "queue": "IVR",
                        "position": len(self._queue_callers),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    await self._save_cdr_queue_join(uid, pkt)

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
                "start": datetime.now(timezone.utc),
                "answered": False,
            }
            await self._broadcast({
                "type": "agent_called",
                "uniqueid": uid,
                "agent": agent_ext,
                "caller": caller,
                "department": dept,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        elif event == "DialEnd":
            call = self._active_calls.get(uid)
            if call and pkt.get("DialStatus") == "ANSWER":
                call["answered"] = True
                call["answer_time"] = datetime.now(timezone.utc)
                # resolve queue wait duration
                if uid in self._queue_callers:
                    call["queue_duration"] = int(
                        (call["answer_time"] - self._queue_callers[uid]).total_seconds()
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
                    duration = int((datetime.now(timezone.utc) - answer_time).total_seconds())
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

        # Queue-based events (future use)
        elif event == "QueueCallerJoin":
            self._queue_callers[uid] = datetime.now(timezone.utc)
            await self._broadcast({
                "type": "queue_join",
                "uniqueid": uid,
                "caller": pkt.get("CallerIDNum", ""),
                "queue": pkt.get("Queue", ""),
                "position": pkt.get("Position", ""),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            await self._save_cdr_queue_join(uid, pkt)

        elif event == "AgentConnect":
            self._active_calls[uid] = {
                "caller": pkt.get("CallerIDNum", ""),
                "agent": pkt.get("AgentName", ""),
                "department": _queue_to_dept(pkt.get("Queue", "")),
                "start": datetime.now(timezone.utc),
                "answered": True,
            }
            await self._broadcast({
                "type": "agent_connect",
                "uniqueid": uid,
                "agent": pkt.get("AgentName", ""),
                "caller": pkt.get("CallerIDNum", ""),
                "department": _queue_to_dept(pkt.get("Queue", "")),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            await self._save_cdr_agent_connect(uid, pkt, {})

        elif event == "MixMonitorStart":
            await self._save_recording_path(uid, pkt.get("FileName", ""))

        # Always broadcast raw for any extra consumers
        pkt["type"] = "ami_raw"
        await self._broadcast(pkt)

    # ------------------------------------------------------------------
    # DB writes (imported lazily to avoid circular imports at startup)
    # ------------------------------------------------------------------
    async def _db_session(self):
        from app.core.database import AsyncSessionLocal
        return AsyncSessionLocal()

    async def _save_cdr_queue_join(self, uid: str, pkt: dict):
        try:
            from app.models.cdr import CallRecord
            from sqlalchemy import select
            async with await self._db_session() as db:
                existing = (await db.execute(select(CallRecord).where(CallRecord.asterisk_unique_id == uid))).scalar_one_or_none()
                if not existing:
                    db.add(CallRecord(
                        asterisk_unique_id=uid,
                        caller_number=pkt.get("CallerIDNum", ""),
                        queue_name=pkt.get("Queue", ""),
                        department=_queue_to_dept(pkt.get("Queue", "")),
                        queue_start_time=datetime.now(timezone.utc),
                        call_status="queued",
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

                now = datetime.now(timezone.utc)
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
                    rec.call_end_time = datetime.now(timezone.utc)
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
                    rec.call_end_time = datetime.now(timezone.utc)
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
                    rec.call_end_time = datetime.now(timezone.utc)
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

    def get_live_state(self) -> dict:
        """Return current active calls and queue for dashboard."""
        return {
            "active_calls": [
                {
                    "uniqueid": uid,
                    "caller": v["caller"],
                    "agent": v["agent"],
                    "queue": v["queue"],
                    "duration": int((datetime.now(timezone.utc) - v["start"]).total_seconds()),
                }
                for uid, v in self._active_calls.items()
            ],
            "queue_count": len(self._queue_callers),
        }


def _queue_to_dept(queue: str) -> str:
    mapping = {
        "q-reception": "General Enquiries",
        "q-sales": "Sales & Marketing",
        "q-support": "Customer Service",
        "q-accounts": "Accounts & Finance",
        "q-hr": "HR",
        "q-logistics": "Logistics",
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
