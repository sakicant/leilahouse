<?php
/**
 * Copy this file to api/config.php on the server and put your own hash in it.
 *
 * config.php is git-ignored on purpose: this repository is public, so a
 * password committed here would be a password published to the world.
 *
 * Generate a hash without ever typing the password into a file:
 *
 *   php -r 'echo password_hash(readline("New admin password: "), PASSWORD_DEFAULT), PHP_EOL;'
 *
 * Paste the output (it starts with $2y$) between the quotes below.
 */

return [
    'passwordHash' => '',
];
