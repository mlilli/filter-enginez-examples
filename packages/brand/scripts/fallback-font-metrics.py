"""Compute the metric-matched fallback faces in `packages/brand/src/tokens.css`.

    python3 packages/brand/scripts/fallback-font-metrics.py            # print the generated block
    python3 packages/brand/scripts/fallback-font-metrics.py --write    # replace it in tokens.css
    python3 packages/brand/scripts/fallback-font-metrics.py --check    # fail if tokens.css differs

Why: every brand font is `font-display: swap`, so a page first renders in whatever font comes next in
its stack and redraws when the webfont arrives. Where the two fonts differ in width and line height,
that redraw moves every line of text below it. A fallback face is a local system font (Arial for the
two proportional faces, Courier New for the monospace one) declared under a family of its own, with
`size-adjust` scaling its glyphs to the webfont's average width and `ascent-override`,
`descent-override` and `line-gap-override` giving it the webfont's vertical metrics. Named second in
each `--font-*` stack, it is what the page renders in until the webfont swaps in, and the swap then
changes the letterforms but barely moves the text.

The inputs:

- The webfonts: the canonical variable TTFs in `packages/brand/src/fonts/` (the WOFF2 subsets are
  cut from them and keep their metrics), instanced at the weight each fallback face stands in for.
- The fallback fonts: Arial, Arial Bold, Courier New and Courier New Bold. Each is looked for where
  macOS, Windows and Linux keep it, and then as its metric-compatible clone (Liberation Sans, Liberation
  Mono), whose advance widths are Arial's and Courier New's by design, so either gives the same
  numbers. Pass `--fonts-dir DIR` to look in another directory first.
- The text the average width is taken over: lowercase English letters at their usual frequency
  (`LETTER_FREQUENCY`, the per-letter shares from Wikipedia's "Letter frequency" article), and the
  word space at `SPACE_SHARE` of all characters, about one in five and a half.

The computation, per face (the same one CSS-metric tools such as Capsize use):

    size-adjust      = webfont average width / fallback average width   (both in em)
    ascent-override  = webfont ascender / (unitsPerEm * size-adjust)
    descent-override = |webfont descender| / (unitsPerEm * size-adjust)
    line-gap-override = webfont line gap / (unitsPerEm * size-adjust)

The overrides are divided by `size-adjust` because the browser multiplies them by it. The webfonts'
vertical metrics come from `hhea`, which for all three equals `OS/2`'s typographic metrics with
USE_TYPO_METRICS set, so every platform lays them out the same way.

Needs Python 3 with fontTools (the version `scripts/subset-brand-fonts.mjs` pins serves).
"""

# cspell:ignore Arimo arialbd Cmap cmap cour courbd Cousine hhea hmtx instancer msttcorefonts PSMT

import argparse
import os
import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
FONTS_DIRECTORY = PACKAGE_ROOT / "src" / "fonts"
TOKENS_SHEET = PACKAGE_ROOT / "src" / "tokens.css"

# Relative frequency of each lowercase letter in English text, in percent of letters.
LETTER_FREQUENCY = {
    "a": 8.167, "b": 1.492, "c": 2.782, "d": 4.253, "e": 12.702, "f": 2.228, "g": 2.015,
    "h": 6.094, "i": 6.966, "j": 0.153, "k": 0.772, "l": 4.025, "m": 2.406, "n": 6.749,
    "o": 7.507, "p": 1.929, "q": 0.095, "r": 5.987, "s": 6.327, "t": 9.056, "u": 2.758,
    "v": 0.978, "w": 2.360, "x": 0.150, "y": 1.974, "z": 0.074,
}

# The word space's share of all characters: an average English word is about 4.5 letters long.
SPACE_SHARE = 0.18

# Where each fallback font is looked for, in order: macOS, Windows, Linux with the Microsoft core
# fonts, then the metric-compatible Liberation clones.
FALLBACK_FILES = {
    "Arial": [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ],
    "Arial Bold": [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ],
    "Courier New": [
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "C:/Windows/Fonts/cour.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Courier_New.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    ],
    "Courier New Bold": [
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
        "C:/Windows/Fonts/courbd.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Courier_New_Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    ],
}

# The `local()` names each fallback font is asked for by: its full name and PostScript name on macOS
# and Windows, then the clones' and Helvetica's, whose advance widths are Arial's.
LOCAL_NAMES = {
    "Arial": ["Arial", "ArialMT", "Helvetica", "Liberation Sans", "Arimo"],
    "Arial Bold": ["Arial Bold", "Arial-BoldMT", "Helvetica Bold", "Helvetica-Bold", "Liberation Sans Bold", "Arimo Bold"],
    "Courier New": ["Courier New", "CourierNewPSMT", "Liberation Mono", "Cousine"],
    "Courier New Bold": ["Courier New Bold", "CourierNewPS-BoldMT", "Liberation Mono Bold", "Cousine Bold"],
}

# Each fallback face: the family it stands in for, the webfont source and the weight it is instanced
# at, and the system font it renders with. A regular and a bold face per family, so bold text renders
# in the bold system font rather than a synthesized one.
FACES = [
    ("Inter Fallback", "inter/Inter-VariableFont.ttf", 400, "Arial"),
    ("Inter Fallback", "inter/Inter-VariableFont.ttf", 700, "Arial Bold"),
    ("JetBrains Mono Fallback", "jetbrains-mono/JetBrainsMono-VariableFont.ttf", 400, "Courier New"),
    ("JetBrains Mono Fallback", "jetbrains-mono/JetBrainsMono-VariableFont.ttf", 700, "Courier New Bold"),
    ("Filter EngineZ Display Fallback", "orbitron/Orbitron-VariableFont_wght.ttf", 400, "Arial"),
    ("Filter EngineZ Display Fallback", "orbitron/Orbitron-VariableFont_wght.ttf", 700, "Arial Bold"),
]

# The comments that open and close the generated block in tokens.css.
BLOCK_START = "/* fallback-font-metrics:start"
BLOCK_END = "/* fallback-font-metrics:end */"


def average_width(font):
    """The frequency-weighted average advance width of `font`'s text sample, in em."""
    cmap = font.getBestCmap()
    metrics = font["hmtx"].metrics
    letters = sum(LETTER_FREQUENCY.values())
    total = SPACE_SHARE * metrics[cmap[ord(" ")]][0]
    for letter, frequency in LETTER_FREQUENCY.items():
        total += (1 - SPACE_SHARE) * frequency / letters * metrics[cmap[ord(letter)]][0]
    return total / font["head"].unitsPerEm


def webfont_instance(source, weight):
    """The canonical variable TTF instanced at `weight`, every other axis at its default."""
    font = TTFont(FONTS_DIRECTORY / source)
    return instancer.instantiateVariableFont(font, {"wght": weight})


def find_fallback(name, fonts_dir):
    """The first file found for fallback font `name`, looking in `fonts_dir` first when given."""
    candidates = list(FALLBACK_FILES[name])
    if fonts_dir is not None:
        candidates = [str(Path(fonts_dir) / Path(path).name) for path in candidates] + candidates
    for path in candidates:
        if os.path.exists(path):
            return TTFont(path)
    sys.exit(f"fallback-font-metrics: no file for {name}; looked in:\n  " + "\n  ".join(candidates))


def percent(value):
    """`value` as a CSS percentage, to two decimals and without trailing zeros, as Prettier writes it."""
    return f"{value * 100:.2f}".rstrip("0").rstrip(".") + "%"


def collapse_whitespace(text):
    """`text` with every run of whitespace made one space: Prettier may wrap a long `src` list."""
    return re.sub(r"\s+", " ", text)


def face_rule(family, source, weight, fallback, fonts_dir):
    """One `@font-face` rule for a fallback face."""
    webfont = webfont_instance(source, weight)
    size_adjust = average_width(webfont) / average_width(find_fallback(fallback, fonts_dir))
    hhea = webfont["hhea"]
    em = webfont["head"].unitsPerEm * size_adjust
    sources = ", ".join(f"local('{name}')" for name in LOCAL_NAMES[fallback])
    return "\n".join([
        "@font-face {",
        f"\tfont-family: '{family}';",
        f"\tsrc: {sources};",
        f"\tfont-weight: {weight};",
        f"\tsize-adjust: {percent(size_adjust)};",
        f"\tascent-override: {percent(hhea.ascent / em)};",
        f"\tdescent-override: {percent(abs(hhea.descent) / em)};",
        f"\tline-gap-override: {percent(hhea.lineGap / em)};",
        "}",
    ])


def generated_block(fonts_dir):
    """The whole generated block, markers included."""
    rules = [face_rule(*face, fonts_dir) for face in FACES]
    return "\n".join([
        f"{BLOCK_START} — written by packages/brand/scripts/fallback-font-metrics.py; run it with",
        "   --write rather than editing these rules. */",
        *rules,
        BLOCK_END,
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="replace the generated block in tokens.css")
    mode.add_argument("--check", action="store_true", help="fail if tokens.css holds another block")
    parser.add_argument("--fonts-dir", help="a directory to look for the fallback fonts in first")
    arguments = parser.parse_args()

    block = generated_block(arguments.fonts_dir)
    if not (arguments.write or arguments.check):
        print(block)
        return

    sheet = TOKENS_SHEET.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(BLOCK_START) + r".*?" + re.escape(BLOCK_END), re.DOTALL)
    found = pattern.findall(sheet)
    if len(found) != 1:
        sys.exit(f"fallback-font-metrics: tokens.css must hold exactly one generated block; found {len(found)}")
    if arguments.check:
        if collapse_whitespace(found[0]) != collapse_whitespace(block):
            sys.exit("fallback-font-metrics: tokens.css differs from the computed faces; run with --write")
        print("✓ fallback-font-metrics: tokens.css holds the computed faces")
        return
    TOKENS_SHEET.write_text(pattern.sub(lambda _match: block, sheet), encoding="utf-8")
    print("✓ fallback-font-metrics: wrote the fallback faces into tokens.css; run Prettier over it next")


if __name__ == "__main__":
    main()
