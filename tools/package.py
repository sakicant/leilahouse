"""Build the upload bundle for the live host.

    python tools/package.py

Produces dist/leilasibenik-site.zip containing exactly what belongs on the
server and nothing else: no build sources, no photo originals (only the
generated responsive variants are ever requested), no repository plumbing.

Files sit at the root of the zip, so it can be extracted straight into
public_html.
"""

from __future__ import annotations

import os
import shutil
import zipfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "dist")

# Whole directories that ship as-is.
DIRS = [
    "amenities", "book-now", "contact", "faq", "gallery", "hosts",
    "location", "privacy-policy",
    "assets/css", "assets/js", "assets/fonts", "assets/data", "assets/img/r",
    "api",
]

FILES = [
    "index.html", "404.html", "favicon.svg", "apple-touch-icon.png",
    "robots.txt", "sitemap.xml", ".htaccess",
    "assets/img/logo.svg", "assets/img/logo-light.svg",
    "assets/img/logo-emblem.svg", "assets/img/logo-emblem-light.svg",
    "assets/img/manifest.json",
]

# The admin panel directory is found rather than named, so renaming it needs no
# edit here. Anything starting with "manage-" is treated as the panel.
ADMIN_PREFIX = "manage-"

# Never ship these, whatever directory they turn up in.
SKIP_NAMES = {".DS_Store", "Thumbs.db", "config.php", "admin-attempts.log"}


def admin_dir() -> str | None:
    for name in sorted(os.listdir(ROOT)):
        if name.startswith(ADMIN_PREFIX) and os.path.isdir(os.path.join(ROOT, name)):
            return name
    return None


UPLOAD_NOTES = """HOUSE LEILA - UPLOAD NOTES
==========================

Everything in this zip goes into your web root (usually public_html), keeping
the folder structure exactly as it is here.

1. BACK UP WORDPRESS FIRST
   Download your current public_html, or at least wp-content/uploads, before
   you delete anything. Once the new site is up and verified you can remove the
   WordPress files and database.

2. THE .htaccess FILE
   Replace the WordPress .htaccess with the one in this zip. Do not merge the
   two: the WordPress rewrite rules will fight these. The file may be hidden in
   your FTP client, so turn on "show hidden files".

3. SET THE ADMIN PASSWORD
   Open the admin panel in a browser:
       https://your-site/{ADMIN}/
   The first time, it asks you to choose a password and then signs you in.
   Nothing to install, no hash to paste. Do this straight after uploading,
   before anyone else finds the address.

   The panel writes your password, hashed, to api/config.php. If your host
   will not let it write there, it shows you the file contents to create by
   hand instead. Once a password exists that setup screen never appears
   again, so it cannot be used to reset anything from outside.

   To change the password later: delete api/config.php on the server and open
   the panel again.

4. MAKE THE CALENDAR AND CONFIG WRITABLE
   The panel saves to assets/data/calendar.json and writes api/config.php, so
   the web server needs write permission on the assets/data folder and on api
   (chmod 775 usually does it). You can tighten api back to 755 once the
   password is set.

5. CHECK THE FROM ADDRESS
   api/contact.php has a $FROM near the top. It must be an address on your own
   domain or the host may silently drop the mail.

6. FILE PERMISSIONS
   Folders 755, files 644, and config.php 600 if your host allows it.

WHAT IS WHERE
-------------
  index.html and the page folders   the site
  assets/                           css, js, fonts, photos, calendar data
  api/contact.php                   the inquiry form handler
  api/admin.php                     the calendar admin backend
  {ADMIN}/    the calendar admin panel

The admin panel folder is deliberately not called "admin". You can rename it to
anything you like at any time: everything inside uses relative links, so no
other file needs changing.

NOT INCLUDED, ON PURPOSE
------------------------
  api/config.php        your password hash. The panel creates this itself the
                        first time you open it (step 3).
  assets/img/house|area the full-size photo originals, which the site never
                        requests. They live in the git repository as the
                        archive copy.
"""


def add_file(zf: zipfile.ZipFile, abs_path: str, rel_path: str) -> int:
    if os.path.basename(abs_path) in SKIP_NAMES:
        return 0
    zf.write(abs_path, rel_path)
    return os.path.getsize(abs_path)


def main() -> None:
    admin = admin_dir()
    if not admin:
        raise SystemExit("Could not find the admin panel directory (expected one starting with 'manage-').")

    os.makedirs(OUT_DIR, exist_ok=True)
    zip_path = os.path.join(OUT_DIR, "leilasibenik-site.zip")

    total = 0
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for rel in FILES:
            abs_path = os.path.join(ROOT, rel)
            if os.path.isfile(abs_path):
                total += add_file(zf, abs_path, rel)
                count += 1

        for d in DIRS + [admin]:
            base = os.path.join(ROOT, d)
            if not os.path.isdir(base):
                print(f"  missing, skipped: {d}")
                continue
            for dirpath, dirnames, filenames in os.walk(base):
                dirnames[:] = [x for x in dirnames if not x.startswith(".")]
                for fn in sorted(filenames):
                    abs_path = os.path.join(dirpath, fn)
                    rel_path = os.path.relpath(abs_path, ROOT).replace(os.sep, "/")
                    written = add_file(zf, abs_path, rel_path)
                    if written:
                        total += written
                        count += 1
            # .htaccess is hidden, so os.walk lists it but the dot-filter above
            # never touches files. Nothing else to do.

        zf.writestr("UPLOAD-NOTES.txt", UPLOAD_NOTES.replace("{ADMIN}", admin))
        count += 1

    size = os.path.getsize(zip_path)
    print(f"  {zip_path}")
    print(f"  {count} files, {total / 1e6:.1f} MB uncompressed, {size / 1e6:.1f} MB zipped")
    print(f"  admin panel included as: {admin}/")


if __name__ == "__main__":
    main()
