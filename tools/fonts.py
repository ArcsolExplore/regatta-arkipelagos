"""Converts the self-hosted TeX Gyre WOFF files to WOFF2 and renames the families
(GUST Font License asks modified fonts to carry another name). Run:
  PYTHONPATH=tools/brotli_shim python3 tools/fonts.py"""
import pathlib, sys
from fontTools.ttLib import TTFont

FONTS = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'fonts'
for name in ['texgyreadventor-bold', 'texgyreadventor-regular', 'texgyreschola-bold', 'texgyreschola-regular']:
    src = FONTS / f'{name}.woff'
    if not src.exists():
        src = FONTS / f'{name}.woff2'  # re-run on the converted files
    f = TTFont(str(src))
    for rec in f['name'].names:
        if rec.nameID in (1, 3, 4, 6, 16):
            t = str(rec)
            if ' RA' in t or 'RA-' in t or t.endswith('RA'):
                continue
            for a in ('TeX Gyre Adventor', 'TeX Gyre Schola', 'TeXGyreAdventor', 'TeXGyreSchola'):
                if a in t:
                    t = t.replace(a, a + (' RA' if ' ' in a else 'RA'))
                    break
            rec.string = t
    f.flavor = 'woff2'
    out = FONTS / f'{name}.woff2'
    f.save(str(out))
    print(out.name, out.stat().st_size)
