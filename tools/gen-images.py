"""Generate responsive WebP variants for every source photo.
Run:  python tools/gen-images.py
Source: assets/img/house, assets/img/area  ->  assets/img/r/<name>-<width>.webp
"""
from PIL import Image
import glob, os, json

# Wider variants are only ever seen full-bleed or large, where a lower WebP
# quality is indistinguishable but meaningfully cheaper to download.
WIDTHS = {480: 74, 800: 72, 1280: 66, 1920: 64}
OUT = "assets/img/r"
os.makedirs(OUT, exist_ok=True)

manifest = {}
total_before = total_after = 0

for src in sorted(glob.glob("assets/img/house/*") + glob.glob("assets/img/area/*")):
    name = os.path.splitext(os.path.basename(src))[0]
    im = Image.open(src)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    w0, h0 = im.size
    total_before += os.path.getsize(src)
    manifest[name] = {"w": w0, "h": h0, "variants": []}
    for w, quality in WIDTHS.items():
        if w > w0:
            continue
        h = round(h0 * w / w0)
        dst = f"{OUT}/{name}-{w}.webp"
        if not os.path.exists(dst):
            im.resize((w, h), Image.LANCZOS).save(
                dst, "WEBP", quality=quality, method=6
            )
        total_after += os.path.getsize(dst)
        manifest[name]["variants"].append(w)

json.dump(manifest, open("assets/img/manifest.json", "w"), indent=1)
print(f"{len(manifest)} images -> {len(glob.glob(OUT + '/*'))} variants")
print(f"sources {total_before/1e6:.1f} MB   variants {total_after/1e6:.1f} MB")
