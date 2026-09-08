<?php
/**
 * House Leila inquiry form handler.
 *
 * Receives the POST from /contact/ and emails it to the address in $TO using
 * the host's PHP mail(). Answers JSON so the page can show inline feedback,
 * and falls back to a plain redirect if JavaScript is off.
 *
 * Deploy: upload alongside the static site so it is reachable at /api/contact.php.
 * Requires PHP 7.4+ (works on the current LiteSpeed hosting, PHP 8.4).
 */

declare(strict_types=1);

$TO       = 'info@leilasibenik.com';
$SITE     = 'leilasibenik.com';
$FROM     = 'no-reply@leilasibenik.com';   // must be a domain address or the host may drop it
$MIN_SECS = 0;                              // raise to e.g. 3 to reject instant submits

/* ---------- helpers ------------------------------------------------------ */

function wants_json(): bool {
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    $xhr    = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    return str_contains($accept, 'application/json') || $xhr === 'XMLHttpRequest';
}

function respond(bool $ok, string $error = '', int $status = 200): never {
    if (wants_json()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($error === '' ? ['ok' => $ok] : ['ok' => $ok, 'error' => $error]);
    } else {
        header('Location: /contact/?sent=' . ($ok ? '1' : '0'), true, 303);
    }
    exit;
}

/** Strip CR/LF so a field can never inject extra mail headers. */
function clean(string $v, int $max = 300): string {
    $v = str_replace(["\r", "\n", "\0"], ' ', $v);
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
}

/* ---------- guard rails --------------------------------------------------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(false, 'Method not allowed', 405);
}

// Honeypot: real people never fill in a field they cannot see. Answer 200 so
// the bot believes it succeeded and does not retry.
if (clean((string)($_POST['website'] ?? '')) !== '') {
    respond(true);
}

$name      = clean((string)($_POST['name'] ?? ''), 120);
$email     = clean((string)($_POST['email'] ?? ''), 180);
$arrival   = clean((string)($_POST['arrival'] ?? ''), 20);
$departure = clean((string)($_POST['departure'] ?? ''), 20);
$guests    = clean((string)($_POST['guests'] ?? ''), 3);
$message   = trim((string)($_POST['message'] ?? ''));
$message   = mb_substr(str_replace("\0", '', $message), 0, 5000);

if ($name === '' || $message === '') {
    respond(false, 'Please fill in your name and a message.', 422);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'Please enter a valid email address.', 422);
}

/* ---------- compose ------------------------------------------------------- */

$lines = [
    'New inquiry from ' . $SITE,
    str_repeat('=', 40),
    '',
    'Name:       ' . $name,
    'Email:      ' . $email,
    'Arrival:    ' . ($arrival ?: 'not given'),
    'Departure:  ' . ($departure ?: 'not given'),
    'Guests:     ' . ($guests ?: 'not given'),
    '',
    'Message',
    '-------',
    $message,
    '',
    str_repeat('-', 40),
    'Sent:       ' . gmdate('Y-m-d H:i') . ' UTC',
    'IP:         ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
];
$body = implode("\n", $lines);

$subject = sprintf(
    'House Leila inquiry from %s%s',
    $name,
    $arrival !== '' ? ' (' . $arrival . ($departure !== '' ? ' to ' . $departure : '') . ')' : ''
);

$headers = implode("\r\n", [
    'From: House Leila website <' . $FROM . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'MIME-Version: 1.0',
    'X-Mailer: leilasibenik.com',
]);

$sent = @mail($TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers, '-f' . $FROM);

if (!$sent) {
    // Keep a copy locally so nothing is silently lost when the MTA is down.
    @file_put_contents(__DIR__ . '/inquiries-failed.log', $body . "\n\n", FILE_APPEND | LOCK_EX);
    respond(false, 'Mail could not be sent', 500);
}

respond(true);
