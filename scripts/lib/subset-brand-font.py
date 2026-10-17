"""Subset one brand font into a WOFF2 file, for `scripts/subset-brand-fonts.mjs`.

The Node script owns the specification (which fonts, which code points, which layout features,
which family is renamed) and the manifest; this file only runs the font tools it cannot run itself.
It reads one job as JSON on stdin and writes one JSON line on stdout:

    {"source": "<abs .ttf>", "output": "<abs .woff2>", "codePoints": [32, ...],
     "layoutFeatures": ["kern", ...], "rename": null | {"from": "...", "family": "...",
     "postScriptFamily": "..."}, "tools": {"fontTools": "4.65.0", "brotli": "1.2.0"}}
    -> {"fontTools": "4.65.0", "brotli": "1.2.0", "glyphs": 406}

It refuses to run, before writing anything, when the installed fontTools or brotli is not the version
the job names: another version may write other bytes.

The variation axes are kept whole (`wght`, and Inter's `opsz`): subsetting removes glyphs, never
design space. Nothing time-dependent reaches the file (`head.modified` keeps the source's value), so
the same inputs and tool versions write the same bytes on every run.

Renaming answers the SIL Open Font License's Reserved Font Name clause: a subset is a Modified
Version, which may not carry a Reserved Font Name. Every name record that names the family is
rewritten (family, full, unique and PostScript names, the typographic family, the variations
PostScript prefix and each named instance's PostScript name); the copyright notice (name ID 0),
which the license requires to stay, and the license description and URL are left as they are. The
script then refuses to write a file in which any other record still carries the reserved name.
"""

import io
import json
import sys

import brotli
import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

# Name IDs that hold human-readable family or full names: family (1), full name (4), typographic
# family (16) and WWS family (21).
HUMAN_NAME_IDS = {1, 4, 16, 21}

# Name IDs that hold identifiers written without spaces: unique ID (3), PostScript name (6) and the
# variations PostScript name prefix (25). Named instances' PostScript names live at IDs 256 and up.
POSTSCRIPT_NAME_IDS = {3, 6, 25}

# Name IDs the rename never touches: the copyright notice (0) the license requires to be kept, and
# the license description (13) and URL (14).
KEPT_NAME_IDS = {0, 13, 14}

# The first font-specific name ID; named instances, axis names and STAT labels live from here on.
FIRST_FONT_SPECIFIC_NAME_ID = 256


def rename_family(font, rename):
    """Rewrite every family-naming record from `rename["from"]` to the new family.

    Raises SystemExit if a record outside KEPT_NAME_IDS still carries the reserved name afterwards.
    """
    reserved = rename["from"]
    for record in font["name"].names:
        text = record.toUnicode()
        if reserved not in text or record.nameID in KEPT_NAME_IDS:
            continue
        if record.nameID in HUMAN_NAME_IDS:
            record.string = text.replace(reserved, rename["family"])
        elif record.nameID in POSTSCRIPT_NAME_IDS or record.nameID >= FIRST_FONT_SPECIFIC_NAME_ID:
            record.string = text.replace(reserved, rename["postScriptFamily"])
    leftovers = [
        (record.nameID, record.toUnicode())
        for record in font["name"].names
        if record.nameID not in KEPT_NAME_IDS and reserved in record.toUnicode()
    ]
    if leftovers:
        raise SystemExit(f"the reserved name {reserved!r} is still in name records {leftovers}")


def main():
    job = json.load(sys.stdin)
    installed = {"brotli": brotli.__version__, "fontTools": fontTools.version}
    if installed != job["tools"]:
        raise SystemExit(f"installed {installed}, but the subsets are written with {job['tools']}")
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = job["layoutFeatures"]
    # Every name record, in every language: the license description, the axis and instance names
    # the variation tables point at, and the copyright notice all stay.
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True

    # `recalcTimestamp=False` keeps `head.modified` at the source's value; the default would stamp the
    # time of the run into every file, and no two runs would write the same bytes.
    font = TTFont(job["source"], recalcTimestamp=False)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=job["codePoints"])
    subsetter.subset(font)
    if job["rename"] is not None:
        rename_family(font, job["rename"])

    buffer = io.BytesIO()
    font.flavor = "woff2"
    font.save(buffer)
    with open(job["output"], "wb") as output:
        output.write(buffer.getvalue())

    json.dump({**installed, "glyphs": len(font.getGlyphOrder())}, sys.stdout)


if __name__ == "__main__":
    main()
