/**
 * Every brand-mark slot renders the real logomark, asserted across all six verticals.
 *
 * @remarks
 * The failure this guards is a typographic lookalike of the mark in the slot reserved for the mark:
 * `<span class="fe-about__brand-mark" aria-hidden="true">Z</span>`, a literal letter that `ui-styles`
 * styles into a 28x28 bordered box in Orbitron. It reads as a logo at a glance.
 *
 * No other gate sees it. `tests/tooling/brandAssets.test.ts` pins the asset BYTES and has nothing to
 * say, because the impersonation lives in CSS rather than in an asset — the files it compares stay
 * correct and identical. A spec that never asserts on the slot's content is green either way.
 *
 * So this is the sibling assertion to that file's: not "do the assets match" but "does the markup
 * reach for one". A brand-mark slot must contain a real mark — `<Mark />` in the two React
 * verticals, a `/mark.svg` `<img>` in the four that serve it statically, or a literal `<svg>` — and
 * never a text node dressed up to look like one.
 *
 * ### What this file deliberately does not cover
 *
 * The React landing and dataset headers render `<Mark size={72} animated />` with no `fe-*` class at
 * all, so they offer nothing to key on. They are also incapable of the failure: a `<Mark>` element
 * cannot be a glyph. The slots enumerated here are the ones where markup names a mark and something
 * else could be sitting in it.
 *
 * @packageDocumentation
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Every class name in the repo that names a mark slot, brand or otherwise.
 *
 * @remarks
 * Matched broadly ON PURPOSE, then classified against the two rosters below, so a class nobody has
 * triaged fails the classification case instead of being silently ignored by a narrower pattern.
 * Underscores are absent from the character class, so it cannot run across a `__` separator.
 */
const MARK_CLASS_PATTERN = /fe-[a-z0-9-]+__(?:brand-)?mark\b/gu;

/**
 * The slots that must hold the logomark.
 *
 * @remarks
 * Two shapes, and the difference matters to nothing here but is worth knowing: `__brand-mark` is a
 * WRAPPER whose child is the mark, while `fe-books-app__mark` and `fe-landing__mark` sit on the mark
 * element itself. Both are satisfied by a real-mark token within {@link SEARCH_WINDOW} characters,
 * which is why this file measures proximity rather than parsing five markup dialects.
 */
const BRAND_MARK_CLASSES = [
	'fe-about__brand-mark',
	'fe-books-app__mark',
	'fe-docs__brand-mark',
	'fe-lab__brand-mark',
	'fe-landing__mark',
] as const;

/**
 * Mark-shaped class names that are NOT brand marks.
 *
 * @remarks
 * 🔴 The trap this list exists for. `fe-tree__mark` is the hierarchical picker's tri-state checkbox
 * glyph — a literal `✓` or `–` in an `aria-hidden` span, which is exactly the shape this file calls
 * an offense everywhere else, and exactly correct there. A guard keyed on `__mark` without this
 * exemption red-lines five files of correct code.
 *
 * `fe-devtools-row__marker` (the `●` / `→` time-travel cursor) is the same kind of thing and needs
 * no entry: {@link MARK_CLASS_PATTERN} ends on a word boundary, so `marker` does not match.
 */
const NON_BRAND_MARK_CLASSES = ['fe-tree__mark'] as const;

/**
 * What counts as reaching for the real mark.
 *
 * @remarks
 * Three mechanisms, one per tier: the React component, the statically-served asset the other four
 * verticals resolve at runtime, and an inline `<svg>`. `/favicon.svg` is deliberately absent — it is
 * the ring-less 16px variant, and `brandAssets.test.ts` already fails any component source naming
 * it.
 */
const REAL_MARK_PATTERN = /<Mark[\s/>]|\/mark\.svg|<svg[\s>]/gu;

/**
 * How far from a slot a real mark may sit.
 *
 * @remarks
 * Generous by design, and the generosity is checked rather than assumed: the headroom case below
 * measures the worst distance any real slot actually needs and fails if it exceeds half of this. A
 * window nobody measures is a constant that drifts into a near-miss without anything saying so.
 */
const SEARCH_WINDOW = 200;

/** Extensions that can carry markup or styles. Excludes the mock-data corpora, which are neither. */
const SOURCE_EXTENSIONS = ['.css', '.html', '.js', '.mjs', '.svelte', '.ts', '.tsx', '.vue'] as const;

/** One occurrence of a brand-mark class in markup. */
interface BrandMarkSlot {
	/** The matched class name. */
	readonly className: string;
	/** Characters to the nearest real mark, or `null` when none sits inside the window. */
	readonly distance: number | null;
	/** 1-based line of the occurrence, for a readable failure. */
	readonly line: number;
}

/** A slot tagged with the file it was found in. */
interface LocatedBrandMarkSlot extends BrandMarkSlot {
	/** Repo-relative path, so a failure reads without the machine's directory layout in it. */
	readonly file: string;
}

/**
 * Every source file under a directory, recursively.
 *
 * @param dir - Absolute directory to walk.
 * @returns Absolute file paths, filtered to {@link SOURCE_EXTENSIONS}.
 */
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);

		if (statSync(path).isDirectory()) {
			return sourceFiles(path);
		}

		return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)) ? [path] : [];
	});
}

/** Every package `src` directory in the workspace. */
function packageSourceDirectories(): string[] {
	return readdirSync(resolve(REPO_ROOT, 'packages'))
		.map((name) => resolve(REPO_ROOT, 'packages', name, 'src'))
		.filter((dir) => {
			try {
				return statSync(dir).isDirectory();
			} catch {
				return false;
			}
		});
}

/**
 * Every file that can hold a brand-mark slot.
 *
 * @remarks
 * Test files are excluded: a spec naming one of these classes in an assertion is reasoning ABOUT a
 * render site, not being one, and would otherwise have to keep a decorative `/mark.svg` nearby to
 * stay green.
 *
 * ⚠ **`.css` files are excluded too, and for a stronger reason than convenience: a stylesheet can
 * DEFINE a slot but it can never FILL one.** The `.`-prefix rule below already skips selectors, but
 * prose in a CSS comment naming a class bare is not a selector and would read as a render site — so
 * a stylesheet's own explanation of this guard could fail it. Dropping the whole file type removes the
 * category rather than the instance. The classification case below still scans
 * CSS, because a class DECLARED there is exactly what should force a triage decision.
 *
 * @returns Absolute paths.
 */
function markupFiles(): string[] {
	return packageSourceDirectories()
		.flatMap(sourceFiles)
		.filter((path) => !path.endsWith('.css'))
		.filter((path) => !/\.(?:test|spec)\./u.test(path));
}

/**
 * Locate every brand-mark slot in a source string and measure how far each sits from a real mark.
 *
 * @remarks
 * Occurrences preceded by `.` are CSS selectors, not markup — `ui-styles` styles these classes, and
 * `DocsLayout.tsx` and the two `LandingPage.tsx` files carry their own inline stylesheets as
 * template literals. A rule declaring the slot is not a site that fills it.
 *
 * Extracted as a function taking a STRING rather than reading files itself, so the negative control
 * below can put a known impersonation through the identical code path. An instrument that has
 * only ever been pointed at correct input has not been shown to work.
 *
 * @param source - File contents.
 * @returns One record per occurrence, in file order.
 */
function brandMarkSlots(source: string): readonly BrandMarkSlot[] {
	const markOffsets = [...source.matchAll(REAL_MARK_PATTERN)].map((match) => match.index);
	const slots: BrandMarkSlot[] = [];

	for (const match of source.matchAll(MARK_CLASS_PATTERN)) {
		const isSelector = source[match.index - 1] === '.';

		if (isSelector || !BRAND_MARK_CLASSES.some((name) => name === match[0])) {
			continue;
		}

		const distances = markOffsets
			.map((offset) => Math.abs(offset - match.index))
			.filter((distance) => distance <= SEARCH_WINDOW);

		slots.push({
			className: match[0],
			distance: distances.length === 0 ? null : Math.min(...distances),
			line: source.slice(0, match.index).split('\n').length,
		});
	}

	return slots;
}

/** Every slot in the repo, tagged with its repo-relative file. */
function allSlots(): readonly LocatedBrandMarkSlot[] {
	return markupFiles().flatMap((path) => {
		const file = path.replace(`${REPO_ROOT}/`, '');

		return brandMarkSlots(readFileSync(path, 'utf8')).map((slot) => ({ ...slot, file }));
	});
}

/** An About-page header with a text glyph in the brand-mark slot — the impersonation this file rejects. */
const IMPERSONATION_FIXTURE = `
	<header className="fe-about__topbar">
		<a className="fe-about__brand" href="/">
			<span className="fe-about__brand-mark" aria-hidden="true">Z</span>
			<span className="fe-about__brand-word">Filter EngineZ</span>
		</a>
	</header>
`;

/** The same markup with a real mark, so the control is two-sided rather than merely pessimistic. */
const CORRECTED_FIXTURE = `
	<header className="fe-about__topbar">
		<a className="fe-about__brand" href="/">
			<span className="fe-about__brand-mark" aria-hidden="true">
				<Mark size={28} />
			</span>
			<span className="fe-about__brand-word">Filter EngineZ</span>
		</a>
	</header>
`;

describe('brand mark markup', () => {
	it('reports a text-glyph impersonation as an offender, and a real mark as clean', () => {
		// 🔴 THE NEGATIVE CONTROL, and the reason it is the first case in the file. An instrument can
		// report PASS over inputs it never examined; a clean run below means nothing until this one has
		// been shown to produce a dirty one on the same class of input.
		const impersonation = brandMarkSlots(IMPERSONATION_FIXTURE);
		const corrected = brandMarkSlots(CORRECTED_FIXTURE);

		expect(impersonation, 'the fixture holds exactly one brand-mark slot').toHaveLength(1);
		expect(impersonation[0]?.distance, 'a text glyph in the slot must read as no mark at all').toBeNull();

		expect(corrected, 'the fixture holds exactly one brand-mark slot').toHaveLength(1);
		expect(corrected[0]?.distance, 'a real <Mark /> in the slot must be found').not.toBeNull();
	});

	it('has every brand-mark slot reaching for the real mark', () => {
		// THE guard. `<Mark />`, `/mark.svg` or an inline `<svg>` within the window — anything else in a
		// slot named for the logomark is a lookalike, which is the failure this file exists for.
		const offenders = allSlots()
			.filter((slot) => slot.distance === null)
			.map((slot) => `${slot.file}:${slot.line} ${slot.className}`);

		expect(
			offenders,
			'a brand-mark slot must contain <Mark />, /mark.svg or an inline <svg> — never a text glyph',
		).toEqual([]);
	});

	it('finds a slot for every brand-mark class it knows about', () => {
		// The vacuity guard. Every assertion above passes trivially over zero slots, and a rename in
		// `ui-styles` plus its markup would produce exactly that: a green suite comparing nothing. Derived
		// from disk and asserted against the roster, the same shape as `brandAssets.test.ts`'s
		// roster-vs-disk case.
		const found = [...new Set(allSlots().map((slot) => slot.className))];

		expect(found.sort(), 'a brand-mark class with no markup site — renamed, or the slot was deleted')
			.toEqual([...BRAND_MARK_CLASSES].sort());
	});

	it('classifies every mark-shaped class in the repo', () => {
		// The rot guard, and the one that makes the roster above safe to hand-keep. A new `fe-x__mark`
		// lands in neither list and fails here, forcing the question "is that a brand mark?" at the moment
		// somebody can still answer it cheaply — rather than in six months, from the markup.
		const declared = new Set<string>([...BRAND_MARK_CLASSES, ...NON_BRAND_MARK_CLASSES]);
		const unclassified = [
			...new Set(
				packageSourceDirectories()
					.flatMap(sourceFiles)
					.flatMap((path) => [...readFileSync(path, 'utf8').matchAll(MARK_CLASS_PATTERN)])
					.map((match) => match[0])
					.filter((name) => !declared.has(name)),
			),
		];

		expect(
			unclassified.sort(),
			'a mark-shaped class in neither roster — add it to BRAND_MARK_CLASSES or NON_BRAND_MARK_CLASSES',
		).toEqual([]);
	});

	it('keeps real headroom between the slots and the window', () => {
		// What makes `SEARCH_WINDOW` a measurement rather than a guess. The widest real slot is Angular's,
		// whose `<img>` puts every attribute on its own line; if a reformat ever pushed a mark past half
		// the window, this says so while there is still margin, instead of the guard above quietly
		// flipping to a false offense.
		const distances = allSlots().flatMap((slot) => (slot.distance === null ? [] : [slot.distance]));

		expect(distances.length, 'no slots measured — see the vacuity guard above').toBeGreaterThan(0);
		expect(Math.max(...distances)).toBeLessThanOrEqual(SEARCH_WINDOW / 2);
	});
});
