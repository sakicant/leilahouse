# House Leila (leilasibenik.com)

Static replacement for the WordPress site. Plain HTML, CSS and ~5 KB of
JavaScript, with no framework, no database and no plugins. The only server-side piece
is one PHP file that emails the inquiry form.

## Why this is faster

| | Old WordPress site | This site |
|---|---|---|
| HTML per page | 175–210 KB | 13–40 KB |
| Stylesheets | ~14 requests (Bootstrap, dashicons, 7 plugins) | 1 |
| Scripts | jQuery + plugin bundles | 1 file, deferred |
| Fonts | remote | 2 self-hosted, subset, preloaded |
| Images | one 1920 px file for every screen | 4 widths per photo via `srcset` |
| Third-party JS on load | Trustindex, Site Kit, WhatsApp widget | reviews load only when scrolled to |

A phone that previously downloaded a full-width 1920 px photo now gets the
480 px variant, roughly a tenth of the bytes.

## Layout

```
src/            source (edit here)
  layout.html   the page shell: head, header, footer
  pages/*.html  one file per page, with a <!--meta {...} --> block on top
  data/
    site.json   phone, email, address, nav, FAQ text
    icons.json  inline SVG icon paths
assets/
  img/logo*.svg the logo lockups (generated, committed)
  img/house/    original photos (1920 px)
  img/area/     drone, Krka and Aquapark photos
  img/r/        generated responsive variants, do not edit by hand
  data/calendar.json       availability, prices and seasons
  js/calendar-core.js      pricing rules shared by the site and the admin
  css/main.css  the whole design system
  js/main.js    nav, lightbox, calendar, form, lazy reviews
api/contact.php inquiry form handler (needs PHP)
api/admin.php   calendar admin API (needs PHP + api/config.php)
manage-t8orsq7hiw/  the calendar admin panel
tools/          build + image scripts
```

Everything at the repo root (`index.html`, `gallery/`, `assets/` …) is
**generated**. Edit `src/`, then rebuild.

## Working on it

```bash
node tools/build.mjs     # rebuild the HTML  (npm run build)
node tools/serve.mjs      # preview on http://localhost:4173
python tools/gen-images.py  # regenerate image variants after adding photos
```

`gen-images.py` needs Pillow (`pip install pillow`). It skips variants that
already exist, so re-running it is cheap.

### The logo

`tools/gen-logo.py` draws the gold brush-stroke fish from Bezier centrelines
offset by a width profile, and sets "House Leila" in Cormorant Garamond Italic
**as outlines**, so the logo can never render in the wrong font and needs no
webfont request. It writes four files:

| File | Use |
|---|---|
| `assets/img/logo.svg` | horizontal lockup for the site header |
| `assets/img/logo-light.svg` | same, lightened for the dark footer |
| `assets/img/logo-emblem.svg` | wordmark inside the fish, for social, print and signage |
| `favicon.svg` + `apple-touch-icon.png` | the fish alone on navy, drawn with a heavier stroke so it survives 16 px |

The outputs are committed, so you only need to run the script to change the
artwork:

```bash
pip install fonttools brotli uharfbuzz pillow
python tools/gen-logo.py
```

It expects `.build/cormorant-italic.woff2` (downloaded from Google Fonts; not
committed). Nothing at runtime depends on any of this. The site just loads the
SVGs.

### Adding a photo

1. Drop the file in `assets/img/house/` (or `assets/img/area/`).
2. Run `python tools/gen-images.py`.
3. Reference it by filename without the extension:
   `<x-photo src="house-leila-new-room" alt="…" />` in a gallery group, or
   `<x-img src="…" alt="…" sizes="…" />` anywhere else.
4. Rebuild.

### Changing text

Page copy lives in `src/pages/*.html`. Phone number, email, address, the nav
and the FAQ live in `src/data/site.json`. The FAQ is written once there and
appears both as visible text and as FAQ structured data for Google.

## The calendar, prices and the admin panel

`assets/data/calendar.json` is the single source of truth for availability and
pricing. The public calendar, the seasonal rate cards on `/book-now/`, the
quote on `/contact/` and the admin panel all read it, so none of them can
disagree with the others. The shared rules live in
`assets/js/calendar-core.js`.

```json
{
  "currency": "EUR",
  "seasons": [
    { "id": "high", "name": "High season", "from": "07-01", "to": "08-31", "price": 415, "minNights": 7 }
  ],
  "days": {
    "2026-09-08": { "status": "booked" },
    "2026-07-14": { "price": 450, "minNights": 10 }
  }
}
```

Seasons repeat every year and give the default nightly price and minimum stay.
A season may cross the year end (off-season runs 09-20 to 05-31). `days` holds
only the exceptions, so a date not listed there is available at its season
price. Setting a date back to its season value removes it from `days`, which
keeps the file small and means a later season change still reaches that date.

### Using the admin

Go to `/manage-t8orsq7hiw/`, sign in, then drag across dates to select a range. The panel
sets availability, nightly price and minimum stay for everything selected;
"Reset to season default" clears the overrides. "Season rates" opens the yearly
defaults. Nothing is written until you press Save.

### Setting the admin password

Open the panel in a browser after uploading. On a fresh install it asks you to
choose a password, writes the hash to `api/config.php`, and signs you in. Once
that file has a hash the setup screen never appears again, so it cannot be used
to reset the password from outside.

If `api/` is not writable the panel shows you the file to create by hand
instead. To change the password later, delete `api/config.php` on the server
and open the panel again.

`assets/data/` must be writable for the calendar to save. `api/config.php` and
`api/admin-attempts.log` are git-ignored and never shipped.

### The panel is not in this repository

The admin folder is git-ignored and ships only in the upload zip
(`python tools/package.py`). It holds no credentials, but there is no reason to
publish its address either. It stays on your machine and on the server.

### The panel's address

The folder is named `manage-t8orsq7hiw` rather than `admin` so the usual
bot sweeps for `/admin`, `/wp-admin` and friends find nothing. Treat that as
noise reduction, not as a secret: this repository is public, so the name is
readable by anyone who looks here. The password is what actually protects it.

If you want an address that is genuinely private, rename the folder on the
server to anything you like and do not commit that name. Everything inside it
uses relative links, so a rename needs no other edit.

### Seeing it without PHP

The panel is not deployed to Vercel at all, and Vercel could not run it anyway:
it serves static files only, so `api/admin.php` would not exist and nothing
could save. If you open the panel somewhere without PHP it says so and offers
"Look around without saving", which loads the real calendar so the layout can
be judged, with a banner across the top and Save disabled.

To use it for real you need PHP, which means either the live LiteSpeed host or
a local PHP server:

```bash
php -S localhost:8000 -t .
```

Then open `http://localhost:8000/manage-t8orsq7hiw/`.

### What the guest sees

Every free date shows its nightly rate. Picking an arrival and a departure
gives the number of nights, the rate spread and the total, and refuses ranges
that are too short for the minimum stay or that cross a booked night. "Request
these dates" carries the selection to the contact form, where it is re-priced
from the same file (never trusted from the URL) and shown as a summary. The
email that reaches you includes the exact quote the guest was looking at.

## Building the upload bundle

```bash
python tools/package.py
```

Writes `dist/leilasibenik-site.zip`: the built pages, assets, the PHP handlers
and the admin panel, with the folder structure the server expects. It leaves
out the build sources, the repository plumbing, `api/config.php`, and the
full-size photo originals, which the site never requests. The zip carries an
UPLOAD-NOTES.txt covering the steps below.

## Deploying to the current host

The site is plain files, so upload the repo root over FTP/SFTP or the cPanel
file manager into the web root (usually `public_html/`), **except** `src/`,
`tools/`, `node_modules/` and `README.md`, which are not needed in production
(`.htaccess` already blocks them if they do get uploaded).

Upload these:

```
index.html  404.html  favicon.svg  apple-touch-icon.png
robots.txt  sitemap.xml  .htaccess
amenities/  book-now/  contact/  faq/  gallery/  hosts/  location/  privacy-policy/
assets/  api/  manage-t8orsq7hiw/
```

Notes:

- **`.htaccess`** forces HTTPS and the non-www host, redirects the dead
  WordPress paths (`/wp-admin`, `/feed`, and so on), sets a one-year immutable cache on
  images and fonts, and keeps HTML always revalidating. Remove the WordPress
  `.htaccess` rules first. Do not merge the two.
- **`api/contact.php`** must land at `/api/contact.php`. Check `$FROM` inside it
  is an address on your own domain, or the host may silently drop the mail.
- URLs keep the WordPress shape (`/gallery/`, `/book-now/`, and so on), so existing
  links, bookmarks and Google's index all still resolve. `/hosts/` was
  `/hosts/` before too.
- Retire WordPress only once the static site is verified. Take a backup of
  `wp-content/uploads` first; the originals of every photo used here are in
  `assets/img/`.

## Preview on Vercel

`vercel.json` is included for review deployments. PHP does not run on Vercel,
so the inquiry form will show its "please email or WhatsApp us" fallback there.
That is expected. It works on the real host.

## Things deliberately left out

- No cookie banner: the site sets no cookies of its own. The Trustindex reviews
  widget and the Google Maps iframe are third parties; if you add analytics
  later, a banner becomes necessary.
- No search box: nine pages do not need one, and it was a WordPress default.
- Reviews still come from Trustindex, but the script now loads only when the
  reviews section scrolls into view, so it costs nothing on first paint.
