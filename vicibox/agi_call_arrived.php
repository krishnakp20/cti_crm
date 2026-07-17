<?php
/**
 * ViciBox AGI Script — CTI Screen Pop
 * Place this file at: /var/lib/asterisk/agi-bin/agi_call_arrived.php
 * Make executable: chmod +x /var/lib/asterisk/agi-bin/agi_call_arrived.php
 *
 * In VICIdial Admin → Campaigns → In-Group AGI (or Lead AGI):
 *   /var/lib/asterisk/agi-bin/agi_call_arrived.php
 *
 * Or call it from extensions_custom.conf:
 *   exten => _X.,1,AGI(agi_call_arrived.php)
 */

define('CTI_WEBHOOK_URL', 'http://192.168.10.5:8000/api/v1/calls/dialer/call-arrived');
// Replace with your CTI server IP/port. Use the internal network IP.

// ── Read AGI environment from Asterisk ───────────────────────────────────────
$agi_vars = [];
while (!feof(STDIN)) {
    $line = trim(fgets(STDIN));
    if ($line === '') break;
    [$key, $value] = explode(':', $line, 2);
    $agi_vars[trim($key)] = trim($value);
}

function agi($cmd) {
    echo $cmd . "\n";
    fflush(STDOUT);
    return trim(fgets(STDIN));
}

// ── Get Asterisk channel variables ───────────────────────────────────────────
$response = agi('GET VARIABLE VICIDIAL_AGENT_EXTENSION');
preg_match('/\(([^)]+)\)/', $response, $m);
$agent_extension = $m[1] ?? ($agi_vars['agi_extension'] ?? '');

$response = agi('GET VARIABLE VICIDIAL_ID');
preg_match('/\(([^)]+)\)/', $response, $m);
$uniqueid = $m[1] ?? ($agi_vars['agi_uniqueid'] ?? uniqid());

$caller_id = $agi_vars['agi_callerid'] ?? '';
$caller_name = $agi_vars['agi_calleridname'] ?? '';

$response = agi('GET VARIABLE VD_CAMPAIGN_ID');
preg_match('/\(([^)]+)\)/', $response, $m);
$campaign_id = $m[1] ?? null;

// ── POST to CTI webhook ───────────────────────────────────────────────────────
$payload = json_encode([
    'agent_extension' => $agent_extension,
    'caller_id'       => $caller_id,
    'caller_name'     => $caller_name,
    'uniqueid'        => $uniqueid,
    'campaign_id'     => $campaign_id ? (int)$campaign_id : null,
]);

$ch = curl_init(CTI_WEBHOOK_URL);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 3,   // must be fast — AGI blocks the call
]);
$result = curl_exec($ch);
curl_close($ch);

// Log result to Asterisk log
agi('VERBOSE "CTI screen-pop: ' . addslashes($result) . '" 3');

// ── Done — Asterisk continues call routing normally ───────────────────────────
exit(0);
