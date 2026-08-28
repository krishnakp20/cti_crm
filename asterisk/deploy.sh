#!/bin/bash
# Deploy Asterisk IVR config to 192.168.10.30
# Run: bash asterisk/deploy.sh

SERVER=root@192.168.10.30
AST=/etc/asterisk

echo "==> Backing up..."
ssh $SERVER "cp $AST/extensions.conf $AST/extensions.conf.bak.\$(date +%Y%m%d%H%M%S)"

echo "==> Uploading extensions.conf..."
scp asterisk/extensions.conf $SERVER:$AST/extensions.conf

echo "==> Uploading pjsip-agents.conf to /tmp for manual merge..."
scp asterisk/pjsip-agents.conf $SERVER:/tmp/pjsip-agents.conf

echo ""
echo "==> On the server, merge new agents into pjsip.conf:"
echo "    cat /tmp/pjsip-agents.conf >> /etc/asterisk/pjsip.conf"
echo "    (only run once — avoid duplicate sections)"
echo ""

echo "==> Reloading dialplan..."
ssh $SERVER "asterisk -rx 'dialplan reload'"

echo "==> Reloading PJSIP..."
ssh $SERVER "asterisk -rx 'module reload res_pjsip.so'"

echo ""
echo "==> Registered endpoints:"
ssh $SERVER "asterisk -rx 'pjsip show endpoints'"

echo ""
echo "==> Create /var/lib/asterisk/sounds/custom/ and upload IVR audio:"
echo "    ivr-welcome.wav   — main menu prompt"
echo "    ivr-invalid.wav   — invalid input"
echo "    ivr-noinput.wav   — no input received"
echo ""
echo "Done."
