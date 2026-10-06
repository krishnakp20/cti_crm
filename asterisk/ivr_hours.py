#!/usr/bin/env python3
"""
Asterisk AGI script — office hours gate.
Deploy to: /var/lib/asterisk/agi-bin/ivr_hours.py   (chmod +x)

Dialplan, once per client, before the welcome message:
  same => n,AGI(ivr_hours.py,<client_id>)

Open (or hours not enabled, or the app is unreachable): returns and the dialplan continues.
Closed: plays the client's closed message and hangs up.
Hours are managed per client in the CTI app, under IVR Routing.
"""

import sys
import os
import json
import urllib.request

API_BASE = os.getenv("CTI_API_URL", "http://localhost:8055/api/v1")
FALLBACK_CLOSED_AUDIO = "thank-you-for-calling"


def agi_read():
    return sys.stdin.readline().strip()


def agi_send(cmd):
    sys.stdout.write(cmd + "\n")
    sys.stdout.flush()
    return agi_read()


def verbose(msg):
    agi_send(f'VERBOSE "{msg}" 1')


def check_hours(client_id):
    url = f"{API_BASE}/ivr/hours?client_id={client_id}"
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            return json.loads(r.read())
    except Exception as e:
        # Never block callers because the app is down
        return {"open": True, "error": str(e)}


def main():
    while agi_read():   # discard the AGI environment headers
        pass

    client_id = sys.argv[1] if len(sys.argv) > 1 else ""
    if not client_id.isdigit():
        return

    result = check_hours(client_id)
    if result.get("error"):
        verbose(f"ivr_hours: app unreachable, letting call through ({result['error']})")
    if result.get("open", True):
        return

    verbose(f"ivr_hours: client={client_id} is closed")
    audio = result.get("closed_audio") or FALLBACK_CLOSED_AUDIO
    agi_send(f'EXEC Playback "{audio}"')
    agi_send("HANGUP")


if __name__ == "__main__":
    main()
