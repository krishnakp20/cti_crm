#!/usr/bin/env python3
"""
Asterisk AGI script — IVR dynamic router.
Deploy to: /var/lib/asterisk/agi-bin/ivr_router.py
Make executable: chmod +x ivr_router.py

Called from extensions.conf:
  exten => s,n,AGI(ivr_router.py,${CLIENT_ID},${EXTEN})

The script reads routing config from the CTI API and dials
the correct agent based on press-key selection.
"""

import sys
import os
import urllib.request
import json
import time

# ── AGI I/O helpers ───────────────────────────────────────────────────────────

def agi_read():
    return sys.stdin.readline().strip()

def agi_send(cmd):
    sys.stdout.write(cmd + "\n")
    sys.stdout.flush()
    return agi_read()

def verbose(msg, level=1):
    agi_send(f'VERBOSE "{msg}" {level}')

def get_variable(name):
    resp = agi_send(f"GET VARIABLE {name}")
    # response: 200 result=1 (value)
    if "result=1" in resp:
        start = resp.find("(") + 1
        end = resp.rfind(")")
        if start > 0 and end > start:
            return resp[start:end]
    return ""

def set_variable(name, value):
    agi_send(f'SET VARIABLE {name} "{value}"')

def answer():
    agi_send("ANSWER")

def stream_file(filename, escape_digits=""):
    resp = agi_send(f'STREAM FILE "{filename}" "{escape_digits}"')
    if "result=" in resp:
        code = resp.split("result=")[1].split()[0]
        try:
            c = int(code)
            return chr(c) if c > 0 else ""
        except Exception:
            pass
    return ""

def wait_for_digit(timeout_ms=5000):
    resp = agi_send(f"WAIT FOR DIGIT {timeout_ms}")
    if "result=" in resp:
        code = resp.split("result=")[1].split()[0]
        try:
            c = int(code)
            return chr(c) if c > 0 else ""
        except Exception:
            pass
    return ""

def dial(extension, timeout=30, options=""):
    """Dial a PJSIP extension."""
    resp = agi_send(f'EXEC Dial "PJSIP/{extension},{timeout},{options}"')
    return resp

def voicemail(mailbox, options="u"):
    agi_send(f'EXEC VoiceMail "{mailbox},{options}"')

def transfer(number, timeout=30):
    agi_send(f'EXEC Dial "PJSIP/{number},{timeout}"')

def hangup():
    agi_send("HANGUP")

# ── API lookup ────────────────────────────────────────────────────────────────

API_BASE = os.getenv("CTI_API_URL", "http://localhost:8055/api/v1")

def lookup_route(client_id, press_key):
    url = f"{API_BASE}/ivr/lookup?client_id={client_id}&press_key={press_key}"
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"action": "hangup", "reason": f"api_error: {e}"}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Read AGI environment headers
    env = {}
    while True:
        line = agi_read()
        if not line:
            break
        if ":" in line:
            k, v = line.split(":", 1)
            env[k.strip()] = v.strip()

    # Args: client_id, press_key (passed from dialplan AGI call)
    args = sys.argv[1:] if len(sys.argv) > 1 else []
    client_id = args[0] if len(args) > 0 else "6"
    press_key  = args[1] if len(args) > 1 else ""

    verbose(f"ivr_router: client={client_id} key={press_key}")

    route = lookup_route(client_id, press_key)
    verbose(f"ivr_router: route={route}")

    if route.get("action") == "hangup":
        agi_send('EXEC Playback "vm-sorry"')
        hangup()
        return

    department       = route.get("department", "")
    queue_name       = route.get("queue_name")
    primary_ext      = route.get("primary_extension")
    backup_type      = route.get("backup_type", "none")
    backup_ext       = route.get("backup_extension")
    backup_number    = route.get("backup_number")
    ring_timeout     = int(route.get("ring_timeout", 30))
    override_active  = route.get("override_active", False)
    override_ext     = route.get("override_extension")

    set_variable("IVR_DEPARTMENT", department)
    set_variable("IVR_SELECTION", press_key)

    # Start recording for all calls
    call_uid = get_variable("UNIQUEID") or str(int(time.time()))
    rec_file = f"/var/spool/asterisk/monitor/{call_uid}.wav"
    agi_send(f'EXEC MixMonitor "{rec_file},b"')
    verbose(f"ivr_router: recording to {rec_file}")

    # Override: dial replacement agent directly
    if override_active and override_ext:
        verbose(f"ivr_router: override active — dialing {override_ext}")
        agi_send(f'EXEC Dial "PJSIP/{override_ext},{ring_timeout},tr"')
        dial_status = get_variable("DIALSTATUS")
        if dial_status == "ANSWER":
            hangup()
            return
        agi_send('EXEC Playback "vm-nobodyavail"')
        hangup()
        return

    # Normal routing: use Queue if configured (handles queueing + waiting)
    if queue_name:
        verbose(f"ivr_router: routing to queue={queue_name}")
        # Queue(name,options,url,announce,timeout) — 5th param is max wait seconds
        agi_send(f'EXEC Queue "{queue_name},tr,,,{ring_timeout}"')
        queue_result = get_variable("QUEUESTATUS")
        verbose(f"ivr_router: QUEUESTATUS={queue_result}")
        hangup()
        return

    # Fallback: direct dial if no queue configured
    if not primary_ext:
        agi_send('EXEC Playback "vm-sorry"')
        hangup()
        return

    agi_send(f'EXEC Dial "PJSIP/{primary_ext},{ring_timeout},tr"')
    dial_status = get_variable("DIALSTATUS")
    verbose(f"ivr_router: DIALSTATUS={dial_status}")

    if dial_status == "ANSWER":
        hangup()
        return

    if backup_type == "agent" and backup_ext:
        agi_send(f'EXEC Dial "PJSIP/{backup_ext},{ring_timeout},tr"')
    elif backup_type == "voicemail":
        agi_send(f'EXEC VoiceMail "{primary_ext},u"')
    elif backup_type == "forwarding" and backup_number:
        agi_send(f'EXEC Dial "PJSIP/{backup_number},{ring_timeout},tr"')
    else:
        agi_send('EXEC Playback "vm-nobodyavail"')

    hangup()


if __name__ == "__main__":
    main()
