"""Generate the House Leila logo set as SVG.

    python tools/fetch-fonts.py    # once, to get the wordmark face
    python tools/gen-logo.py

Two pieces are produced from code rather than drawn by hand:

  * the fish: an ichthys built from two brush strokes. Each stroke is a
    cubic centreline sampled and offset by a width function, so the ribbon
    swells in the belly of the fish and tapers to a point at the nose and to
    a hair at the tail, the way a loaded brush actually behaves.
  * the wordmark: set in WORDMARK_FONT and emitted as outlines. Converting
    to paths means the logo can never render in the wrong font, and costs no
    webfont request.

Outputs (committed, so this script is only needed to change the artwork):
    assets/img/logo.svg            horizontal lockup for the site header
    assets/img/logo-light.svg      the same, for dark backgrounds
    assets/img/logo-emblem.svg     fish with the wordmark inside, for social and print
    favicon.svg                    the fish alone, on navy
    apple-touch-icon.png           the same, rasterised
"""

from __future__ import annotations
import math, os, re

# --------------------------------------------------------------------------
# Settings. The fish stays gold; the name is set in a plain readable ink so it
# holds up at small sizes, in print, and against the gold.
# --------------------------------------------------------------------------

WORDMARK_FONT = ".build/marcellus.ttf"
WORD_INK = "#0f2233"        # the site's deep navy, on white
WORD_INK_LIGHT = "#f3ece2"  # on the navy footer
SUB_INK = "#6b7f90"
SUB_INK_LIGHT = "#93aabd"

GOLD_STOPS = [("0", "#e8cf8c"), (".28", "#c9a44c"), (".52", "#f2e2ad"),
              (".74", "#c19735"), ("1", "#9c7526")]
GOLD_STOPS_LIGHT = [("0", "#f4e4b4"), (".3", "#dcbb68"), (".55", "#f8eec9"),
                    (".78", "#d3ad57"), ("1", "#bb9440")]

# --------------------------------------------------------------------------
# Brush ribbon: sample a cubic centreline, offset by a width profile.
# --------------------------------------------------------------------------


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    )


def bezier_tangent(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
        3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
    )


def sample_spline(segments, steps_per_segment=30):
    """Walk a list of cubic segments, returning (point, unit-normal, t) samples."""
    out = []
    n = len(segments)
    for i, seg in enumerate(segments):
        # Skip the duplicated joint between consecutive segments.
        rng = range(steps_per_segment + 1) if i == n - 1 else range(steps_per_segment)
        for s in rng:
            t_local = s / steps_per_segment
            pt = bezier(*seg, t_local)
            tx, ty = bezier_tangent(*seg, t_local)
            length = math.hypot(tx, ty) or 1e-9
            out.append((pt, (-ty / length, tx / length), (i + t_local) / n))
    return out


def ribbon_points(segments, width_at, steps=30):
    """Closed polygon around a centreline, offset by the width profile."""
    left, right = [], []
    for (x, y), (nx, ny), t in sample_spline(segments, steps):
        half = width_at(t) / 2
        left.append((x + nx * half, y + ny * half))
        right.append((x - nx * half, y - ny * half))
    return left + list(reversed(right))


def ribbon(segments, width_at, steps=30):
    """Closed SVG path for a stroke of varying width around a centreline."""
    pts = ribbon_points(segments, width_at, steps)
    half = len(pts) // 2
    fmt = lambda ps: " ".join(f"{x:.1f},{y:.1f}" for x, y in ps)
    return f"M{fmt(pts[:half])} L{fmt(pts[half:])} Z"


def taper(peak, start=0.0, end=0.0, bulge=0.55):
    """Width profile: `start` at the tail, `peak` around `bulge`, `end` at the nose."""

    def f(t):
        if t <= bulge:
            k = t / bulge if bulge else 1
            return start + (peak - start) * math.sin(k * math.pi / 2)
        k = (t - bulge) / (1 - bulge)
        return end + (peak - end) * math.cos(k * math.pi / 2) ** 0.85

    return f


# --------------------------------------------------------------------------
# The fish. Drawn in a 240 x 150 box; nose at the right, tail at the left.
# --------------------------------------------------------------------------

FISH_W, FISH_H = 240, 150

NOSE = (231.0, 75.0)
CROSS_HI = (60.0, 62.0)   # where the strokes cross, upper
CROSS_LO = (60.0, 88.0)   # ... and lower
TAIL_TOP = (7.0, 16.0)
TAIL_BOT = (7.0, 134.0)

# Upper stroke: lower tail tip -> across the crossing -> over the back -> nose.
UPPER = [
    (TAIL_BOT, (26.0, 122.0), (44.0, 104.0), CROSS_HI),
    (CROSS_HI, (86.0, 24.0), (160.0, 15.0), NOSE),
]
# Lower stroke: upper tail tip -> across the crossing -> under the belly -> nose.
LOWER = [
    (TAIL_TOP, (26.0, 28.0), (44.0, 46.0), CROSS_LO),
    (CROSS_LO, (86.0, 126.0), (160.0, 135.0), NOSE),
]

FISH_UPPER = ribbon(UPPER, taper(peak=18.0, start=1.8, end=0.9, bulge=0.62))
FISH_LOWER = ribbon(LOWER, taper(peak=18.0, start=1.8, end=0.9, bulge=0.62))

# The favicon is read at 16 px, where a hairline tail and a tapered nose vanish.
# Fatten the whole ribbon and keep more weight at the ends.
BOLD_UPPER = ribbon(UPPER, taper(peak=23.0, start=5.0, end=3.4, bulge=0.60))
BOLD_LOWER = ribbon(LOWER, taper(peak=23.0, start=5.0, end=3.4, bulge=0.60))


def dry_brush(segments, offset, width, t0, t1):
    """A short lighter streak riding along a stroke, for a dry-brush feel."""
    span = [s for s in sample_spline(segments, 30) if t0 <= s[2] <= t1]
    if not span:
        return ""
    pts = []
    for (x, y), (nx, ny), t in span:
        fade = math.sin((t - t0) / (t1 - t0) * math.pi)
        pts.append((x + nx * offset, y + ny * offset, width * fade))
    body = " ".join(f"{x:.1f},{y - w / 2:.1f}" for x, y, w in pts)
    back = " ".join(f"{x:.1f},{y + w / 2:.1f}" for x, y, w in reversed(pts))
    return f"M{body} L{back} Z"


STREAKS = [
    dry_brush(UPPER, -3.4, 2.3, 0.30, 0.72),
    dry_brush(UPPER, 3.6, 1.6, 0.44, 0.80),
    dry_brush(LOWER, 3.4, 2.3, 0.30, 0.72),
    dry_brush(LOWER, -3.6, 1.6, 0.44, 0.80),
]

# --------------------------------------------------------------------------
# Wordmark: shape with HarfBuzz, emit outlines.
# --------------------------------------------------------------------------


def wordmark(text, size, font_path=None, tracking=0.0):
    """Return (svg_path_data, advance_width) for `text` at `size` px, baseline y=0.

    `tracking` adds that many px of letter-spacing; HarfBuzz has no notion of
    it, so it is applied to each advance by hand.
    """
    import uharfbuzz as hb
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.misc.transform import Transform

    font_path = font_path or WORDMARK_FONT
    # HarfBuzz cannot read WOFF2 and silently maps everything to .notdef, so
    # tools/fetch-fonts.py keeps plain TTFs in .build/.
    if font_path.endswith(".woff2"):
        raise SystemExit(f"{font_path} is WOFF2. Run tools/fetch-fonts.py for a TTF")

    with open(font_path, "rb") as fh:
        data = fh.read()
    hb_font = hb.Font(hb.Face(data))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf)

    tt = TTFont(font_path)
    scale = size / tt["head"].unitsPerEm
    glyph_set = tt.getGlyphSet()
    order = tt.getGlyphOrder()

    pen = SVGPathPen(glyph_set)
    x = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        # Flip Y (font units go up, SVG goes down) and place the glyph.
        t = Transform(scale, 0, 0, -scale, (x + pos.x_offset) * scale, -pos.y_offset * scale)
        glyph_set[order[info.codepoint]].draw(TransformPen(pen, t))
        x += pos.x_advance + tracking / scale

    commands = re.sub(
        r"-?\d+\.\d+",
        lambda m: f"{float(m.group()):.2f}".rstrip("0").rstrip("."),
        pen.getCommands(),
    )
    return commands, x * scale


# --------------------------------------------------------------------------
# Compose.
# --------------------------------------------------------------------------


def gradient(stops):
    body = "\n".join(f'    <stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">\n{body}\n  </linearGradient>'


def fish_group(streaks=True, opacity=".55"):
    out = [
        '  <g fill="url(#g)">\n'
        f'    <path d="{FISH_UPPER}"/>\n'
        f'    <path d="{FISH_LOWER}"/>\n'
        '  </g>'
    ]
    if streaks:
        lines = "\n".join(
            f'    <path d="{s}" fill="#fff8e2" opacity="{opacity}"/>' for s in STREAKS if s
        )
        out.append(f"  <g>\n{lines}\n  </g>")
    return "\n".join(out)


def build(font=None, name_size=46, sub_size=12.5, sub_tracking=3.4):
    """Return {filename: svg} for the whole logo set, set in `font`."""
    font = font or WORDMARK_FONT
    name, name_w = wordmark("House Leila", name_size, font)
    sub, sub_w = wordmark("ŠIBENIK", sub_size, font, tracking=sub_tracking)

    # Size the emblem wordmark to the open interior of the fish, between the
    # crossing and the nose, rather than picking a size and hoping.
    left, right = 76.0, 211.0
    _, probe_w = wordmark("House Leila", 100, font)
    emblem, _ = wordmark("House Leila", 100 * (right - left) / probe_w, font)

    mark_scale = 0.60
    mark_w = FISH_W * mark_scale
    gap = 26
    total_w = mark_w + gap + max(name_w, sub_w)
    total_h = 100
    mark_dy = (total_h - FISH_H * mark_scale) / 2

    def lockup(stops, ink, sub_ink):
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w:.0f} {total_h}"'
            ' role="img" aria-label="House Leila, Šibenik">\n'
            f'<defs>\n{gradient(stops)}\n</defs>\n'
            f'  <g transform="translate(0 {mark_dy:.1f}) scale({mark_scale})">\n'
            f'{fish_group()}\n'
            '  </g>\n'
            f'  <g transform="translate({mark_w + gap:.1f} 54)">\n'
            f'    <path d="{name}" fill="{ink}"/>\n'
            f'    <g transform="translate(2 22)"><path d="{sub}" fill="{sub_ink}"/></g>\n'
            '  </g>\n'
            '</svg>\n'
        )

    emblem_svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {FISH_W} {FISH_H}"'
        ' role="img" aria-label="House Leila">\n'
        f'<defs>\n{gradient(GOLD_STOPS)}\n</defs>\n'
        f'{fish_group()}\n'
        f'  <g transform="translate({left:.1f} 86)">\n'
        f'    <path d="{emblem}" fill="{WORD_INK}"/>\n'
        '  </g>\n'
        '</svg>\n'
    )

    favicon_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"'
        ' role="img" aria-label="House Leila">\n'
        f'<defs>\n{gradient(GOLD_STOPS)}\n</defs>\n'
        '  <rect width="64" height="64" rx="13" fill="#0f2233"/>\n'
        '  <g transform="translate(3 13.5) scale(.2417)" fill="url(#g)">\n'
        f'    <path d="{BOLD_UPPER}"/>\n'
        f'    <path d="{BOLD_LOWER}"/>\n'
        '  </g>\n'
        '</svg>\n'
    )

    return {
        "assets/img/logo.svg": lockup(GOLD_STOPS, WORD_INK, SUB_INK),
        "assets/img/logo-light.svg": lockup(GOLD_STOPS_LIGHT, WORD_INK_LIGHT, SUB_INK_LIGHT),
        "assets/img/logo-emblem.svg": emblem_svg,
        "favicon.svg": favicon_svg,
    }


def write_touch_icon(path="apple-touch-icon.png", size=180):
    """Rasterise the favicon from the same polygons, so the two cannot drift."""
    from PIL import Image, ImageDraw

    scale = (size - 14) / FISH_W
    dx, dy = 7, (size - FISH_H * scale) / 2

    tile = Image.new("RGB", (size, size), "#0f2233")
    corner = Image.new("L", (size, size), 0)
    ImageDraw.Draw(corner).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=round(size * 0.22), fill=255
    )

    ramp = [(0.0, (232, 207, 140)), (0.3, (201, 164, 76)), (0.55, (242, 226, 173)),
            (0.78, (193, 151, 53)), (1.0, (156, 117, 38))]
    gold = Image.new("RGB", (size, size))
    px = gold.load()
    for y in range(size):
        for x in range(size):
            t = (x / size + y / size) / 2
            for i in range(len(ramp) - 1):
                t0, c0 = ramp[i]
                t1, c1 = ramp[i + 1]
                if t0 <= t <= t1:
                    k = (t - t0) / (t1 - t0)
                    px[x, y] = tuple(round(a + (b - a) * k) for a, b in zip(c0, c1))
                    break
            else:
                px[x, y] = ramp[-1][1]

    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    for seg in (UPPER, LOWER):
        pts = ribbon_points(seg, taper(peak=23.0, start=5.0, end=3.4, bulge=0.60), 60)
        md.polygon([(x * scale + dx, y * scale + dy) for x, y in pts], fill=255)

    tile.paste(gold, (0, 0), mask)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(tile, (0, 0), corner)
    out.save(path)
    return path


def main():
    print("logo:")
    for path, svg in build().items():
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(svg)
        print(f"  {path:30} {len(svg) / 1024:5.1f} KB")
    icon = write_touch_icon()
    print(f"  {icon:30} {os.path.getsize(icon) / 1024:5.1f} KB")


if __name__ == "__main__":
    main()
