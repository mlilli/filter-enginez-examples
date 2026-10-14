/**
 * The boot caption is worded in exactly one module, and every vertical renders that module.
 *
 * @remarks
 * The caption has three states — loading, indexing, and the worker hand-off — and every vertical
 * shows it while a dataset boots. Worded per screen, the copies disagree in ways no single vertical
 * can see: a copy without the zero-total guard announces `{ loaded: 0, total: 0 }` as "0 books
 * loaded · constructing filter index", a finished load that has not started, and a two-state copy
 * with no indexing state leaves the screen frozen on `150,000 / 150,000 bottles` for the whole
 * bitmap-index build — the hang-reading failure the third state exists to prevent.
 *
 * Each screen is self-consistent; a disagreement only exists BETWEEN them. That is the same shape as
 * `mark.svg` / `favicon.svg` and as the letter `Z` in the brand-mark slot, and it is why the guard is
 * an instrument that compares every site rather than a convention.
 *
 * ### What this asserts, and why it is a text rule
 *
 * The caption's distinctive words may appear in `examples-shared/src/boot-caption/` and in specs
 * asserting what a screen renders — nowhere else. A vertical that reintroduces its own wording trips
 * this even if it never imports anything, which a call-graph check would miss.
 *
 * Comments are NOT exempted, and that is deliberate rather than lazy. Prose describes the default
 * instead of quoting it, so the rule needs no exception list — and an exception list is the thing
 * that would eventually be widened to admit a real offender.
 *
 * ### The second half: the ELEMENT
 *
 * Shared words say nothing about the paragraph they are rendered in, and that element fails one
 * layer out in three distinct ways:
 *
 *   - a class **declared nowhere** — an `fe-` prefix on a class no `fe-*` stylesheet declares — so
 *     the caption renders unstyled while the other verticals style theirs;
 *   - a class declared **twice, byte for byte**, in two scoped blocks — inert until one of them
 *     changes, and then the two copies drift;
 *   - a borrowed class (a panel section heading) or an inline style bag, which is the hardest of all
 *     to compare against the other sites.
 *
 * So the cases below pin three properties a reader cannot check by opening any one file: every
 * `fe-boot-caption*` class a vertical renders is one `ui-styles` declares, every render site carries
 * the block plus exactly one variant modifier, and the roster of sites is what it was measured to be.
 *
 * Some of these cases guard against the next instance rather than detect a present one: on a tree
 * where nothing uses an undeclared or redeclared caption class they pass, and they are only as good as
 * their matchers. The vacuity cases alongside them are what stop "not violated" from being read as
 * "cannot fire".
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The one module allowed to word the caption. */
const CAPTION_SOURCE = 'packages/examples-shared/src/boot-caption';

/**
 * Words that belong to the caption and to nothing else in the repo.
 *
 * @remarks
 * Chosen because each is distinctive enough that an incidental match would itself be worth looking
 * at. `Loaded ` and the record nouns are deliberately absent — they are ordinary English and would
 * make this a nuisance rather than a guard.
 */
const CAPTION_PHRASES = ['Spinning up worker thread', 'constructing filter index'] as const;

/** Extensions that can hold markup or component logic. */
const SOURCE_EXTENSIONS = ['.html', '.svelte', '.ts', '.tsx', '.vue'] as const;

/**
 * Every source file under a directory, recursively.
 *
 * @param dir - Absolute directory to walk.
 * @returns Absolute file paths.
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

/** Every package `src` directory. */
function packageSources(): string[] {
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
 * Files wording the caption, as repo-relative paths.
 *
 * @param includeSpecs - Whether spec files count.
 * @returns Repo-relative paths, sorted.
 */
function filesWordingTheCaption(includeSpecs: boolean): string[] {
	return packageSources()
		.flatMap(sourceFiles)
		.filter((path) => includeSpecs || !/\.(?:test|spec)\./u.test(path))
		.filter((path) => {
			const text = readFileSync(path, 'utf8');

			return CAPTION_PHRASES.some((phrase) => text.includes(phrase));
		})
		.map((path) => relative(REPO_ROOT, path))
		.sort();
}

/** The one stylesheet allowed to declare the caption's classes. */
const CAPTION_STYLESHEET = 'packages/ui-styles/src/styles.css';

/** Every `fe-boot-caption*` class name, wherever it appears. */
const CAPTION_CLASS_PATTERN = /fe-boot-caption[\w-]*/gu;

/**
 * A class attribute holding at least one caption class, in any of the five idioms the repo writes.
 *
 * @remarks
 * `class="…"` covers Svelte, Vue and Angular templates; `className="…"` covers JSX; `className: '…'`
 * covers vanilla's `el()` option bag. Matching the ATTRIBUTE rather than the bare token is what makes
 * the modifier case below precise — it can ask what else is in the same class list, which a token
 * scan cannot, and it steps over the prose in these files' own docblocks.
 */
const CAPTION_ATTRIBUTE_PATTERN =
	/class(?:Name)?\s*[=:]\s*["'`]([^"'`]*fe-boot-caption[\w-]*[^"'`]*)["'`]/gu;

/** The two variants. A site carrying neither is the bug this pair exists to name. */
const CAPTION_VARIANTS = ['fe-boot-caption--hero', 'fe-boot-caption--inline'] as const;

/**
 * Every caption class `ui-styles` declares.
 *
 * @returns The declared class names.
 */
function declaredCaptionClasses(): Set<string> {
	const css = readFileSync(resolve(REPO_ROOT, CAPTION_STYLESHEET), 'utf8');

	// Declarations only — a selector is a `.` followed by the name. The file's own comments mention
	// these names in prose, so anchoring on the dot is what separates the rule from the explanation.
	return new Set([...css.matchAll(/\.(fe-boot-caption[\w-]*)/gu)].map(([, name]) => name ?? ''));
}

/**
 * Every class list, per file, that renders a caption class.
 *
 * @returns Repo-relative path → the class lists found in it.
 */
function captionClassListsByFile(): Map<string, string[]> {
	const found = new Map<string, string[]>();

	for (const path of packageSources().flatMap(sourceFiles)) {
		if (/\.(?:test|spec)\./u.test(path)) {
			continue;
		}

		const lists = [...readFileSync(path, 'utf8').matchAll(CAPTION_ATTRIBUTE_PATTERN)].map(
			([, list]) => list ?? '',
		);

		if (lists.length > 0) {
			found.set(relative(REPO_ROOT, path), lists);
		}
	}

	return found;
}

/**
 * Every file rendering a caption class.
 *
 * @remarks
 * Fourteen files for thirteen captions: `examples-vanilla/src/brand/indicators.ts` builds the value
 * span for both of that app's captions, because the framework verticals emit theirs inline in the
 * same template and vanilla has no template to emit it in.
 *
 * A roster rather than a count, for the reason `brandAssets.test.ts` gives: a count tells you
 * something changed, a roster tells you what. Removing a site fails here — the direction in which a caption
 * quietly stops being styled like the others — and
 * adding a fifteenth requires saying so, which is the conscious decision this file exists to force.
 */
const CAPTION_RENDER_SITES = [
	'packages/examples-angular/src/app/pages/wine-page.component.ts',
	'packages/examples-react-plain/src/routes/DatasetRoute.tsx',
	'packages/examples-react-rtk/src/routes/DatasetRoute.tsx',
	'packages/examples-sveltekit/src/lib/wine/WineBootScreen.svelte',
	'packages/examples-sveltekit/src/routes/books/+page.svelte',
	'packages/examples-sveltekit/src/routes/real-estate/+page.svelte',
	'packages/examples-vanilla/src/brand/indicators.ts',
	'packages/examples-vanilla/src/pages/booksPage.ts',
	'packages/examples-vanilla/src/pages/booksRawPage.ts',
	'packages/examples-vanilla/src/pages/realEstatePage.ts',
	'packages/examples-vanilla/src/wine/bootScreen.ts',
	'packages/examples-vue/src/pages/BooksPage.vue',
	'packages/examples-vue/src/pages/RealEstatePage.vue',
	'packages/examples-vue/src/pages/WinePage.vue',
] as const;

describe('the boot caption element', () => {
	it('is declared in ui-styles and nowhere else', () => {
		// The `.fe-boot-progress` failure, generalized to the whole family. A vertical redeclaring one of
		// these in a scoped block would produce a rule that is inert until the shared one changes, and a
		// vertical declaring one the shared sheet lacks produces the opposite: markup that styles
		// nothing. Both are invisible from inside the file that does it.
		const offenders = packageSources()
			.flatMap(sourceFiles)
			.map((path) => relative(REPO_ROOT, path))
			.filter((path) => {
				const text = readFileSync(resolve(REPO_ROOT, path), 'utf8');

				return /\.fe-boot-caption[\w-]*\s*\{/u.test(text);
			});

		expect(offenders, `declare caption classes in ${CAPTION_STYLESHEET}, not per vertical`).toEqual([]);
	});

	it('declares both variants, so the cases below are not vacuous', () => {
		const declared = declaredCaptionClasses();

		expect([...declared].sort()).toEqual(
			['fe-boot-caption', ...CAPTION_VARIANTS, 'fe-boot-caption__value'].sort(),
		);
	});

	it('renders only classes that are declared', () => {
		// A typo in a modifier is markup that silently loses its type treatment,
		// the same shape as a header pointing at `/favicon.svg` instead of the mark: the wrong string in
		// an attribute, invisible to every gate that does not compare it against a definition.
		const declared = declaredCaptionClasses();
		const used = new Set(
			[...captionClassListsByFile().values()]
				.flat()
				.flatMap((list) => [...list.matchAll(CAPTION_CLASS_PATTERN)].map(([name]) => name)),
		);

		expect([...used].filter((name) => !declared.has(name)).sort()).toEqual([]);
	});

	it('carries exactly one variant modifier at every render site', () => {
		// `.fe-boot-caption` alone is the shared half — mono and gray, with no size, tracking or padding.
		// A site carrying only the block looks nearly right, which is worse than looking wrong.
		const offenders: string[] = [];

		for (const [path, lists] of captionClassListsByFile()) {
			for (const list of lists) {
				const classes = list.split(/\s+/u).filter((name) => name.length > 0);

				// The value span is an element of the block, not an instance of it, so it is exempt: it
				// carries `__value` alone and lives inside a caption that carries the modifier.
				if (classes.includes('fe-boot-caption__value') && !classes.includes('fe-boot-caption')) {
					continue;
				}

				if (CAPTION_VARIANTS.filter((variant) => classes.includes(variant)).length !== 1) {
					offenders.push(`${path}: ${list}`);
				}
			}
		}

		expect(offenders, 'add fe-boot-caption--hero or fe-boot-caption--inline').toEqual([]);
	});

	it('is rendered by the roster of sites it was measured to be rendered by', () => {
		expect([...captionClassListsByFile().keys()].sort()).toEqual([...CAPTION_RENDER_SITES].sort());
	});

	it('is rendered by every one of the six verticals', () => {
		// Not a restatement of the roster, and the difference is the whole point: the roster is a list
		// somebody EDITS. Delete a vertical's three sites and update the roster to match and that case
		// goes green, because it only ever asked whether the list and the disk agree. This one asks
		// whether all six verticals still render the shared caption at all — a question no per-file
		// check can ask.
		const packages = new Set([...captionClassListsByFile().keys()].map((path) => path.split('/')[1] ?? ''));

		expect([...packages].sort()).toEqual([
			'examples-angular',
			'examples-react-plain',
			'examples-react-rtk',
			'examples-sveltekit',
			'examples-vanilla',
			'examples-vue',
		]);
	});
});

describe('the boot caption', () => {
	it('is worded in one module and nowhere else', () => {
		// THE guard. A screen that spells the caption itself is a screen that can disagree with the
		// others, and the disagreement is invisible until somebody compares them by hand.
		const offenders = filesWordingTheCaption(false).filter((path) => !path.startsWith(CAPTION_SOURCE));

		expect(
			offenders,
			`render the caption via bootCaptionParts from ${CAPTION_SOURCE} — do not word it again here`,
		).toEqual([]);
	});

	it('is actually worded in that module', () => {
		// The vacuity guard. Rename the phrases and the case above passes over an empty list, which is
		// indistinguishable from a repo that has finally tidied itself up.
		const inSource = filesWordingTheCaption(true).filter((path) => path.startsWith(CAPTION_SOURCE));

		expect(inSource.length, `no file under ${CAPTION_SOURCE} words the caption — did the phrases change?`)
			.toBeGreaterThan(0);
	});

	it('is asserted by the verticals that render it', () => {
		// Not a formality. The wording being shared is worth nothing if no vertical checks what its own
		// screen puts on the page — a caption no spec looks at can be wrong without failing anything.
		// Asserted as "more than one vertical", so a single suite cannot stand in for the rest.
		const verticals = new Set(
			filesWordingTheCaption(true)
				.filter((path) => /\.(?:test|spec)\./u.test(path))
				.map((path) => path.split('/')[1] ?? ''),
		);

		verticals.delete('examples-shared');

		expect([...verticals].sort().length, 'fewer than two verticals assert their own caption').toBeGreaterThan(1);
	});
});
