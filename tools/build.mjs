/**
 * House Leila static site builder.
 *
 *   node tools/build.mjs
 *
 * Reads  src/layout.html + src/pages/*.html + src/data/site.json
 * Writes plain static HTML to the repo root, keeping the WordPress URL shape
 * (/gallery/ -> gallery/index.html) so existing links and search rankings hold.
 *
 * No dependencies on purpose: this must still build in five years.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const site = JSON.parse(read('src/data/site.json'));
const manifest = JSON.parse(read('assets/img/manifest.json'));
const layout = read('src/layout.html');
const icons = JSON.parse(read('src/data/icons.json'));

/* ---------- helpers ------------------------------------------------------ */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Parse the leading <!--meta { ... } --> block off a page source. */
function splitMeta(src) {
  const m = src.match(/^\s*<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error('page is missing its <!--meta --> block');
  return { meta: JSON.parse(m[1]), body: src.slice(m[0].length) };
}

/**
 * Expand <x-img src="house-leila-garden" ...> into a responsive <img>.
 * Attributes: src (manifest key), alt, sizes, class, ratio ("4/3"), priority.
 */
function expandImages(html) {
  return html.replace(/<x-img\s+([^>]*?)\/?>/g, (full, attrs) => {
    const get = (n) => (attrs.match(new RegExp(`${n}="([^"]*)"`)) || [, ''])[1];
    const key = get('src');
    const entry = manifest[key];
    if (!entry) throw new Error(`unknown image "${key}"`);

    const alt = get('alt');
    const sizes = get('sizes') || '100vw';
    const cls = get('class');
    const ratio = get('ratio');
    const priority = /\bpriority\b/.test(attrs);

    const srcset = entry.variants.map((w) => `/assets/img/r/${key}-${w}.webp ${w}w`).join(', ');
    const fallback = `/assets/img/r/${key}-${entry.variants.at(-1)}.webp`;

    // Displayed aspect ratio may be cropped by object-fit; width/height still
    // need to match the file so the browser reserves the right box when no
    // ratio is forced by CSS.
    let [w, h] = [entry.w, entry.h];
    if (ratio) {
      const [rw, rh] = ratio.split('/').map(Number);
      h = Math.round((w * rh) / rw);
    }

    return (
      `<img src="${fallback}" srcset="${srcset}" sizes="${sizes}" ` +
      `width="${w}" height="${h}" alt="${esc(alt)}"` +
      (cls ? ` class="${cls}"` : '') +
      (priority ? ' fetchpriority="high" decoding="async">' : ' loading="lazy" decoding="async">')
    );
  });
}

/**
 * Expand <x-photo src alt sizes> into a lightbox-openable gallery tile.
 * Emits an <x-img>, so it must run before expandImages().
 */
function expandPhotos(html) {
  return html.replace(/<x-photo\s+([^>]*?)\/?>/g, (full, attrs) => {
    const get = (n) => (attrs.match(new RegExp(`${n}="([^"]*)"`)) || [, ''])[1];
    const key = get('src');
    const entry = manifest[key];
    if (!entry) throw new Error(`unknown image "${key}"`);
    const alt = get('alt');
    const sizes = get('sizes') || '(min-width: 1000px) 25vw, (min-width: 700px) 33vw, 50vw';
    return (
      `<button class="gal__item" type="button" data-full="/assets/img/r/${key}-${entry.variants.at(-1)}.webp" ` +
      `data-cap="${esc(alt)}">` +
      `<x-img src="${key}" alt="${esc(alt)}" sizes="${sizes}" ratio="4/3" /></button>`
    );
  });
}

/** Expand <x-icon name="wifi"> into an inline SVG from icons.json. */
function expandIcons(html) {
  return html.replace(/<x-icon\s+name="([^"]+)"\s*\/?>/g, (full, name) => {
    const path = icons[name];
    if (!path) throw new Error(`unknown icon "${name}"`);
    return (
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
    );
  });
}

/**
 * Expand <x-faq> into the accordion, sourced from site.json so the FAQ text
 * lives in exactly one place (page copy + JSON-LD both read it).
 * Attributes: groups="false" to skip the group headings, limit="4" to trim.
 */
function expandFaq(html) {
  return html.replace(/<x-faq\s*([^>]*?)\/?>/g, (full, attrs) => {
    const get = (n) => (attrs.match(new RegExp(`${n}="([^"]*)"`)) || [, ''])[1];
    const limit = Number(get('limit')) || Infinity;
    const showGroups = get('groups') !== 'false';
    const only = get('group');

    const source = only === '' ? site.faq : [site.faq[Number(only)]];

    let n = 0;
    const out = [];
    for (const group of source) {
      if (n >= limit) break;
      const items = group.items.slice(0, limit - n);
      n += items.length;
      if (showGroups) out.push(`<h2>${group.title}</h2>`);
      for (const it of items) {
        out.push(
          `<details>\n  <summary>${it.q}</summary>\n  <div class="faq__a">${it.a}</div>\n</details>`
        );
      }
    }
    return out.join('\n');
  });
}

/** {{site.phone}} style interpolation against a scope object. */
function interpolate(tpl, scope) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (full, path) => {
    const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), scope);
    return v == null ? '' : String(v);
  });
}

/* ---------- nav ---------------------------------------------------------- */

function navHtml(current, mobile) {
  const links = site.nav
    .map((n) => {
      const cur = n.url === current ? ' aria-current="page"' : '';
      return `<a href="${n.url}"${cur}>${n.label}</a>`;
    })
    .join('\n        ');
  if (!mobile) return links;
  return `${links}\n        <a class="btn btn--primary" href="/book-now/">Check availability</a>`;
}

/* ---------- structured data --------------------------------------------- */

function jsonLd(meta) {
  const graph = [
    {
      '@type': 'LodgingBusiness',
      '@id': `${site.origin}/#lodging`,
      name: site.name,
      url: `${site.origin}/`,
      description: site.description,
      telephone: site.phone,
      email: site.email,
      image: [`${site.origin}/assets/img/r/zablace-panorama-1920.webp`],
      priceRange: '€€',
      address: {
        '@type': 'PostalAddress',
        streetAddress: site.address.street,
        addressLocality: site.address.locality,
        postalCode: site.address.postalCode,
        addressRegion: 'Šibenik-Knin',
        addressCountry: 'HR'
      },
      geo: { '@type': 'GeoCoordinates', latitude: site.geo.lat, longitude: site.geo.lng },
      numberOfRooms: 3,
      petsAllowed: false,
      checkinTime: '15:00',
      checkoutTime: '10:00',
      amenityFeature: site.amenityFeatures.map((n) => ({
        '@type': 'LocationFeatureSpecification',
        name: n,
        value: true
      })),
      knowsLanguage: ['en', 'hr']
    },
    {
      '@type': 'WebSite',
      '@id': `${site.origin}/#website`,
      url: `${site.origin}/`,
      name: site.name,
      inLanguage: 'en'
    }
  ];

  if (meta.faq) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${site.origin}${meta.url}#faq`,
      mainEntity: site.faq.flatMap((g) =>
        g.items.map((q) => ({
          '@type': 'Question',
          name: q.q,
          acceptedAnswer: { '@type': 'Answer', text: q.a.replace(/<[^>]+>/g, '') }
        }))
      )
    });
  }

  if (meta.url !== '/') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${site.origin}/` },
        { '@type': 'ListItem', position: 2, name: meta.crumb || meta.h1 }
      ]
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

/* ---------- page render -------------------------------------------------- */

const pagesDir = join(ROOT, 'src/pages');
const built = [];

for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.html'))) {
  const { meta, body } = splitMeta(readFileSync(join(pagesDir, file), 'utf8'));
  meta.robots = meta.noindex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1';
  const scope = { site, page: meta };

  let content = interpolate(body, scope);
  content = expandFaq(content);
  content = expandPhotos(content);
  content = expandImages(content);
  content = expandIcons(content);

  let html = layout
    .replace('{{content}}', content)
    .replace('{{nav}}', navHtml(meta.url, false))
    .replace('{{navMobile}}', navHtml(meta.url, true))
    .replace('{{jsonld}}', jsonLd(meta));
  html = expandIcons(interpolate(html, scope));

  const outPath =
    meta.url === '/'
      ? 'index.html'
      : meta.url.endsWith('.html')
        ? meta.url.slice(1)
        : join(meta.url.replace(/^\/|\/$/g, ''), 'index.html');
  const abs = join(ROOT, outPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, html);
  if (!meta.noindex) built.push({ url: meta.url, out: outPath, bytes: Buffer.byteLength(html) });
  else console.log(`  (noindex) ${meta.url}`);
}

/* ---------- sitemap + robots -------------------------------------------- */

const today = new Date().toISOString().slice(0, 10);
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  built
    .sort((a, b) => (a.url === '/' ? -1 : a.url.localeCompare(b.url)))
    .map(
      (p) =>
        `  <url>\n    <loc>${site.origin}${p.url}</loc>\n    <lastmod>${today}</lastmod>\n` +
        `    <priority>${p.url === '/' ? '1.0' : p.url === '/book-now/' ? '0.9' : '0.8'}</priority>\n  </url>`
    )
    .join('\n') +
  `\n</urlset>\n`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

writeFileSync(
  join(ROOT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap.xml\n`
);

/* ---------- report ------------------------------------------------------- */

console.log('built:');
for (const p of built.sort((a, b) => a.url.localeCompare(b.url))) {
  console.log(`  ${p.url.padEnd(18)} ${String(Math.round(p.bytes / 1024)).padStart(4)} KB  ${p.out}`);
}
console.log(`  sitemap.xml, robots.txt`);
