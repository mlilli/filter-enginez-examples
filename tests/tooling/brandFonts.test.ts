/**
 * The webfonts every site serves: WOFF2 subsets of the brand's canonical TTFs, built by
 * `scripts/subset-brand-fonts.mjs` and declared by `@filter-enginez/brand/tokens.css`.
 *
 * @remarks
 * What would otherwise fail silently, and where:
 *
 * - **A subset that no longer matches its source.** A TTF updated without regenerating, or a WOFF2
 *   replaced by hand, still builds and still renders. The script's `--check` compares both against the
 *   SHA-256 values its manifest recorded when it wrote them, and the spec it was written with against
 *   the spec in the script; this suite runs it.
 * - **A stylesheet that serves something else.** `tokens.css` must load exactly the subsets, in
 *   WOFF2, under the family names they carry, and never the TTFs (which are 875 kB for Inter alone).
 * - **A Reserved Font Name on a modified font.** The SIL Open Font License forbids it, and the names
 *   sit inside the compressed font where no text search reaches; `support/woff2Names.ts` reads them.
 * - **A character the subset does not have.** A page or a dataset that starts using one renders it in
 *   a fallback font, with no error anywhere. The site's pages and the mock-data vocabulary every demo
 *   generates its records from are checked against the subset's code points.
 *
 * @packageDocumentation
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { woff2NameRecords } from './support/woff2Names.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The brand package's fonts directory. */
const FONTS_DIRECTORY = resolve(REPO_ROOT, 'packages/brand/src/fonts');

/** The stylesheet that declares the fonts. */
const TOKENS_SHEET = resolve(REPO_ROOT, 'packages/brand/src/tokens.css');

/** The generator, whose `--check` this suite runs. */
const SUBSET_SCRIPT = resolve(REPO_ROOT, 'scripts/subset-brand-fonts.mjs');

/** Name IDs a renamed font keeps verbatim: the copyright notice the license requires, and the license description and URL. */
const KEPT_NAME_IDS: ReadonlySet<number> = new Set([0, 13, 14]);

/** The landing site's HTML entries, whose text is checked against the subset. */
const SITE_PAGES = ['index.html', 'how-it-works.html', 'compare.html', '404.html'] as const;

/** One font's entry in `subsets.json`. */
interface ManifestFont {
	/** The family the subset carries. */
	readonly family: string;
	/** The TTF it was built from, relative to the fonts directory. */
	readonly source: string;
}

/** The parts of `subsets.json` this suite reads. */
interface Manifest {
	/** The kept code points, `unicode-range` style. */
	readonly codePoints: string;
	/** Each subset, by its path relative to the fonts directory. */
	readonly fonts: Readonly<Record<string, ManifestFont>>;
}

const MANIFEST = JSON.parse(readFileSync(join(FONTS_DIRECTORY, 'subsets.json'), 'utf8')) as Manifest;
const SUBSETS = Object.entries(MANIFEST.fonts);

/**
 * Parse a `unicode-range`-style list into the set of code points it covers.
 *
 * @param spec - E.g. `U+0020-007E, U+2026`.
 * @returns The code points.
 */
function parseCodePoints(spec: string): ReadonlySet<number> {
	const codePoints = new Set<number>();

	for (const part of spec.split(',')) {
		const [first = '', last = first] = part.trim().replace(/^U\+/u, '').split('-');

		for (let codePoint = Number.parseInt(first, 16); codePoint <= Number.parseInt(last, 16); codePoint++) {
			codePoints.add(codePoint);
		}
	}

	return codePoints;
}

const SUBSET_CODE_POINTS = parseCodePoints(MANIFEST.codePoints);

/**
 * The characters of a text that the subset does not cover, ignoring whitespace and control characters.
 *
 * @param text - Any text.
 * @returns The missing characters, each once, in code-point order.
 */
function uncovered(text: string): readonly string[] {
	return [...new Set(text)]
		.filter((character) => !/[\s\p{Cc}]/u.test(character) && !SUBSET_CODE_POINTS.has(character.codePointAt(0) ?? 0))
		.sort();
}

/**
 * The `@font-face` rules of `tokens.css`, each as its family and its sources.
 *
 * @returns One entry per rule.
 */
function fontFaces(): readonly { readonly family: string; readonly sources: string }[] {
	return [...readFileSync(TOKENS_SHEET, 'utf8').matchAll(/@font-face\s*\{([^}]*)\}/gu)].map(([, body = '']) => ({
		family: /font-family:\s*'([^']+)'/u.exec(body)?.[1] ?? '',
		sources: /src:\s*([^;]+);/u.exec(body)?.[1]?.trim() ?? '',
	}));
}

/**
 * The Reserved Font Name a font's `OFL.txt` declares, or `null` when it declares none.
 *
 * @param fontDirectory - The font's directory under the fonts directory.
 * @returns The reserved name.
 */
function reservedFontName(fontDirectory: string): string | null {
	return /Reserved Font Names?:\s*"([^"]+)"/u.exec(readFileSync(join(FONTS_DIRECTORY, fontDirectory, 'OFL.txt'), 'utf8'))?.[1] ?? null;
}

describe('the brand font subsets', () => {
	it('lists the three fonts, so the cases below are not vacuous', () => {
		expect(SUBSETS.map(([, font]) => font.source).sort()).toEqual([
			'inter/Inter-VariableFont.ttf',
			'jetbrains-mono/JetBrainsMono-VariableFont.ttf',
			'orbitron/Orbitron-VariableFont_wght.ttf',
		]);
		expect(SUBSET_CODE_POINTS.size).toBeGreaterThan(300);
	});

	it('match their sources, the spec and the files the generator wrote (subset-brand-fonts --check)', () => {
		const run = spawnSync(process.execPath, [SUBSET_SCRIPT, '--check'], { encoding: 'utf8' });

		expect(run.stderr).toBe('');
		expect(run.status).toBe(0);
		expect(run.stdout).toContain('✓ 3 brand font subset(s) match their sources and the spec');
	});

	it.each(SUBSETS)('%s is a WOFF2 file in its source font’s directory, beside that font’s OFL.txt', (key, font) => {
		expect(readFileSync(join(FONTS_DIRECTORY, key)).toString('latin1', 0, 4)).toBe('wOF2');
		expect(dirname(key)).toBe(dirname(font.source));
		expect(existsSync(join(FONTS_DIRECTORY, dirname(key), 'OFL.txt'))).toBe(true);
	});

	it.each(SUBSETS)('%s carries no Reserved Font Name its license declares', (key, font) => {
		const reserved = reservedFontName(dirname(key));
		const records = woff2NameRecords(readFileSync(join(FONTS_DIRECTORY, key)));
		const familyNames = records.filter((record) => record.nameID === 1).map((record) => record.text);

		expect(familyNames.length).toBeGreaterThan(0);
		expect(new Set(familyNames)).toEqual(new Set([font.family]));
		if (reserved !== null) {
			expect(font.family).not.toContain(reserved);
			expect(
				records.filter((record) => !KEPT_NAME_IDS.has(record.nameID) && record.text.includes(reserved)).map((record) => record.nameID),
				`name records of ${key} that still say "${reserved}"`,
			).toEqual([]);
		}
	});

	it('reads Orbitron’s Reserved Font Name, so the case above can fail', () => {
		expect(reservedFontName('orbitron')).toBe('Orbitron');
		expect(reservedFontName('inter')).toBeNull();
	});
});

describe('tokens.css', () => {
	it('declares exactly the subsets, in WOFF2, under the family each carries', () => {
		const expected = SUBSETS.map(([key, font]) => ({ family: font.family, sources: `url('fonts/${key}') format('woff2')` }));

		expect(fontFaces().slice().sort((a, b) => a.family.localeCompare(b.family))).toEqual(
			expected.sort((a, b) => a.family.localeCompare(b.family)),
		);
	});

	it('loads no TTF: the canonical files are sources, never served', () => {
		expect(readFileSync(TOKENS_SHEET, 'utf8')).not.toMatch(/\.ttf\b/u);
	});

	it('names the renamed display face first in --font-display', () => {
		expect(readFileSync(TOKENS_SHEET, 'utf8')).toMatch(/--font-display: 'Filter EngineZ Display',/u);
	});
});

describe('what the subset covers', () => {
	it.each(SITE_PAGES)('every character packages/site/%s sets', (page) => {
		const html = readFileSync(resolve(REPO_ROOT, 'packages/site', page), 'utf8');
		// The text a visitor sees: no structured data, comments or markup.
		const text = html
			.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gu, '')
			.replaceAll(/<!--[\s\S]*?-->/gu, '')
			.replaceAll(/<[^>]+>/gu, ' ');

		expect(text.length).toBeGreaterThan(300);
		expect(uncovered(text)).toEqual([]);
	});

	it('every letter and dash in the vocabulary @filter-enginez/mock-data generates records from', () => {
		// The installed package's build, which is what the demos run: place, grape, producer and author
		// names. Comments are stripped; what is left is code and the string tables.
		const distribution = join(realpathSync(resolve(REPO_ROOT, 'packages/site/node_modules/@filter-enginez/mock-data')), 'dist');
		const modules = readdirSync(distribution, { recursive: true, withFileTypes: true }).filter(
			(entry) => entry.isFile() && entry.name.endsWith('.js'),
		);
		const code = modules
			.map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
			.join('\n')
			.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
			.replaceAll(/(?<![:\w"'`])\/\/[^\n]*/gu, '');
		const lettersAndDashes = [...code.matchAll(/[\p{L}\p{Pd}\p{Pi}\p{Pf}]/gu)].map(([character]) => character).join('');

		expect(modules.length).toBeGreaterThan(10);
		// Non-vacuous: the wine vocabulary's accented names are in there to be checked.
		expect(lettersAndDashes).toContain('ă');
		expect(uncovered(lettersAndDashes)).toEqual([]);
	});

	it('reports a character it does not cover, so the cases above can fail', () => {
		expect(uncovered('Albariño — Tămâioasă ↗ 5 €')).toEqual(['€', '↗'].sort());
	});
});
