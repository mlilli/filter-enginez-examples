/**
 * Every wine panel must be able to drive every wine facet.
 *
 * @remarks
 * ### The question this answers, permanently
 *
 * "Is this vertical's wine panel missing filter sections?" Answering it by hand means diffing five
 * panels written in five frameworks. **The question comes up every time a vertical is added or a
 * facet changes, and it should never cost a manual audit.**
 *
 * ### Why rule ids rather than component names
 *
 * The obvious comparison — do the panels render the same components? — cannot work. React's shared
 * panel uses generic section components (`RangeFilterSection`, `ChipFilterSection`), while Svelte,
 * Vue and Angular use wine-specific ones (`WineRangeSection`, `fe-wine-chip-section`). Nothing in
 * the identifiers is comparable across frameworks.
 *
 * What IS comparable is the engine contract underneath: each section exists to drive exactly one
 * flat facet rule, and `WINE_FACET_RULE_IDS` is the canonical list of those. A panel that never
 * mentions `'sweetness'` cannot drive the sweetness facet, whatever its components are called. So
 * the invariant is semantic rather than structural, which is also why it survives a framework the
 * repo has not adopted yet.
 *
 * ### Two guards against passing for the wrong reason
 *
 * **The id list is parsed from `commit.ts`, not duplicated here.** A hardcoded copy would keep
 * passing while the real list grew a new facet — the drift this file exists to catch.
 *
 * **The vertical roster is cross-checked against the filesystem, and every wine-serving vertical
 * must be CLASSIFIED.** A roster that silently covers fewer apps than exist reads as a shorter green
 * suite; `tests/tooling/brandAssets.test.ts` describes the same failure. So a vertical that grows a
 * wine directory has to appear either in {@link PANEL_IMPLEMENTATIONS} or in
 * {@link PANELS_PENDING_SECTIONS} with a reason — adding one and listing it nowhere is the exact
 * move this suite exists to prevent, and it is the move that looks like nothing happened.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { walkRepoFiles } from './support/repoFiles.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COMMIT_SOURCE = readFileSync(
	resolve(REPO_ROOT, 'packages/examples-shared/src/wine/wine-domain/commit.ts'),
	'utf8',
);

/** Source extensions a panel or section can be written in, across the five panel implementations. */
const SOURCE_EXTENSIONS = ['.svelte', '.ts', '.tsx', '.vue'] as const;

/**
 * The wine-panel implementations, and the directories each one's sections live in.
 *
 * @remarks
 * **Five implementations, not six.** The two React apps share `examples-shared/src/wine`, which is
 * asserted below rather than trusted.
 */
const PANEL_IMPLEMENTATIONS: Readonly<Record<string, readonly string[]>> = {
	angular: ['packages/examples-angular/src/app/wine'],
	// NOT the whole of `examples-shared/src/wine` — see CANONICAL_SOURCE_EXCLUSION.
	react: ['packages/examples-shared/src/wine/WineFilterPanel.tsx', 'packages/examples-shared/src/wine/filters'],
	sveltekit: ['packages/examples-sveltekit/src/lib/wine'],
	vanilla: ['packages/examples-vanilla/src/wine'],
	vue: ['packages/examples-vue/src/wine'],
};

/**
 * The directory holding the canonical id list, which no panel scan may include.
 *
 * @remarks
 * **This exclusion is the difference between a real assertion and a tautology.** React's panel
 * lives under `packages/examples-shared/src/wine`, and so does `wine-domain/commit.ts` — the file that
 * DEFINES `WINE_FACET_RULE_IDS`. Scanning the directory wholesale would compare the canonical list
 * against a tree containing the canonical list, so the react case would pass for every id, including
 * a fabricated one that no panel drives. A mutant adding such an id fails every other vertical; only
 * this exclusion makes react fail it too.
 */
const CANONICAL_SOURCE_EXCLUSION = 'wine-domain';

/**
 * Wine-serving verticals whose panel is knowingly incomplete, and why.
 *
 * @remarks
 * **Empty: every wine-serving vertical's panel is complete.** Kept rather than deleted, because the
 * mechanism matters: the guard below demands every wine-serving vertical appear in one
 * list or the other, so a vertical part-way through a port is declared rather than omitted. Leaving
 * it out and saying nothing would quietly defuse a roster guard that exists precisely so a new
 * vertical cannot escape this suite — the failure that looks like nothing happened.
 */
const PANELS_PENDING_SECTIONS: Readonly<Record<string, string>> = {};

/** Example packages that would each need an entry above if they grew a wine panel of their own. */
const VERTICALS_WITH_OWN_WINE_DIRECTORY: Readonly<Record<string, string>> = {
	'examples-angular': 'src/app/wine',
	'examples-react-plain': 'src/wine',
	'examples-react-rtk': 'src/wine',
	'examples-sveltekit': 'src/lib/wine',
	'examples-vanilla': 'src/wine',
	'examples-vue': 'src/wine',
};

/**
 * The canonical facet-rule ids, read out of `commit.ts`.
 *
 * @remarks
 * **Parsed by line SHAPE, not by a naked quoted-string regex.** `/'([^']+)'/g` over the array block
 * would pick up any id quoted in an explanatory comment INSIDE the array — a retired one, say, which
 * no panel references — and fail every vertical over a facet that does not exist. Accepting only
 * lines that are entirely `'id',` makes comments structurally unreachable.
 *
 * @returns Every id in `WINE_FACET_RULE_IDS`, in declaration order
 */
function canonicalFacetRuleIds(): readonly string[] {
	const block = /export const WINE_FACET_RULE_IDS: readonly RuleId\[\] = \[([\s\S]*?)\];/u.exec(
		COMMIT_SOURCE,
	)?.[1] ?? '';

	return block
		.split('\n')
		.map((line) => /^'([^']+)',$/u.exec(line.trim())?.[1])
		.filter((id): id is string => id !== undefined);
}

/**
 * Concatenate every source file under the supplied directories.
 *
 * @remarks
 * Tests and specs are excluded: a spec that happens to name a facet would let a panel that cannot
 * drive it pass, which is the assertion inverting itself.
 *
 * @param directories - Repo-relative directories to walk
 * @returns The concatenated source, and how many files contributed
 */
function readSourceTree(directories: readonly string[]): { fileCount: number; text: string } {
	let text = '';
	let fileCount = 0;

	const readFile = (full: string, name: string): void => {
		if (name.includes('.test.') || name.includes('.spec.')) {
			return;
		}
		if (SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension))) {
			text += readFileSync(full, 'utf8');
			fileCount += 1;
		}
	};

	const walk = (absoluteDir: string): void => {
		for (const name of readdirSync(absoluteDir)) {
			const full = join(absoluteDir, name);

			if (statSync(full).isDirectory()) {
				if (name !== CANONICAL_SOURCE_EXCLUSION) {
					walk(full);
				}
				continue;
			}
			readFile(full, name);
		}
	};

	// Entries may be a directory to walk or a single file, so a panel can be scanned without
	// dragging in siblings that would make the assertion circular.
	for (const entry of directories) {
		const absolute = resolve(REPO_ROOT, entry);

		if (statSync(absolute).isDirectory()) {
			walk(absolute);
		} else {
			readFile(absolute, entry);
		}
	}

	return { fileCount, text };
}

/** Whether a repo-relative path exists and is a directory. */
function isDirectory(relativePath: string): boolean {
	try {
		return statSync(resolve(REPO_ROOT, relativePath)).isDirectory();
	} catch {
		return false;
	}
}

describe('wine facet parity across every panel implementation', () => {
	it('reads the canonical facet list out of commit.ts, comments excluded', () => {
		const ids = canonicalFacetRuleIds();

		// Guards in both directions, because the parser can be wrong in both. TOO FEW: if the regex
		// stopped matching, every assertion below would iterate an empty list and pass — green while
		// checking nothing. TOO MANY: a loose pattern scrapes ids out of explanatory comments inside
		// the array and fails every vertical over a retired id.
		expect(ids.length).toBeGreaterThan(0);
		expect(ids).toContain('sweetness');
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).not.toContain('points-min');
	});

	it.each(Object.keys(PANEL_IMPLEMENTATIONS))(
		'the %s panel can drive every canonical facet',
		(vertical) => {
			const directories = PANEL_IMPLEMENTATIONS[vertical] ?? [];
			const { fileCount, text } = readSourceTree(directories);

			// If a directory moved, the walk would find nothing and every `toContain` would fail on
			// an empty string — noisy but not silent. This makes the cause legible instead.
			expect(fileCount).toBeGreaterThan(0);

			const missing = canonicalFacetRuleIds().filter(
				(id) => !text.includes(`'${id}'`) && !text.includes(`"${id}"`),
			);

			expect(missing, `${vertical} never references these facet rule ids`).toEqual([]);
		},
	);

	it('lists every vertical that has a wine directory of its own', () => {
		// The roster guard. A roster that can quietly cover fewer verticals than exist is the failure
		// `brandAssets.test.ts` describes, so this asserts the filesystem rather than trusting the map.
		const withWine = Object.entries(VERTICALS_WITH_OWN_WINE_DIRECTORY)
			.filter(([pkg, dir]) => isDirectory(`packages/${pkg}/${dir}`))
			.map(([pkg]) => pkg);

		expect(withWine).toEqual([
			'examples-angular',
			'examples-react-plain',
			'examples-react-rtk',
			'examples-sveltekit',
			'examples-vanilla',
			'examples-vue',
		]);
	});

	it('classifies every wine-serving vertical as either covered or explicitly pending', () => {
		// **The half that keeps the roster guard from being defused.** Adding a wine directory and
		// simply not listing the panel would leave this suite green while covering one fewer vertical
		// — which is the exact shape of the failure it exists to prevent. So every vertical that
		// serves wine must appear in PANEL_IMPLEMENTATIONS or in PANELS_PENDING_SECTIONS, and the
		// pending entry has to carry a reason someone can act on.
		const covered = new Set(
			Object.keys(PANEL_IMPLEMENTATIONS).flatMap((vertical) =>
				vertical === 'react' ? ['examples-react-plain', 'examples-react-rtk'] : [`examples-${vertical}`],
			),
		);
		const unclassified = Object.entries(VERTICALS_WITH_OWN_WINE_DIRECTORY)
			.filter(([pkg, dir]) => isDirectory(`packages/${pkg}/${dir}`))
			.map(([pkg]) => pkg)
			.filter((pkg) => !covered.has(pkg) && !(pkg in PANELS_PENDING_SECTIONS));

		expect(unclassified, 'wine-serving verticals in neither list').toEqual([]);

		for (const [pkg, reason] of Object.entries(PANELS_PENDING_SECTIONS)) {
			expect(reason.length, `${pkg} is pending without a reason`).toBeGreaterThan(20);
		}
	});

	it('declares /wine in the shared vertical registry for every vertical that serves it', () => {
		// A vertical can register a `/wine` route in its router and omit `/wine` from its registry
		// entry, and nothing in the app notices. `compareLinks` filters on this array, and wine is a
		// compare dataset, so that vertical would be silently dropped from a table the tests assert
		// has six entries — and the failure would point at the compare page rather than at a stale
		// registry.
		const registry = readFileSync(
			resolve(REPO_ROOT, 'packages/examples-shared/src/verticals/verticals.ts'),
			'utf8',
		);
		// One panel implementation can serve two verticals, so map to registry ids explicitly.
		const registryIds: Readonly<Record<string, readonly string[]>> = {
			angular: ['angular'],
			react: ['react-plain', 'react-rtk'],
			sveltekit: ['sveltekit'],
			vanilla: ['vanilla'],
			vue: ['vue'],
		};
		const withoutWineRoute = Object.keys(PANEL_IMPLEMENTATIONS)
			.flatMap((vertical) => registryIds[vertical] ?? [vertical])
			.filter((id) => {
				const entry = new RegExp(`id: '${id}',[\\s\\S]*?routes: \\[([^\\]]*)\\]`, 'u').exec(registry);

				return entry === null || !(entry[1] ?? '').includes("'/wine'");
			});

		expect(withoutWineRoute, 'verticals serving /wine but not declaring it').toEqual([]);
	});

	it('keeps the two React apps on the shared panel rather than forking it', () => {
		// Both React apps own a `wine/` directory, but neither holds a panel — `WineApp.tsx` composes
		// the one in `examples-shared`. If a fork ever appears, it needs its own roster entry, and
		// this is the assertion that says so.
		for (const pkg of ['examples-react-rtk', 'examples-react-plain']) {
			const { text } = readSourceTree([`packages/${pkg}/src/wine`]);

			expect(text, `${pkg} appears to have forked the shared wine panel`).not.toContain(
				'WineFilterPanel = ',
			);
		}
	});
});

/** The one module that builds the origin rule every app commits. */
const ORIGIN_RULE_MODULE = 'packages/examples-shared/src/wine/wine-domain/originRule.ts';

/** The one module that builds the `?f=` serializer every app reads and writes links with. */
const LINK_SERIALIZER_MODULE = 'packages/examples-shared/src/url/linkSerializer.ts';

/**
 * An origin rule built by hand: a rule factory or constructor called on the `originId` field.
 *
 * @remarks
 * The shared module names the field through a constant, so this matches nothing there; anywhere else
 * it is an app committing origin on its own terms — the drift that made one selection two different
 * links.
 */
const HAND_BUILT_ORIGIN_RULE = /\b(?:hierarchical|inSetofSets|new\s+HierarchicalRule|new\s+InSetofSetsRule)\s*(?:<[^>]*>)?\(\s*['"]originId['"]/u;

/**
 * Every non-test source file under `packages/`, with its text.
 *
 * @returns Repo-relative paths and contents.
 */
function packageSources(): readonly { readonly path: string; readonly text: string }[] {
	return walkRepoFiles(resolve(REPO_ROOT, 'packages'))
		.filter((path) => SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)))
		.filter((path) => !path.includes('.test.') && !path.includes('.spec.') && !path.includes('/test-support/'))
		.map((path) => ({ path, text: readFileSync(resolve(REPO_ROOT, path), 'utf8') }));
}

describe('one origin rule and one link reader in every app', () => {
	// The comparison page hands one `?f=` to all six apps. An origin selection has to be the same rule,
	// serialized the same way, whichever app made it, and every app has to read a link the same way —
	// `examples-shared/src/url/linkSerializer.test.ts` pins what the shared paths produce; this pins
	// that every app goes through them.
	const sources = packageSources();

	it('reads the packages’ sources, so the cases below are not vacuous', () => {
		expect(sources.length).toBeGreaterThan(100);
		expect(sources.map(({ path }) => path)).toEqual(expect.arrayContaining([ORIGIN_RULE_MODULE, LINK_SERIALIZER_MODULE]));
	});

	it('builds the origin rule only in the shared module', () => {
		const handBuilt = sources.filter(({ text }) => HAND_BUILT_ORIGIN_RULE.test(text)).map(({ path }) => path);

		expect(handBuilt, 'commit origin through commitOriginSelection / writeOriginSelection instead').toEqual([]);
	});

	it.each(Object.keys(PANEL_IMPLEMENTATIONS))('the %s panel commits origin through the shared helper', (vertical) => {
		const { text } = readSourceTree(PANEL_IMPLEMENTATIONS[vertical] ?? []);

		expect(/\b(?:commitOriginSelection|writeOriginSelection)\(/u.test(text), `${vertical} never calls the shared origin commit`).toBe(true);
	});

	it('builds the tagged serializer only in the shared link serializer', () => {
		const direct = sources.filter(({ text }) => text.includes('createTaggedSerializer(')).map(({ path }) => path);

		expect(direct, 'build `?f=` serializers with createLinkSerializer instead').toEqual([LINK_SERIALIZER_MODULE]);
	});

	it.each(Object.keys(VERTICALS_WITH_OWN_WINE_DIRECTORY))('%s reads and writes its links with the shared link serializer', (pkg) => {
		const readers = sources.filter(({ path, text }) => path.startsWith(`packages/${pkg}/`) && text.includes('createLinkSerializer('));

		expect(readers.length, `${pkg} never calls createLinkSerializer`).toBeGreaterThan(0);
	});
});
