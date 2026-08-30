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

API_BASE = os.getenv("CTI_API_URL", "http://localhost:8001/api/v1")

def lookup_route(client_id, press_key):
    url = f"{API_BASE}/ivr/lookup?client_id={client_id}&press_key={press_key}"
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"action": "hangup", "reason": f"api_error: {e}"}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Read AGI environment
    env = {}
    while True:
        line = agi_read()
        if not line:
            break
        if ":" in line:
            k, v = line.split(":", 1)
            env[k.strip()] = v.strip()

    args = sys.argv[1:] if len(sys.argv) > 1 else []
    client_id = args[0] if args else get_variable("CLIENT_ID")
    if not client_id:
        verbose("ivr_router: CLIENT_ID not set")
        hangup()
        return

    answer()
    time.sleep(0.5)

    # Play welcome message (3 attempts for invalid input)
    for attempt in range(3):
        # Play welcome/menu audio
        welcome_audio = get_variable("IVR_WELCOME_AUDIO") or "custom/welcome"
        pressed = stream_file(welcome_audio, "0123456789*#")
        if not pressed:
            pressed = wait_for_digit(7000)

        if not pressed:
            stream_file("ivr/invalid")
            continue

        # Lookup route from API
        route = lookup_route(client_id, pressed)
        verbose(f"ivr_router: client={client_id} key={pressed} route={route}")

        if route.get("action") == "hangup":
            verbose(f"ivr_router: hangup reason={route.get('reason')}")
            stream_file("ivr/invalid")
            continue

        department = route.get("department", "")
        primary_ext = route.get("primary_extension")
        backup_type = route.get("backup_type", "none")
        backup_ext = route.get("backup_extension")
        backup_number = route.get("backup_number")
        ring_timeout = int(route.get("ring_timeout", 30))
        override_active = route.get("override_active", False)

        if override_active:
            verbose(f"ivr_router: override active for key={pressed}")

        set_variable("IVR_DEPARTMENT", department)
        set_variable("IVR_SELECTION", pressed)

        if not primary_ext:
            verbose("ivr_router: no primary extension configured")
            stream_file("vm-sorry")
            hangup()
            return

        # Dial primary agent
        verbose(f"ivr_router: dialing primary ext={primary_ext} timeout={ring_timeout}")
        result = agi_send(f'EXEC Dial "PJSIP/{primary_ext},{ring_timeout},tr"')
        dial_status = get_variable("DIALSTATUS")
        verbose(f"ivr_router: DIALSTATUS={dial_status}")

        if dial_status in ("ANSWER",):
            # Call connected — normal hangup
            hangup()
            return

        # Primary did not answer — try backup
        if backup_type == "agent" and backup_ext:
            verbose(f"ivr_router: backup agent ext={backup_ext}")
            agi_send(f'EXEC Dial "PJSIP/{backup_ext},{ring_timeout},tr"')
            backup_status = get_variable("DIALSTATUS")
            if backup_status == "ANSWER":
                hangup()
                return

        elif backup_type == "voicemail":
            verbose(f"ivr_router: dropping to voicemail")
            # Mailbox = primary extension number
            agi_send(f'EXEC VoiceMail "{primary_ext},u"')
            hangup()
            return

        elif backup_type == "forwarding" and backup_number:
            verbose(f"ivr_router: forwarding to {backup_number}")
            agi_send(f'EXEC Dial "PJSIP/{backup_number},{ring_timeout},tr"')
            hangup()
            return

        # No answer anywhere
        stream_file("vm-nobodyavail")
        hangup()
        return

    # Exhausted attempts
    stream_file("vm-goodbye")
    hangup()


if __name__ == "__main__":
    main()
