#!/bin/bash
# Configure Asterisk AMI user for DialDesk backend
# Run on 192.168.10.30

echo "==> Adding AMI user to /etc/asterisk/manager.conf..."

cat >> /etc/asterisk/manager.conf << 'EOF'

[dialdesk]
secret = dialdesk123
read = all
write = all
permit = 127.0.0.1/255.255.255.0
permit = 192.168.10.0/255.255.255.0
EOF

echo "==> Enabling AMI in manager.conf..."
sed -i 's/^;enabled = yes/enabled = yes/' /etc/asterisk/manager.conf
sed -i 's/^enabled = no/enabled = yes/' /etc/asterisk/manager.conf

# Ensure [general] has enabled=yes
if ! grep -q "^enabled = yes" /etc/asterisk/manager.conf; then
  sed -i '/^\[general\]/a enabled = yes\nport = 5038\nbindaddr = 0.0.0.0' /etc/asterisk/manager.conf
fi

echo "==> Creating recordings directory..."
mkdir -p /var/spool/asterisk/monitor
chown asterisk:asterisk /var/spool/asterisk/monitor
chmod 755 /var/spool/asterisk/monitor

echo "==> Reloading manager module..."
asterisk -rx 'module reload manager'
asterisk -rx 'manager show users'

echo ""
echo "Done. Test AMI connection:"
echo "  nc 127.0.0.1 5038"
echo "  (type: Action: Login\r\nUsername: dialdesk\r\nSecret: dialdesk123\r\n\r\n)"
