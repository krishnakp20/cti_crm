"""
Reconcile call_records with Asterisk Master.csv + queue_log after an AMI outage.

Dry run by default. Run from the backend directory:
  venv/bin/python scripts/backfill_cdr.py --since "2026-10-05 11:00:00" --until "2026-10-05 18:30:00"
  venv/bin/python scripts/backfill_cdr.py --since ... --until ... --apply [--insert-missing]

--since/--until use Master.csv time. --offset-minutes converts it to the time zone the
app stores in call_records (default 330: Master.csv UTC -> app IST).
Existing rows only get blank fields filled, plus the real end time and the status verdict
from queue_log. Nothing already filled in is overwritten.
"""
import argparse
import asyncio
import calendar
import csv
import os
import re
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402
from app.core.database import AsyncSessionLocal, engine  # noqa: E402
from app.models.cdr import CallRecord  # noqa: E402
from app.models.user import User  # noqa: E402

COLS = ["accountcode", "src", "dst", "dcontext", "clid", "channel", "dstchannel", "lastapp",
        "lastdata", "start", "answer", "end", "duration", "billsec", "disposition", "amaflags",
        "uniqueid", "userfield"]
FMT = "%Y-%m-%d %H:%M:%S"
AGENT_RE = re.compile(r"(?:PJSIP|SIP|Local)/(\d+)")


def load_calls(path, since, until, channel_prefix):
    calls = {}
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.reader(f):
            if len(row) < len(COLS):
                continue
            r = dict(zip(COLS, row))
            if not r["channel"].startswith(channel_prefix):
                continue
            try:
                start = datetime.strptime(r["start"], FMT)
                end = datetime.strptime(r["end"], FMT)
            except ValueError:
                continue
            if not (since <= start <= until):
                continue
            c = calls.setdefault(r["uniqueid"], {
                "uid": r["uniqueid"], "src": r["src"], "start": start, "end": end,
                "dst": r["dst"], "disposition": r["disposition"], "agent_ext": None,
            })
            c["start"] = min(c["start"], start)
            c["end"] = max(c["end"], end)
            if r["disposition"] == "ANSWERED":
                c["disposition"] = "ANSWERED"
            m = AGENT_RE.search(r["dstchannel"])
            if m:
                c["agent_ext"] = m.group(1)
    return calls


def load_queue_log(path, since, until):
    info = {}
    if not os.path.exists(path):
        print(f"queue_log not found at {path} - agent/queue details come from Master.csv only")
        return info
    lo = calendar.timegm(since.timetuple()) - 3600
    hi = calendar.timegm(until.timetuple()) + 3600
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            p = line.rstrip("\n").split("|")
            if len(p) < 5 or not p[0].isdigit():
                continue
            ts = int(p[0])
            if not (lo <= ts <= hi):
                continue
            uid, queue, agent, ev, data = p[1], p[2], p[3], p[4], p[5:]
            d = info.setdefault(uid, {})
            if ev == "ENTERQUEUE":
                d["queue"], d["enter"] = queue, ts
            elif ev == "CONNECT":
                d["queue"], d["agent"], d["connect"] = queue, agent, ts
                if data and data[0].isdigit():
                    d["hold"] = int(data[0])
            elif ev in ("COMPLETEAGENT", "COMPLETECALLER"):
                d["queue"], d["agent"], d["status"] = queue, agent, "completed"
                if len(data) > 1 and data[1].isdigit():
                    d["talk"] = int(data[1])
            elif ev == "ABANDON":
                d["status"] = "abandoned"
                if len(data) > 2 and data[2].isdigit():
                    d["wait"] = int(data[2])
            elif ev in ("EXITWITHTIMEOUT", "EXITEMPTY", "EXITWITHKEY"):
                d.setdefault("status", "no_answer")
    return info


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="/var/log/asterisk/cdr-csv/Master.csv")
    ap.add_argument("--queue-log", default="/var/log/asterisk/queue_log")
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--channel-prefix", default="PJSIP/vicidial-trunk")
    ap.add_argument("--offset-minutes", type=int, default=330)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--insert-missing", action="store_true")
    a = ap.parse_args()

    shift = timedelta(minutes=a.offset_minutes)
    since = datetime.strptime(a.since, FMT)
    until = datetime.strptime(a.until, FMT)
    calls = load_calls(a.csv, since, until, a.channel_prefix)
    qlog = load_queue_log(a.queue_log, since, until)
    print(f"{len(calls)} inbound calls in Master.csv for that window\n")

    users = {}

    async def user_for(db, ext):
        if ext not in users:
            users[ext] = (await db.execute(
                select(User).where(User.extension == ext, User.is_active == True)  # noqa: E712
            )).scalars().first()
        return users[ext]

    updated = missing = adopted = skipped = 0
    async with AsyncSessionLocal() as db:
        for uid, c in sorted(calls.items(), key=lambda kv: kv[1]["start"]):
            q = qlog.get(uid, {})
            real_end = c["end"] + shift
            fill = {}

            m = AGENT_RE.search(q.get("agent", ""))
            ext = m.group(1) if m else c["agent_ext"]
            if ext:
                fill["agent_extension"] = ext
                u = await user_for(db, ext)
                if u:
                    fill.update(agent_id=u.id, agent_name=u.full_name)
                    if u.client_id:
                        fill["client_id"] = u.client_id
            if q.get("queue"):
                fill["queue_name"] = q["queue"]
            if q.get("enter"):
                fill["queue_start_time"] = datetime.utcfromtimestamp(q["enter"]) + shift
            if q.get("connect"):
                fill["call_start_time"] = datetime.utcfromtimestamp(q["connect"]) + shift
            if q.get("talk") is not None:
                fill["call_duration"] = q["talk"]
            wait = q.get("hold", q.get("wait"))
            if wait is not None:
                fill["queue_duration"] = wait
            if c["dst"].isdigit() and len(c["dst"]) <= 2:
                fill["ivr_selection"] = c["dst"]
            verdict = q.get("status")

            rec = (await db.execute(
                select(CallRecord).where(CallRecord.asterisk_unique_id == uid)
            )).scalar_one_or_none()

            if rec is None:
                if not ext and not q:
                    skipped += 1
                    print(f"IVR-ONLY {uid} {c['src']} {c['start'] + shift} (never queued, not recorded by design)")
                    continue

                # A ticket saved during the outage may have created a row with no Asterisk ID
                when = fill.get("call_start_time") or (c["start"] + shift)
                orphan = (await db.execute(
                    select(CallRecord).where(
                        CallRecord.asterisk_unique_id.is_(None),
                        CallRecord.caller_number == c["src"],
                        CallRecord.call_start_time >= when - timedelta(minutes=15),
                        CallRecord.call_start_time <= when + timedelta(minutes=15),
                    ).order_by(CallRecord.call_start_time)
                )).scalars().first()

                if orphan:
                    adopted += 1
                    print(f"ADOPT    {uid} {c['src']} -> existing row id={orphan.id} (ticket #{orphan.ticket_id})")
                    if a.apply:
                        orphan.asterisk_unique_id = uid
                        for k, v in fill.items():
                            if v is not None and not getattr(orphan, k):
                                setattr(orphan, k, v)
                        if not orphan.call_end_time:
                            orphan.call_end_time = real_end
                    continue

                missing += 1
                fill.setdefault("queue_start_time", c["start"] + shift)
                print(f"MISSING  {uid} {c['src']} {c['start'] + shift} agent={ext} {verdict or c['disposition']}")
                if a.apply and a.insert_missing:
                    db.add(CallRecord(
                        asterisk_unique_id=uid, caller_number=c["src"], direction="inbound",
                        call_end_time=real_end,
                        call_status=verdict or ("completed" if ext else "no_answer"),
                        **fill,
                    ))
                continue

            changes = {k: v for k, v in fill.items() if v is not None and not getattr(rec, k)}
            if rec.call_end_time is None or abs((rec.call_end_time - real_end).total_seconds()) > 60:
                changes["call_end_time"] = real_end
            if not verdict and not ext and not rec.agent_extension and not rec.call_start_time \
                    and rec.call_status in ("initiated", "queued", "active", "answered", "completed"):
                verdict = "abandoned"   # Master.csv shows no agent was ever dialed
            if verdict and rec.call_status != verdict:
                changes["call_status"] = verdict
            if changes:
                updated += 1
                print(f"UPDATE   {uid} {c['src']} {changes}")
                if a.apply:
                    for k, v in changes.items():
                        setattr(rec, k, v)

        if a.apply:
            await db.commit()

    mode = "applied" if a.apply else "dry run, nothing written"
    print(f"\nrows to update: {updated}   adopted into existing row: {adopted}   "
          f"missing from DB: {missing}   IVR-only skipped: {skipped}   ({mode})")
    if missing and not (a.apply and a.insert_missing):
        print("Missing rows are only inserted with --apply --insert-missing")


async def run():
    try:
        await main()
    finally:
        await engine.dispose()


asyncio.run(run())
