"""Download the candidate wordmark fonts into .build/.

    python tools/fetch-fonts.py

Pulls the complete TTFs from the google/fonts repository rather than the
webfont API: the API serves per-script subsets, where `latin-ext` holds only
the extended characters (S-caron and friends) and not the ASCII alongside
them, so "House Leila" plus "SIBENIK" would need two files stitched together.
The full TTF also keeps the kerning table, which the wordmark relies on.

Nothing here is committed or shipped. The logo is emitted as outlines.
"""

import os
import re
import urllib.request

from fontTools.ttLib import TTFont

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

REPO = "https://raw.githubusercontent.com/google/fonts/main/"

# name -> path within the google/fonts repository
CANDIDATES = {
    "cinzel": "ofl/cinzel/Cinzel%5Bwght%5D.ttf",
    "marcellus": "ofl/marcellus/Marcellus-Regular.ttf",
    "prata": "ofl/prata/Prata-Regular.ttf",
    "italiana": "ofl/italiana/Italiana-Regular.ttf",
    "gilda": "ofl/gildadisplay/GildaDisplay-Regular.ttf",
    "tenor": "ofl/tenorsans/TenorSans-Regular.ttf",
    "playfair": "ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
    "cormorant-italic": "ofl/cormorantgaramond/CormorantGaramond-Italic%5Bwght%5D.ttf",
    "cormorant": "ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf",
    "spectral": "ofl/spectral/Spectral-Medium.ttf",
    "jost": "ofl/jost/Jost%5Bwght%5D.ttf",
    "libre-caslon": "ofl/librecaslondisplay/LibreCaslonDisplay-Regular.ttf",
}

os.makedirs(".build", exist_ok=True)


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as r:
        return r.read()


def fetch(name: str, path: str) -> str | None:
    ttf = f".build/{name}.ttf"
    if not os.path.exists(ttf):
        with open(ttf, "wb") as fh:
            fh.write(get(REPO + path))

    font = TTFont(ttf)
    cmap = font.getBestCmap()
    missing = sorted({c for c in "House Leila ŠIBENIK" if ord(c) not in cmap})
    kerned = "GPOS" in font or "kern" in font
    flag = f"  MISSING {missing}" if missing else ""
    print(
        f"  {name:18} {os.path.getsize(ttf) // 1024:>4} KB"
        f"  {'kerning' if kerned else 'no kerning':11}{flag}"
    )
    return ttf


print("fonts:")
for key, path in CANDIDATES.items():
    try:
        fetch(key, path)
    except Exception as exc:  # a family may be renamed or withdrawn
        print(f"  {key}: {exc}")
