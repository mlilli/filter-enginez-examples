#!/usr/bin/env node
/**
 * `subset-brand-fonts` — build the WOFF2 webfonts every site serves from the canonical variable TTFs,
 * and record what each was built from.
 *
 *     node scripts/subset-brand-fonts.mjs            # write the WOFF2 files and the manifest
 *     node scripts/subset-brand-fonts.mjs --check    # fail if a source, a WOFF2 or the spec has drifted
 *
 * @remarks
 * The brand package keeps each font's variable TTF beside its `OFL.txt` in `packages/brand/src/fonts/`
 * (byte copies of the design system's `docs/branding/design-system/fonts/`). Those are the sources.
 * What `tokens.css` serves is a subset of each, in WOFF2: the characters the sites render, every
 * variation axis intact. Inter's TTF is 875 kB on disk; its subset is under a tenth of that.
 *
 * ### The subset
 *
 * One file per font, the same code points for all three ({@link CODE_POINT_RANGES}; each font keeps
 * those it has a glyph for). The ranges come from the characters the sites actually set: every host's
 * HTML, components and content modules, and the vocabulary `@filter-enginez/mock-data` generates
 * records from, whose place and grape names (Albariño, Rhône, Graševina, Tămâioasă, Boğazkere) reach
 * Latin Extended-A and two letters of Extended-B. One file rather than a Latin and a Latin-extended
 * pair split by `unicode-range`: the extended letters add about a tenth to each file, and a single
 * file is the one a page's preload can name with certainty.
 *
 * The layout features kept ({@link LAYOUT_FEATURES}) are the ones browsers apply to Latin text
 * by default, plus the ones the stylesheets ask for: `ss01` and `cv11` on every page (`tokens.css`),
 * `cv01` and `cv02` in the React apps, `tnum` wherever numbers are tabular.
 *
 * ### The Reserved Font Name
 *
 * The SIL Open Font License lets anyone subset and convert a font, and calls the result a Modified
 * Version, which may not use a Reserved Font Name. Orbitron declares one ("Orbitron"), so its subset
 * is renamed: every name record that names the family says `Filter EngineZ Display` (PostScript:
 * `FilterEngineZDisplay`), and the stylesheets ask for it by that name. Its copyright notice, which the
 * license requires to stay, still names the Orbitron Project Authors. Inter and JetBrains Mono declare
 * no Reserved Font Name and keep their own. Each subset sits in its source font's directory, beside the
 * `OFL.txt` that licenses it, and the deploy job ships every font directory's license with each site.
 *
 * ### Reproducible, and checked without the font tools
 *
 * Writing needs Python 3 with fontTools and brotli at the versions in {@link PINNED_TOOLS}
 * (`python3 -m pip install fonttools==4.65.0 brotli==1.2.0`; set `PYTHON` to use another interpreter),
 * and refuses to run with any other version: the same sources and versions give the same bytes on every
 * run. The subsetting itself is `scripts/lib/subset-brand-font.py`.
 *
 * Checking needs neither. The manifest, `packages/brand/src/fonts/subsets.json`, records the spec, the
 * tool versions and the SHA-256 of every source and every output. `--check` fails if a TTF no longer
 * matches the hash its subset was built from, if a WOFF2 no longer matches the hash it was written with,
 * if the spec in this file differs from the one the manifest was written with, or if a WOFF2 sits in the
 * fonts directory that the manifest does not list. `tests/tooling/brandFonts.test.ts` runs it.
 *
 * @packageDocumentation
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The repository root. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The brand package's fonts directory: one directory per font, each with its TTF and `OFL.txt`. */
const FONTS_DIRECTORY = join(ROOT, 'packages/brand/src/fonts');

/** The manifest, relative to {@link FONTS_DIRECTORY}. */
const MANIFEST_FILE = 'subsets.json';

/** The subsetting helper this script runs for each font. */
const SUBSET_HELPER = join(ROOT, 'scripts/lib/subset-brand-font.py');

/**
 * The tool versions every committed WOFF2 was written with. Another version may write other bytes, so
 * the helper refuses to run with one, before it writes anything.
 */
const PINNED_TOOLS = { brotli: '1.2.0', fontTools: '4.65.0' };

/**
 * One font to subset.
 *
 * @typedef {object} BrandFont
 * @property {string} directory - Its directory under {@link FONTS_DIRECTORY}, which also holds its `OFL.txt`.
 * @property {string} source - The canonical variable TTF, in that directory.
 * @property {string} output - The WOFF2 subset to write, in that directory.
 * @property {string} family - The family name the subset carries, and `tokens.css` declares.
 * @property {{ readonly from: string; readonly family: string; readonly postScriptFamily: string } | null} rename -
 *   The Reserved Font Name the source declares and the names that replace it, or `null` for a font whose
 *   license reserves no name.
 */

/** @type {readonly BrandFont[]} */
const BRAND_FONTS = [
	{
		directory: 'inter',
		family: 'Inter',
		output: 'Inter-Subset.woff2',
		rename: null,
		source: 'Inter-VariableFont.ttf',
	},
	{
		directory: 'jetbrains-mono',
		family: 'JetBrains Mono',
		output: 'JetBrainsMono-Subset.woff2',
		rename: null,
		source: 'JetBrainsMono-VariableFont.ttf',
	},
	{
		directory: 'orbitron',
		family: 'Filter EngineZ Display',
		output: 'FilterEngineZDisplay-Subset.woff2',
		rename: { family: 'Filter EngineZ Display', from: 'Orbitron', postScriptFamily: 'FilterEngineZDisplay' },
		source: 'Orbitron-VariableFont_wght.ttf',
	},
];

/**
 * One run of consecutive code points, inclusive, and what it is there for.
 *
 * @typedef {{ readonly first: number; readonly last: number; readonly reason: string }} CodePointRange
 */

/**
 * The characters every subset keeps, ascending.
 *
 * @type {readonly CodePointRange[]}
 */
const CODE_POINT_RANGES = [
	{ first: 0x0020, last: 0x007e, reason: 'Basic Latin: ASCII letters, digits and punctuation' },
	{ first: 0x00a0, last: 0x00ff, reason: 'Latin-1 Supplement: Albariño, Rhône, Mourvèdre, Grüner; · × ± ¬' },
	{ first: 0x0100, last: 0x017f, reason: 'Latin Extended-A: Graševina, Tămâioasă, Boğazkere, Babić, Štajerska' },
	{ first: 0x01cd, last: 0x01ce, reason: 'Ǎ ǎ: Feteascǎ Regalǎ' },
	{ first: 0x0218, last: 0x021b, reason: 'Ș ș Ț ț, the Romanian comma-below letters: Dealurile Hușilor' },
	{ first: 0x2013, last: 0x2014, reason: 'en and em dashes' },
	{ first: 0x2018, last: 0x2019, reason: 'single quotation marks and the apostrophe' },
	{ first: 0x201c, last: 0x201d, reason: 'double quotation marks' },
	{ first: 0x2026, last: 0x2026, reason: 'ellipsis: "measuring…", placeholders' },
	{ first: 0x2190, last: 0x2190, reason: '← previous links' },
	{ first: 0x2192, last: 0x2192, reason: '→ calls to action and figure captions' },
	{ first: 0x2205, last: 0x2205, reason: '∅ the exclusion figure' },
	{ first: 0x2208, last: 0x2208, reason: '∈ rule predicates in the docs' },
	{ first: 0x2212, last: 0x2212, reason: '− minus sign' },
	{ first: 0x221e, last: 0x221e, reason: '∞ open range bounds' },
	{ first: 0x2227, last: 0x222a, reason: '∧ ∨ ∩ ∪ rule predicates and the text-index figure' },
	{ first: 0x2248, last: 0x2248, reason: '≈ approximate timings and counts' },
	{ first: 0x2260, last: 0x2260, reason: '≠ comparison operators' },
	{ first: 0x2264, last: 0x2265, reason: '≤ ≥ comparison operators' },
	{ first: 0x2286, last: 0x2286, reason: '⊆ rule predicates in the docs' },
	{ first: 0x25b8, last: 0x25b8, reason: '▸ the playground’s Run button' },
	{ first: 0x25cf, last: 0x25cf, reason: '● the devtools time-travel cursor' },
	{ first: 0x2605, last: 0x2605, reason: '★ book ratings' },
	{ first: 0x2713, last: 0x2713, reason: '✓ the hierarchical picker’s checked state' },
];

/**
 * The OpenType layout features every subset keeps.
 *
 * @remarks
 * First the features browsers apply to Latin text unasked (composition, kerning, ligatures, contextual
 * alternates, mark positioning, localized forms, variation-aware substitution); then the ones the
 * stylesheets turn on.
 */
const LAYOUT_FEATURES = [
	'calt',
	'ccmp',
	'clig',
	'curs',
	'kern',
	'liga',
	'locl',
	'mark',
	'mkmk',
	'rclt',
	'rlig',
	'rvrn',
	'cv01',
	'cv02',
	'cv11',
	'ss01',
	'tnum',
];

/**
 * Format a code point the way `unicode-range` does.
 *
 * @param {number} codePoint - The code point.
 * @returns {string} At least four uppercase hex digits.
 */
function hex(codePoint) {
	return codePoint.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * The code points as one `unicode-range`-style string, e.g. `U+0020-007E, U+00A0-00FF, U+2026`.
 *
 * @returns {string} The ranges, in order.
 */
export function codePointSpec() {
	return CODE_POINT_RANGES.map(({ first, last }) => (first === last ? `U+${hex(first)}` : `U+${hex(first)}-${hex(last)}`)).join(', ');
}

/**
 * Every code point the subsets keep.
 *
 * @returns {number[]} Ascending.
 */
function codePoints() {
	return CODE_POINT_RANGES.flatMap(({ first, last }) => Array.from({ length: last - first + 1 }, (_, offset) => first + offset));
}

/**
 * The SHA-256 of a file, in hex.
 *
 * @param {string} path - An absolute path.
 * @returns {string} The digest.
 */
function sha256(path) {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * One font's entry in the manifest.
 *
 * @typedef {object} ManifestFont
 * @property {string} family - The family the subset carries.
 * @property {string} source - The TTF it was built from, relative to the fonts directory.
 * @property {string} sourceSha256 - That TTF's SHA-256 when the subset was written.
 * @property {number} bytes - The WOFF2's size.
 * @property {number} glyphs - How many glyphs it kept.
 * @property {string} sha256 - The WOFF2's SHA-256.
 */

/**
 * The manifest: what every WOFF2 was built from, with what, and what it came out as.
 *
 * @typedef {object} Manifest
 * @property {string} codePoints - {@link codePointSpec} when it was written.
 * @property {string} layoutFeatures - {@link LAYOUT_FEATURES}, comma-separated.
 * @property {{ readonly brotli: string; readonly fontTools: string }} tools - The versions that wrote it.
 * @property {Record<string, ManifestFont>} fonts - By WOFF2 path, relative to the fonts directory.
 */

/**
 * A font's WOFF2 path, relative to the fonts directory: the manifest's key for it.
 *
 * @param {BrandFont} font - The font.
 * @returns {string} `<directory>/<output>`.
 */
function outputKey(font) {
	return `${font.directory}/${font.output}`;
}

/**
 * Compare the committed WOFF2 files, their sources and the manifest with this script's spec.
 *
 * @returns {string[]} One line per problem; empty when everything matches.
 */
export function checkBrandFontSubsets() {
	const manifestPath = join(FONTS_DIRECTORY, MANIFEST_FILE);

	if (!existsSync(manifestPath)) {
		return [`${MANIFEST_FILE} is missing`];
	}

	/** @type {Manifest} */
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const problems = [];

	if (manifest.codePoints !== codePointSpec()) {
		problems.push('the code points differ from the ones the subsets were written with');
	}
	if (manifest.layoutFeatures !== LAYOUT_FEATURES.join(',')) {
		problems.push('the layout features differ from the ones the subsets were written with');
	}
	for (const font of BRAND_FONTS) {
		const key = outputKey(font);
		const entry = manifest.fonts[key];
		const output = join(FONTS_DIRECTORY, key);

		if (entry === undefined) {
			problems.push(`${key} is not in ${MANIFEST_FILE}`);
			continue;
		}
		if (entry.family !== font.family || entry.source !== `${font.directory}/${font.source}`) {
			problems.push(`${key}: its family or source differs from the one it was written with`);
		}
		if (sha256(join(FONTS_DIRECTORY, font.directory, font.source)) !== entry.sourceSha256) {
			problems.push(`${font.directory}/${font.source} has changed since ${key} was written from it`);
		}
		if (!existsSync(output)) {
			problems.push(`${key} is missing`);
		} else if (sha256(output) !== entry.sha256) {
			problems.push(`${key} differs from the file this script wrote`);
		}
	}

	const expected = new Set(BRAND_FONTS.map((font) => outputKey(font)));
	const strays = readdirSync(FONTS_DIRECTORY, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.woff2'))
		.map((entry) => `${entry.parentPath.slice(FONTS_DIRECTORY.length + 1)}/${entry.name}`)
		.filter((key) => !expected.has(key));
	const listed = Object.keys(manifest.fonts).filter((key) => !expected.has(key));

	for (const key of [...new Set([...strays, ...listed])].sort()) {
		problems.push(`${key} is not one of the subsets this script writes`);
	}

	return problems;
}

/**
 * Subset one font through the Python helper.
 *
 * @param {string} python - The interpreter.
 * @param {BrandFont} font - The font.
 * @returns {{ readonly glyphs: number }} The helper's report: how many glyphs the subset kept.
 */
function subsetFont(python, font) {
	const job = {
		codePoints: codePoints(),
		layoutFeatures: LAYOUT_FEATURES,
		output: join(FONTS_DIRECTORY, font.directory, font.output),
		rename: font.rename,
		source: join(FONTS_DIRECTORY, font.directory, font.source),
		tools: PINNED_TOOLS,
	};
	const run = spawnSync(python, [SUBSET_HELPER], { encoding: 'utf8', input: JSON.stringify(job) });

	if (run.status !== 0) {
		throw new Error(
			`${python} ${SUBSET_HELPER} failed for ${font.source}:\n${run.stderr || (run.error?.message ?? '')}\n`
				+ `It needs Python 3 with fontTools ${PINNED_TOOLS.fontTools} and brotli ${PINNED_TOOLS.brotli}: `
				+ `python3 -m pip install fonttools==${PINNED_TOOLS.fontTools} brotli==${PINNED_TOOLS.brotli}`,
		);
	}

	return JSON.parse(run.stdout);
}

/**
 * Write every subset and the manifest.
 *
 * @param {string} python - The interpreter to run the helper with.
 * @returns {string[]} One summary line per font.
 */
function writeBrandFontSubsets(python) {
	/** @type {Manifest} */
	const manifest = { codePoints: codePointSpec(), fonts: {}, layoutFeatures: LAYOUT_FEATURES.join(','), tools: PINNED_TOOLS };
	const lines = [];

	for (const font of BRAND_FONTS) {
		const report = subsetFont(python, font);
		const key = outputKey(font);
		const output = join(FONTS_DIRECTORY, key);
		const bytes = readFileSync(output).length;

		manifest.fonts[key] = {
			bytes,
			family: font.family,
			glyphs: report.glyphs,
			sha256: sha256(output),
			source: `${font.directory}/${font.source}`,
			sourceSha256: sha256(join(FONTS_DIRECTORY, font.directory, font.source)),
		};
		lines.push(`${key}: ${String(bytes)} bytes, ${String(report.glyphs)} glyphs`);
	}
	writeFileSync(join(FONTS_DIRECTORY, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

	return lines;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (process.argv.includes('--check')) {
		const problems = checkBrandFontSubsets();

		if (problems.length > 0) {
			console.error(`✗ ${String(problems.length)} brand font subset problem(s):\n   ${problems.join('\n   ')}`);
			console.error('   run: node scripts/subset-brand-fonts.mjs');
			process.exit(1);
		}
		console.log(`✓ ${String(BRAND_FONTS.length)} brand font subset(s) match their sources and the spec`);
	} else {
		const lines = writeBrandFontSubsets(process.env['PYTHON'] ?? 'python3');

		console.log(`✓ wrote ${String(lines.length)} brand font subset(s) to packages/brand/src/fonts:\n   ${lines.join('\n   ')}`);
	}
}
