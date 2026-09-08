"""Generate the House Leila logo set as SVG.

    python tools/gen-logo.py

Two pieces are produced from code rather than drawn by hand:

  * the fish  — an ichthys built from two brush strokes. Each stroke is a
    cubic centreline sampled and offset by a width function, so the ribbon
    swells in the belly of the fish and tapers to a point at the nose and to
    a hair at the tail, the way a loaded brush actually behaves.
  * the wordmark — "House Leila" in Cormorant Garamond Italic, shaped with
    HarfBuzz and emitted as outlines. Converting to paths means the logo can
    never render in the wrong font, and costs no webfont request.

Outputs (checked in, so this script is only needed to change the artwork):
    assets/img/logo.svg            horizontal lockup — site header
    assets/img/logo-emblem.svg     fish with the wordmark inside — social, print
    assets/img/logo-light.svg      horizontal lockup for dark backgrounds
    favicon.svg                    the fish alone
"""

from __future__ import annotations
import math, os, re

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
    samples = sample_spline(segments, 30)
    span = [s for s in samples if t0 <= s[2] <= t1]
    if not span:
        return ""
    pts = []
    for (x, y), (nx, ny), t in span:
        k = (t - t0) / (t1 - t0)
        fade = math.sin(k * math.pi)
        pts.append((x + nx * offset, y + ny * offset, width * fade))
    left = [(x + 0, y - w / 2) for x, y, w in pts]
    right = [(x, y + w / 2) for x, y, w in pts]
    body = " ".join(f"{x:.1f},{y:.1f}" for x, y in left)
    back = " ".join(f"{x:.1f},{y:.1f}" for x, y in reversed(right))
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


def wordmark(text, size, font_path=".build/cormorant-italic.woff2"):
    """Return (svg_path_data, advance_width) for `text` at `size` px, baseline at y=0."""
    import uharfbuzz as hb
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.misc.transform import Transform

    # HarfBuzz cannot read WOFF2, and silently maps every character to .notdef
    # if handed one. Decompress to a plain TTF first.
    ttf_path = os.path.splitext(font_path)[0] + "-decompressed.ttf"
    if not os.path.exists(ttf_path):
        tt = TTFont(font_path)
        tt.flavor = None  # otherwise it saves WOFF2 again, under a .ttf name
        tt.save(ttf_path)
    font_path = ttf_path

    with open(font_path, "rb") as fh:
        data = fh.read()
    face = hb.Face(data)
    hb_font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf)

    tt = TTFont(font_path)
    upem = tt["head"].unitsPerEm
    glyph_set = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    scale = size / upem

    pen_out = SVGPathPen(glyph_set)
    x = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        # Flip Y (font units go up, SVG goes down) and place the glyph.
        t = Transform(scale, 0, 0, -scale, (x + pos.x_offset) * scale, -pos.y_offset * scale)
        glyph_set[name].draw(TransformPen(pen_out, t))
        x += pos.x_advance
    commands = re.sub(
        r"-?\d+\.\d+", lambda m: f"{float(m.group()):.2f}".rstrip("0").rstrip("."), pen_out.getCommands()
    )
    return commands, x * scale


WORD_HEADER, WORD_HEADER_W = wordmark("House Leila", 46)
# Fit the wordmark to the open interior of the fish, between the crossing and
# the nose, rather than picking a size and hoping.
_EMBLEM_LEFT, _EMBLEM_RIGHT = 76.0, 211.0
_probe, _probe_w = wordmark("House Leila", 100)
EMBLEM_SIZE = 100 * (_EMBLEM_RIGHT - _EMBLEM_LEFT) / _probe_w
WORD_EMBLEM, WORD_EMBLEM_W = wordmark("House Leila", EMBLEM_SIZE)

# --------------------------------------------------------------------------
# Compose.
# --------------------------------------------------------------------------

GOLD = """  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e8cf8c"/>
    <stop offset=".28" stop-color="#c9a44c"/>
    <stop offset=".52" stop-color="#f2e2ad"/>
    <stop offset=".74" stop-color="#c19735"/>
    <stop offset="1" stop-color="#9c7526"/>
  </linearGradient>"""

GOLD_LIGHT = """  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f4e4b4"/>
    <stop offset=".3" stop-color="#dcbb६8"/>
    <stop offset=".55" stop-color="#f8eec9"/>
    <stop offset=".78" stop-color="#d3ad57"/>
    <stop offset="1" stop-color="#bb9440"/>
  </linearGradient>""".replace("६", "6")


def fish_group(opacity_streaks=".55"):
    streaks = "\n".join(
        f'    <path d="{s}" fill="#fff8e2" opacity="{opacity_streaks}"/>' for s in STREAKS if s
    )
    return f"""  <g fill="url(#g)">
    <path d="{FISH_UPPER}"/>
    <path d="{FISH_LOWER}"/>
  </g>
  <g>
{streaks}
  </g>"""


def write(path, svg):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(svg)
    print(f"  {path}  {len(svg) / 1024:.1f} KB")


print("logo:")

# --- 1. Horizontal lockup: fish left, wordmark right -----------------------
FISH_W, FISH_H = 240, 150
mark_scale = 0.60
mark_w = FISH_W * mark_scale
gap = 26
total_w = mark_w + gap + WORD_HEADER_W
total_h = 100

for name, gradient, sub_fill in (
    ("assets/img/logo.svg", GOLD, "#6b7f90"),
    ("assets/img/logo-light.svg", GOLD_LIGHT, "#a8bccc"),
):
    write(
        name,
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w:.0f} {total_h}" role="img" aria-label="House Leila">
<defs>
{gradient}
</defs>
  <g transform="translate(0 {(total_h - FISH_H * mark_scale) / 2:.1f}) scale({mark_scale})">
{fish_group()}
  </g>
  <g transform="translate({mark_w + gap:.1f} 56)">
    <path d="{WORD_HEADER}" fill="url(#g)"/>
    <text x="3" y="26" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
          font-size="12.5" font-weight="700" letter-spacing="4.2" fill="{sub_fill}">ŠIBENIK</text>
  </g>
</svg>
""",
    )

# --- 2. Emblem: wordmark inside the fish ----------------------------------
write(
    "assets/img/logo-emblem.svg",
    f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {FISH_W} {FISH_H}" role="img" aria-label="House Leila">
<defs>
{GOLD}
</defs>
{fish_group()}
  <g transform="translate({_EMBLEM_LEFT:.1f} 86)">
    <path d="{WORD_EMBLEM}" fill="url(#g)"/>
  </g>
</svg>
""",
)

# --- 3. Favicon: the fish alone, on the site's navy ------------------------
write(
    "favicon.svg",
    f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="House Leila">
<defs>
{GOLD}
</defs>
  <rect width="64" height="64" rx="13" fill="#0f2233"/>
  <g transform="translate(3 13.5) scale(.2417)" fill="url(#g)">
    <path d="{BOLD_UPPER}"/>
    <path d="{BOLD_LOWER}"/>
  </g>
</svg>
""",
)


# --------------------------------------------------------------------------
# apple-touch-icon.png — rasterised from the same geometry, so the PNG and the
# SVG favicon can never drift apart.
# --------------------------------------------------------------------------

def write_touch_icon(path="apple-touch-icon.png", size=180):
    from PIL import Image, ImageDraw

    scale = (size - 14) / FISH_W
    dx, dy = 7, (size - FISH_H * scale) / 2

    def place(pts):
        return [(x * scale + dx, y * scale + dy) for x, y in pts]

    # Rounded navy tile.
    tile = Image.new("RGB", (size, size), "#0f2233")
    corner = Image.new("L", (size, size), 0)
    ImageDraw.Draw(corner).rounded_rectangle([0, 0, size - 1, size - 1], radius=round(size * 0.22), fill=255)

    # Diagonal gold gradient, revealed through a mask of the two strokes.
    gold = Image.new("RGB", (size, size))
    px = gold.load()
    ramp = [(0.0, (232, 207, 140)), (0.3, (201, 164, 76)), (0.55, (242, 226, 173)),
            (0.78, (193, 151, 53)), (1.0, (156, 117, 38))]
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
        md.polygon(place(ribbon_points(seg, taper(peak=23.0, start=5.0, end=3.4, bulge=0.60), 60)), fill=255)

    tile.paste(gold, (0, 0), mask)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(tile, (0, 0), corner)
    out.save(path)
    print(f"  {path}  {os.path.getsize(path) / 1024:.1f} KB")


write_touch_icon()
