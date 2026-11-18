"""Compute the metric-matched fallback faces in `packages/brand/src/tokens.css`.

    python3 packages/brand/scripts/fallback-font-metrics.py            # print the generated block
    python3 packages/brand/scripts/fallback-font-metrics.py --write    # replace it in tokens.css
    python3 packages/brand/scripts/fallback-font-metrics.py --check    # fail if tokens.css differs

Why: every brand font is `font-display: swap`, so a page first renders in whatever font comes next in
its stack and redraws when the webfont arrives. Where the two fonts differ in width and line height,
that redraw moves every line of text below it. A fallback face is a local system font declared under a
family of its own, with `size-adjust` scaling its glyphs to the webfont's average width and
`ascent-override`, `descent-override` and `line-gap-override` giving it the webfont's vertical metrics.
Named right after the webfont in its `--font-*` stack, it is what the page renders in until the webfont
swaps in, and the swap then changes the letterforms but barely moves the text.

The fallback families, in stack order (`FAMILIES`):

- Inter and the display face: Arial (macOS, Windows), or its metric-compatible clones Liberation Sans
  and Arimo (Linux, ChromeOS), whose advance widths are Arial's by design.
- JetBrains Mono, one family per platform, because one face carries one `size-adjust` and the system
  monospace fonts differ: Menlo (macOS, iOS) or DejaVu Sans Mono (Linux), the font Menlo was cut
  from, with the same advance widths and figures; Droid Sans Mono (Android's monospace font) or Roboto
  Mono (some Android and ChromeOS builds); Consolas (Windows); then Courier New and its clones, the
  last resort. A browser takes the first family with a local font, so each platform gets its own.
  Android's other monospace font, Cutive Mono, is its serif typewriter face, not what `monospace`
  resolves to; it is not named.

Why the monospace families have figures faces: the face's largest use is a result count, the largest
thing on a dataset page's first screen. A browser records a page's largest paint once per element and
records a later paint only if it is larger, so a count first painted in a fallback font whose figures
are smaller than the webfont's makes the webfont's count, when the app renders its own, a later and
larger paint. So each monospace family but the last has a second face for the figures and the
punctuation set with them (`FIGURES_RANGE`), scaled so its figures are never smaller than the webfont's,
and a text face scaled to the webfont's width as everywhere else. Courier New's figures are a sixth
shorter than JetBrains Mono's; scaling them up would widen every count by a sixth, so its family keeps
the plain text face, and there the app's count, not the snapshot's, is the largest paint.

The inputs:

- The webfonts: the canonical variable TTFs in `packages/brand/src/fonts/` (the WOFF2 subsets are
  cut from them and keep their metrics), instanced at the weight each fallback face stands in for.
- The fallback fonts, read from their files where macOS and Linux keep them (`FALLBACK_FILES`;
  pass `--fonts-dir DIR` to look in another directory first). Droid Sans Mono and Consolas are on
  neither, so their numbers are recorded here (`RECORDED_METRICS`): Droid Sans Mono's read from its
  TTF (Apache License 2.0, as Android ships it), Consolas's from its published metrics, which give
  its advance and cap height but not its figures' outlines; its figures are taken to be cap height.
- The text the average width is taken over: lowercase English letters at their usual frequency
  (`LETTER_FREQUENCY`, the per-letter shares from Wikipedia's "Letter frequency" article), and the
  word space at `SPACE_SHARE` of all characters, about one in five and a half. A monospace font's
  average is its one advance.

The computation, per face (the same one CSS-metric tools such as Capsize use):

    size-adjust      = webfont average width / fallback average width   (both in em)
    ascent-override  = webfont ascender / (unitsPerEm * size-adjust)
    descent-override = |webfont descender| / (unitsPerEm * size-adjust)
    line-gap-override = webfont line gap / (unitsPerEm * size-adjust)

and for a figures face, size-adjust is the larger of that and the webfont's figure height over the
fallback's (the extent from the highest figure top to the lowest comma or figure bottom), rounded up
to a whole percent, because a count's largest-paint size is its glyphs' extent rounded to whole pixels.

The overrides are divided by `size-adjust` because the browser multiplies them by it. The webfonts'
vertical metrics come from `hhea`, which for all three equals `OS/2`'s typographic metrics with
USE_TYPO_METRICS set, so every platform lays them out the same way.

Needs Python 3 with fontTools (the version `scripts/subset-brand-fonts.mjs` pins serves).
"""

# cspell:ignore Arimo arialbd Cmap cmap cour courbd Cousine Cutive DejaVu hhea hmtx instancer msttcorefonts PSMT

import argparse
import math
import os
import re
import sys
from collections import namedtuple
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
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

# The characters a figures face sets: the figures and the punctuation a count or a delta sets with them.
FIGURES = "0123456789+,-."
FIGURES_RANGE = "U+002B-002E, U+0030-0039"

# A fallback font's metrics, in em: its average advance width, and its figures' highest top and lowest
# bottom (negative below the baseline), or None where only the top is known.
Metrics = namedtuple("Metrics", ["average_width", "figure_top", "figure_bottom"])

# Where each fallback font is looked for, in order: macOS, Windows, Linux with the Microsoft core
# fonts, then the metric-compatible clones. `#n` names a font in a collection.
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
    "Menlo": [
        "/System/Library/Fonts/Menlo.ttc#0",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ],
    "Menlo Bold": [
        "/System/Library/Fonts/Menlo.ttc#1",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
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

# The fallback fonts no machine that runs this script has, in font units over unitsPerEm 2048.
# Droid Sans Mono: read from DroidSansMono.ttf (advance 1229; figures from 1485 down to the comma's
# -289). Consolas: Microsoft's published metrics (advance 1126, cap height 1307), the same for its bold.
RECORDED_METRICS = {
    "Droid Sans Mono": Metrics(1229 / 2048, 1485 / 2048, -289 / 2048),
    "Consolas": Metrics(1126 / 2048, 1307 / 2048, None),
    "Consolas Bold": Metrics(1126 / 2048, 1307 / 2048, None),
}

# The `local()` names each fallback font is asked for by: its full name and PostScript name, then
# those of the fonts that stand in for it with the same metrics (see the module docstring).
LOCAL_NAMES = {
    "Arial": ["Arial", "ArialMT", "Helvetica", "Liberation Sans", "Arimo"],
    "Arial Bold": ["Arial Bold", "Arial-BoldMT", "Helvetica Bold", "Helvetica-Bold", "Liberation Sans Bold", "Arimo Bold"],
    "Menlo": ["Menlo Regular", "Menlo-Regular", "DejaVu Sans Mono", "DejaVuSansMono"],
    "Menlo Bold": ["Menlo Bold", "Menlo-Bold", "DejaVu Sans Mono Bold", "DejaVuSansMono-Bold"],
    # Roboto Mono's figures are 0.5% shorter than Droid Sans Mono's and its comma reaches lower, so
    # Droid Sans Mono's figures scale covers it too.
    "Droid Sans Mono": ["Droid Sans Mono", "DroidSansMono", "Roboto Mono", "RobotoMono-Regular"],
    "Consolas": ["Consolas"],
    "Consolas Bold": ["Consolas Bold", "Consolas-Bold"],
    "Courier New": ["Courier New", "CourierNewPSMT", "Liberation Mono", "Cousine"],
    "Courier New Bold": ["Courier New Bold", "CourierNewPS-BoldMT", "Liberation Mono Bold", "Cousine Bold"],
}

# Each fallback family, in stack order: its name, its webfont, the system font each weight renders
# with, and whether it has figures faces. A regular and a bold face where the platform has a bold
# font, so bold text renders in it rather than a synthesized one; Android has no bold monospace font,
# so its family has a regular face only and the browser synthesizes bold from it.
FAMILIES = [
    ("Inter Fallback", "inter/Inter-VariableFont.ttf", [(400, "Arial"), (700, "Arial Bold")], False),
    ("JetBrains Mono Fallback", "jetbrains-mono/JetBrainsMono-VariableFont.ttf", [(400, "Menlo"), (700, "Menlo Bold")], True),
    ("JetBrains Mono Fallback Android", "jetbrains-mono/JetBrainsMono-VariableFont.ttf", [(400, "Droid Sans Mono")], True),
    ("JetBrains Mono Fallback Windows", "jetbrains-mono/JetBrainsMono-VariableFont.ttf", [(400, "Consolas"), (700, "Consolas Bold")], True),
    ("JetBrains Mono Fallback Courier", "jetbrains-mono/JetBrainsMono-VariableFont.ttf", [(400, "Courier New"), (700, "Courier New Bold")], False),
    ("Filter EngineZ Display Fallback", "orbitron/Orbitron-VariableFont_wght.ttf", [(400, "Arial"), (700, "Arial Bold")], False),
]

# The comments that open and close the generated block in tokens.css.
BLOCK_START = "/* fallback-font-metrics:start"
BLOCK_END = "/* fallback-font-metrics:end */"


def font_metrics(font):
    """A font's `Metrics`: its frequency-weighted average advance and its figures' extent, in em."""
    cmap = font.getBestCmap()
    advances = font["hmtx"].metrics
    em = font["head"].unitsPerEm
    letters = sum(LETTER_FREQUENCY.values())
    total = SPACE_SHARE * advances[cmap[ord(" ")]][0]
    for letter, frequency in LETTER_FREQUENCY.items():
        total += (1 - SPACE_SHARE) * frequency / letters * advances[cmap[ord(letter)]][0]
    glyphs = font.getGlyphSet()
    tops, bottoms = [], []
    for character in FIGURES:
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(character)]].draw(pen)
        tops.append(pen.bounds[3])
        bottoms.append(pen.bounds[1])
    return Metrics(total / em, max(tops) / em, min(bottoms) / em)


def webfont_instance(source, weight):
    """The canonical variable TTF instanced at `weight`, every other axis at its default."""
    font = TTFont(FONTS_DIRECTORY / source)
    return instancer.instantiateVariableFont(font, {"wght": weight})


def fallback_metrics(name, fonts_dir):
    """Fallback font `name`'s metrics: recorded, or read from the first file found for it."""
    if name in RECORDED_METRICS:
        return RECORDED_METRICS[name]
    candidates = list(FALLBACK_FILES[name])
    if fonts_dir is not None:
        candidates = [str(Path(fonts_dir) / Path(path).name) for path in candidates] + candidates
    for candidate in candidates:
        path, _, number = candidate.partition("#")
        if os.path.exists(path):
            return font_metrics(TTFont(path, fontNumber=int(number or 0)))
    sys.exit(f"fallback-font-metrics: no file for {name}; looked in:\n  " + "\n  ".join(candidates))


def figures_scale(webfont, fallback):
    """The size-adjust at which `fallback`'s figures are nowhere smaller than `webfont`'s."""
    if fallback.figure_bottom is None:
        height = webfont.figure_top / fallback.figure_top
    else:
        height = (webfont.figure_top - webfont.figure_bottom) / (fallback.figure_top - fallback.figure_bottom)
    return math.ceil(max(webfont.average_width / fallback.average_width, height) * 100 - 1e-9) / 100


def percent(value):
    """`value` as a CSS percentage, to two decimals and without trailing zeros, as Prettier writes it."""
    return f"{value * 100:.2f}".rstrip("0").rstrip(".") + "%"


def collapse_whitespace(text):
    """`text` with every run of whitespace made one space: Prettier may wrap a long `src` list."""
    return re.sub(r"\s+", " ", text)


def face_rule(family, webfont, weight, fallback, size_adjust, unicode_range=None):
    """One `@font-face` rule for a fallback face."""
    hhea = webfont["hhea"]
    em = webfont["head"].unitsPerEm * size_adjust
    sources = ", ".join(f"local('{name}')" for name in LOCAL_NAMES[fallback])
    return "\n".join([
        "@font-face {",
        f"\tfont-family: '{family}';",
        f"\tsrc: {sources};",
        f"\tfont-weight: {weight};",
        *([f"\tunicode-range: {unicode_range};"] if unicode_range else []),
        f"\tsize-adjust: {percent(size_adjust)};",
        f"\tascent-override: {percent(hhea.ascent / em)};",
        f"\tdescent-override: {percent(abs(hhea.descent) / em)};",
        f"\tline-gap-override: {percent(hhea.lineGap / em)};",
        "}",
    ])


def family_rules(family, source, weights, has_figures, fonts_dir):
    """A family's faces: per weight, the text face, then the figures face, which wins for its range."""
    rules = []
    for weight, fallback in weights:
        webfont = webfont_instance(source, weight)
        webfont_metrics = font_metrics(webfont)
        metrics = fallback_metrics(fallback, fonts_dir)
        rules.append(face_rule(family, webfont, weight, fallback, webfont_metrics.average_width / metrics.average_width))
        if has_figures:
            scale = figures_scale(webfont_metrics, metrics)
            rules.append(face_rule(family, webfont, weight, fallback, scale, FIGURES_RANGE))
    return rules


def generated_block(fonts_dir):
    """The whole generated block, markers included."""
    rules = [rule for family in FAMILIES for rule in family_rules(*family, fonts_dir)]
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
