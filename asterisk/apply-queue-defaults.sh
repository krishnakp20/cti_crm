#!/bin/bash
# Make every q-* queue inherit the shared DialDesk defaults (ringinuse=no etc.).
# Safe to re-run. Run on the Asterisk server as root:
#   bash asterisk/apply-queue-defaults.sh
set -e

AST=/etc/asterisk
HERE="$(cd "$(dirname "$0")" && pwd)"

cp "$AST/queues.conf" "$AST/queues.conf.bak.$(date +%Y%m%d%H%M%S)"
cp "$HERE/queues-template.conf" "$AST/queues-template.conf"

# Template must be defined before any queue that inherits it
grep -q 'queues-template.conf' "$AST/queues.conf" || sed -i '1i #include "queues-template.conf"' "$AST/queues.conf"

# [q-name]  ->  [q-name](dialdesk-queue). Queue-level settings still win over the template.
sed -i -E 's/^\[(q-[^]]+)\][[:space:]]*$/[\1](dialdesk-queue)/' "$AST/queues.conf"

asterisk -rx "queue reload all" > /dev/null

echo "Queues inheriting the shared defaults: $(grep -c '(dialdesk-queue)' "$AST/queues.conf")"
echo "Member ringinuse state across all queues:"
asterisk -rx "queue show" | grep -o "ringinuse [a-z]*" | sort | uniq -c
