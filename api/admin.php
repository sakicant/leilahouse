<?php
/**
 * House Leila calendar admin API.
 *
 * Backs the calendar admin panel, which edits assets/data/calendar.json:
 * nightly prices, blocked dates, minimum stays and the season defaults.
 *
 * The panel lives in a directory whose name is deliberately not referenced
 * here, so it can be renamed on the server without touching this file.
 *
 * Actions (POST, JSON in and out):
 *   login   { password }        -> starts a session
 *   logout  {}                  -> ends it
 *   session {}                  -> is the caller signed in?
 *   save    { calendar, csrf }  -> validates and writes the calendar
 *
 * The password hash lives in config.php, which is NOT in the repository.
 * Copy config.sample.php to config.php on the server and put your own hash in
 * it; see the README. Requires PHP 8.1+ (the host runs 8.4).
 */

declare(strict_types=1);

const CALENDAR_PATH = __DIR__ . '/../assets/data/calendar.json';
const CONFIG_PATH   = __DIR__ . '/config.php';
const LOG_PATH      = __DIR__ . '/admin-attempts.log';

const MAX_ATTEMPTS   = 8;      // per window, per IP
const ATTEMPT_WINDOW = 900;    // 15 minutes
const SESSION_TTL    = 43200;  // 12 hours

/* ---------- plumbing ------------------------------------------------------ */

function send(array $body, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body);
    exit;
}

function fail(string $error, int $status = 400): never {
    send(['ok' => false, 'error' => $error], $status);
}

function client_ip(): string {
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function boot_session(): void {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Strict',
        // Only mark Secure when the request really is HTTPS, or the cookie is
        // dropped entirely while testing over plain HTTP.
        'secure'   => (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off'),
    ]);
    session_name('leila_admin');
    session_start();
}

function signed_in(): bool {
    if (empty($_SESSION['admin'])) {
        return false;
    }
    if (($_SESSION['at'] ?? 0) + SESSION_TTL < time()) {
        $_SESSION = [];
        session_destroy();
        return false;
    }
    return true;
}

/* ---------- brute-force throttle ----------------------------------------- */

/** Recent failed attempts from this IP, as [timestamp, ...]. */
function recent_failures(string $ip): array {
    if (!is_file(LOG_PATH)) {
        return [];
    }
    $cutoff = time() - ATTEMPT_WINDOW;
    $keep = [];
    foreach (file(LOG_PATH, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        [$ts, $who] = array_pad(explode(' ', $line, 2), 2, '');
        if ((int)$ts >= $cutoff && $who === $ip) {
            $keep[] = (int)$ts;
        }
    }
    return $keep;
}

function record_failure(string $ip): void {
    @file_put_contents(LOG_PATH, time() . ' ' . $ip . "\n", FILE_APPEND | LOCK_EX);
    // Keep the file from growing without bound.
    if (is_file(LOG_PATH) && filesize(LOG_PATH) > 200000) {
        $lines = array_slice(file(LOG_PATH) ?: [], -500);
        @file_put_contents(LOG_PATH, implode('', $lines), LOCK_EX);
    }
}

/* ---------- calendar validation ------------------------------------------ */

function is_ymd(string $s): bool {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return false;
    }
    [$y, $m, $d] = array_map('intval', explode('-', $s));
    return checkdate($m, $d, $y);
}

function is_md(string $s): bool {
    if (!preg_match('/^\d{2}-\d{2}$/', $s)) {
        return false;
    }
    [$m, $d] = array_map('intval', explode('-', $s));
    return checkdate($m, $d, 2024);   // a leap year, so 02-29 is allowed
}

function money(mixed $v): ?int {
    if ($v === null || $v === '') {
        return null;
    }
    if (!is_numeric($v)) {
        throw new InvalidArgumentException('price must be a number');
    }
    $n = (int)round((float)$v);
    if ($n < 0 || $n > 100000) {
        throw new InvalidArgumentException('price out of range');
    }
    return $n;
}

/**
 * Rebuild the calendar from the submitted payload field by field.
 *
 * Nothing is copied across wholesale: an authenticated session should still
 * not be able to write arbitrary JSON into a file the public site reads.
 */
function clean_calendar(array $in): array {
    $out = [
        '_readme'  => 'Availability and pricing for House Leila. Edited through the admin panel. Seasons repeat every year and set the default price and minimum stay; "days" holds only the exceptions.',
        'updated'  => gmdate('Y-m-d\TH:i:s\Z'),
        'currency' => 'EUR',
        'checkIn'  => '15:00',
        'checkOut' => '10:00',
        'seasons'  => [],
        'days'     => (object)[],
    ];

    foreach (['checkIn', 'checkOut'] as $field) {
        $v = (string)($in[$field] ?? '');
        if (preg_match('/^\d{1,2}:\d{2}$/', $v)) {
            $out[$field] = $v;
        }
    }

    $seasons = $in['seasons'] ?? [];
    if (!is_array($seasons) || count($seasons) > 24) {
        throw new InvalidArgumentException('seasons must be a list of at most 24');
    }
    foreach ($seasons as $s) {
        if (!is_array($s)) {
            throw new InvalidArgumentException('bad season');
        }
        $id = preg_replace('/[^a-z0-9_-]/i', '', (string)($s['id'] ?? ''));
        $name = trim((string)($s['name'] ?? ''));
        $from = (string)($s['from'] ?? '');
        $to = (string)($s['to'] ?? '');
        if ($id === '' || $name === '' || !is_md($from) || !is_md($to)) {
            throw new InvalidArgumentException('season needs id, name and MM-DD dates');
        }
        $min = (int)($s['minNights'] ?? 1);
        $out['seasons'][] = [
            'id'        => mb_substr($id, 0, 30),
            'name'      => mb_substr($name, 0, 60),
            'from'      => $from,
            'to'        => $to,
            'price'     => money($s['price'] ?? null) ?? 0,
            'minNights' => max(1, min(60, $min)),
        ];
    }

    $days = $in['days'] ?? [];
    if (!is_array($days) || count($days) > 4000) {
        throw new InvalidArgumentException('too many day overrides');
    }
    $clean = [];
    foreach ($days as $date => $entry) {
        $date = (string)$date;
        if (!is_ymd($date) || !is_array($entry)) {
            throw new InvalidArgumentException('bad day entry: ' . $date);
        }
        $row = [];
        $status = (string)($entry['status'] ?? '');
        if ($status === 'booked') {
            $row['status'] = 'booked';
        }
        $price = money($entry['price'] ?? null);
        if ($price !== null) {
            $row['price'] = $price;
        }
        if (isset($entry['minNights']) && $entry['minNights'] !== '' && $entry['minNights'] !== null) {
            $row['minNights'] = max(1, min(60, (int)$entry['minNights']));
        }
        if (isset($entry['note']) && is_string($entry['note']) && trim($entry['note']) !== '') {
            $row['note'] = mb_substr(trim($entry['note']), 0, 200);
        }
        // A row that says nothing is just the season default; drop it.
        if ($row) {
            $clean[$date] = $row;
        }
    }
    ksort($clean);
    $out['days'] = $clean ?: (object)[];

    return $out;
}

/** Write via a temp file in the same directory, so a crash cannot truncate the live one. */
function write_calendar(array $calendar): void {
    $json = json_encode($calendar, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('could not encode calendar');
    }
    $dir = dirname(CALENDAR_PATH);
    $tmp = tempnam($dir, 'cal');
    if ($tmp === false || file_put_contents($tmp, $json . "\n", LOCK_EX) === false) {
        throw new RuntimeException('could not write calendar');
    }
    @chmod($tmp, 0644);
    if (!rename($tmp, CALENDAR_PATH)) {
        @unlink($tmp);
        throw new RuntimeException('could not replace calendar');
    }
}

/* ---------- request ------------------------------------------------------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Method not allowed', 405);
}

$raw = file_get_contents('php://input') ?: '';
if (strlen($raw) > 1500000) {
    fail('Payload too large', 413);
}
$body = json_decode($raw, true);
if (!is_array($body)) {
    fail('Expected JSON', 400);
}
$action = (string)($body['action'] ?? '');

boot_session();

if (!is_file(CONFIG_PATH)) {
    fail('The admin is not configured yet. Copy api/config.sample.php to api/config.php and set your password hash.', 503);
}
$config = require CONFIG_PATH;
$hash = (string)($config['passwordHash'] ?? '');
if ($hash === '') {
    fail('No password hash configured.', 503);
}

switch ($action) {
    case 'session':
        send(['ok' => true, 'signedIn' => signed_in(), 'csrf' => $_SESSION['csrf'] ?? null]);

    case 'login':
        $ip = client_ip();
        if (count(recent_failures($ip)) >= MAX_ATTEMPTS) {
            fail('Too many attempts. Try again in fifteen minutes.', 429);
        }
        $password = (string)($body['password'] ?? '');
        // Compare against the hash even when the field is empty, so a wrong
        // password and a missing one take the same time to answer.
        if (!password_verify($password, $hash)) {
            record_failure($ip);
            usleep(random_int(200000, 500000));
            fail('That password is not right.', 401);
        }
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['at'] = time();
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        send(['ok' => true, 'signedIn' => true, 'csrf' => $_SESSION['csrf']]);

    case 'logout':
        $_SESSION = [];
        session_destroy();
        send(['ok' => true, 'signedIn' => false]);

    case 'save':
        if (!signed_in()) {
            fail('Please sign in again.', 401);
        }
        if (!hash_equals((string)($_SESSION['csrf'] ?? ''), (string)($body['csrf'] ?? ''))) {
            fail('Stale session. Reload the page and sign in again.', 403);
        }
        if (!is_array($body['calendar'] ?? null)) {
            fail('No calendar supplied.', 400);
        }
        try {
            $calendar = clean_calendar($body['calendar']);
            write_calendar($calendar);
        } catch (InvalidArgumentException $e) {
            fail($e->getMessage(), 422);
        } catch (Throwable $e) {
            fail('Could not save. Check that assets/data/ is writable by the web server.', 500);
        }
        $_SESSION['at'] = time();
        send(['ok' => true, 'updated' => $calendar['updated']]);

    default:
        fail('Unknown action', 400);
}
