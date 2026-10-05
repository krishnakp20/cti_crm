"""
Reconcile call_records with Asterisk Master.csv after an AMI outage.

Dry run by default. Run from the backend directory:
  venv/bin/python scripts/backfill_cdr.py --since "2026-10-05 12:00:00" --until "2026-10-05 16:00:00"
  venv/bin/python scripts/backfill_cdr.py --since ... --until ... --apply [--insert-missing]

--since/--until use Master.csv time. --offset-minutes converts it to the time zone the
app stores in call_records (default 330: Master.csv UTC -> app IST).
"""
import argparse
import asyncio
import csv
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.cdr import CallRecord  # noqa: E402

COLS = ["accountcode", "src", "dst", "dcontext", "clid", "channel", "dstchannel", "lastapp",
        "lastdata", "start", "answer", "end", "duration", "billsec", "disposition", "amaflags",
        "uniqueid", "userfield"]
FMT = "%Y-%m-%d %H:%M:%S"


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
                "dst": r["dst"], "dcontext": r["dcontext"], "disposition": r["disposition"],
            })
            c["start"] = min(c["start"], start)
            c["end"] = max(c["end"], end)
            if r["disposition"] == "ANSWERED":
                c["disposition"] = "ANSWERED"
    return calls


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="/var/log/asterisk/cdr-csv/Master.csv")
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--channel-prefix", default="PJSIP/vicidial-trunk")
    ap.add_argument("--offset-minutes", type=int, default=330)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--insert-missing", action="store_true")
    a = ap.parse_args()

    shift = timedelta(minutes=a.offset_minutes)
    calls = load_calls(a.csv, datetime.strptime(a.since, FMT), datetime.strptime(a.until, FMT),
                       a.channel_prefix)
    print(f"{len(calls)} inbound calls in Master.csv for that window")

    fixed = missing = 0
    async with AsyncSessionLocal() as db:
        for uid, c in sorted(calls.items(), key=lambda kv: kv[1]["start"]):
            real_end = c["end"] + shift
            rec = (await db.execute(
                select(CallRecord).where(CallRecord.asterisk_unique_id == uid)
            )).scalar_one_or_none()

            if rec is None:
                missing += 1
                print(f"MISSING  {uid} {c['src']} {c['start'] + shift} -> {real_end} {c['disposition']}")
                if a.apply and a.insert_missing:
                    db.add(CallRecord(
                        asterisk_unique_id=uid,
                        caller_number=c["src"],
                        ivr_selection=c["dst"] if c["dst"].isdigit() and len(c["dst"]) <= 2 else None,
                        queue_start_time=c["start"] + shift,
                        call_end_time=real_end,
                        queue_duration=int((c["end"] - c["start"]).total_seconds()),
                        call_status="completed" if c["disposition"] == "ANSWERED" else "no_answer",
                        direction="inbound",
                    ))
                continue

            if rec.call_end_time is None or abs((rec.call_end_time - real_end).total_seconds()) > 60:
                fixed += 1
                print(f"FIX END  {uid} {c['src']} db_end={rec.call_end_time} -> {real_end}")
                if a.apply:
                    rec.call_end_time = real_end
                    if rec.call_start_time is None:
                        rec.queue_duration = int((c["end"] - c["start"]).total_seconds())

        if a.apply:
            await db.commit()

    mode = "applied" if a.apply else "dry run, nothing written"
    print(f"\nwrong end time: {fixed}   missing from DB: {missing}   ({mode})")
    if missing and not (a.apply and a.insert_missing):
        print("Missing rows are only inserted with --apply --insert-missing")


asyncio.run(main())
