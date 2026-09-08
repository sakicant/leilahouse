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
  data/availability.json   booked dates for the calendar
  css/main.css  the whole design system
  js/main.js    nav, lightbox, calendar, form, lazy reviews
api/contact.php inquiry form handler (needs PHP)
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

## The availability calendar

`assets/data/availability.json` drives the calendar on `/book-now/`:

```json
{
  "updated": "2026-09-08",
  "booked": [
    { "from": "2026-07-01", "to": "2026-07-14" },
    "2026-08-30"
  ]
}
```

Each range is inclusive. Edit the file, upload it, done. No rebuild needed,
and nothing else in the site has to change. Keep `updated` current; it is shown
under the calendar.

If you later want it to update itself, the same file can be generated from an
Airbnb or Booking.com iCal export by a small cron script, and the front end will
not need to change.

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
assets/  api/
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
