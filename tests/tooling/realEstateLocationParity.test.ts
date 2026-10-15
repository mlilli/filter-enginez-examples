/**
 * Every real-estate app commits and reads the location selection through the one shared rule.
 *
 * @remarks
 * ### The question this answers, permanently
 *
 * A `?f=` link is how a filter state travels: the address bar holds it, a reload reads it back, and the
 * comparison page hands one link to all six apps. A location selection therefore has to be one rule
 * with one serialization in every app, and it has to be a rule that survives the trip. The location
 * rule each panel once built for itself, a `HierarchicalRule` over a function extractor, did neither:
 * a function field serializes as the placeholder `"<function>"`, so a reloaded or shared link decoded
 * into a rule that tested nothing and passed no listing, while the tree still showed the state checked.
 *
 * The shared module `examples-shared/src/real-estate/real-estate-domain/locationRule.ts` builds the
 * rule (`buildListingLocationRule`, `writeLocationSelection`) and reads it back
 * (`deriveLocationSelection`); `examples-shared/src/url/linkSerializer.test.ts` pins the exact `?f=` it
 * produces and that it round-trips. This suite pins that every panel goes through it, statically, so a
 * panel cannot drift back to a rule of its own.
 *
 * ### Two guards against passing for the wrong reason
 *
 * **Vacuity.** Every scan asserts it read files before asserting anything about them.
 *
 * **The roster is cross-checked against the filesystem.** A package that grows a real-estate directory
 * has to appear in {@link PANEL_IMPLEMENTATIONS} or in {@link SHELLS_ON_THE_SHARED_PANEL}; adding one
 * and listing it nowhere is the move that looks like nothing happened, and this suite fails on it.
 *
 * @packageDocumentation
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, walkRepoFiles } from './support/repoFiles.js';

/** Source extensions a panel or section can be written in. */
const SOURCE_EXTENSIONS = ['.svelte', '.ts', '.tsx', '.vue'] as const;

/** The one module that builds the location rule every app commits. */
const LOCATION_RULE_MODULE = 'packages/examples-shared/src/real-estate/real-estate-domain/locationRule.ts';

/**
 * The real-estate panel implementations, and the sources each one's location section lives in.
 *
 * @remarks
 * **Five implementations, not six**: the two React apps render the shared React panel, which
 * {@link SHELLS_ON_THE_SHARED_PANEL} asserts rather than trusts.
 */
const PANEL_IMPLEMENTATIONS: Readonly<Record<string, readonly string[]>> = {
	angular: ['packages/examples-angular/src/app/real-estate'],
	react: ['packages/examples-shared/src/real-estate/LocationSection.tsx'],
	sveltekit: ['packages/examples-sveltekit/src/lib/real-estate'],
	vanilla: ['packages/examples-vanilla/src/real-estate'],
	vue: ['packages/examples-vue/src/real-estate'],
};

/** Packages whose real-estate directory holds an app shell over the shared React panel, not a panel. */
const SHELLS_ON_THE_SHARED_PANEL: readonly string[] = ['examples-react-plain', 'examples-react-rtk'];

/** Where each package keeps its real-estate sources, for the roster check. */
const REAL_ESTATE_DIRECTORIES: Readonly<Record<string, string>> = {
	'examples-angular': 'src/app/real-estate',
	'examples-react-plain': 'src/real-estate',
	'examples-react-rtk': 'src/real-estate',
	'examples-sveltekit': 'src/lib/real-estate',
	'examples-vanilla': 'src/real-estate',
	'examples-vue': 'src/real-estate',
};

/**
 * A location rule built by hand: the tree rule in any form, or a set rule named on `locationId`.
 *
 * @remarks
 * The shared module names the field through a constant, so this matches nothing there.
 */
const HAND_BUILT_LOCATION_RULE = /\b(?:hierarchical\s*\(|new\s+HierarchicalRule\s*\(|(?:inSetofSets|new\s+InSetofSetsRule)\s*(?:<[^>]*>)?\(\s*['"]locationId['"])/u;

/**
 * Concatenate every non-test source file under the supplied directories or files.
 *
 * @param entries - Repo-relative directories to walk, or single files.
 * @returns The concatenated source, and how many files contributed.
 */
function readSources(entries: readonly string[]): { readonly fileCount: number; readonly text: string } {
	let text = '';
	let fileCount = 0;

	const readFile = (full: string): void => {
		if (full.includes('.test.') || full.includes('.spec.')) {
			return;
		}
		if (SOURCE_EXTENSIONS.some((extension) => full.endsWith(extension))) {
			text += readFileSync(full, 'utf8');
			fileCount += 1;
		}
	};

	const walk = (directory: string): void => {
		for (const name of readdirSync(directory)) {
			const full = join(directory, name);

			if (statSync(full).isDirectory()) {
				walk(full);
			} else {
				readFile(full);
			}
		}
	};

	for (const entry of entries) {
		const absolute = resolve(REPO_ROOT, entry);

		if (statSync(absolute).isDirectory()) {
			walk(absolute);
		} else {
			readFile(absolute);
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

describe('one location rule in every real-estate app', () => {
	const sources = packageSources();

	it('reads the packages’ sources, so the cases below are not vacuous', () => {
		expect(sources.length).toBeGreaterThan(100);
		expect(sources.map(({ path }) => path)).toContain(LOCATION_RULE_MODULE);
	});

	it('builds no location rule outside the shared module', () => {
		const realEstateSources = sources.filter(({ path }) => path.includes('/real-estate'));
		const handBuilt = realEstateSources.filter(({ text }) => HAND_BUILT_LOCATION_RULE.test(text)).map(({ path }) => path);

		expect(realEstateSources.length).toBeGreaterThan(20);
		expect(handBuilt, 'commit location through buildListingLocationRule / writeLocationSelection instead').toEqual([]);
	});

	it.each(Object.keys(PANEL_IMPLEMENTATIONS))('the %s panel commits location through the shared rule', (vertical) => {
		const { fileCount, text } = readSources(PANEL_IMPLEMENTATIONS[vertical] ?? []);

		expect(fileCount).toBeGreaterThan(0);
		expect(/\b(?:buildListingLocationRule|writeLocationSelection)\(/u.test(text), `${vertical} never calls the shared location commit`).toBe(true);
	});

	it.each(Object.keys(PANEL_IMPLEMENTATIONS))('the %s panel reads its selection back out of the committed sets', (vertical) => {
		const { text } = readSources(PANEL_IMPLEMENTATIONS[vertical] ?? []);

		expect(/\bderiveLocationSelection\(/u.test(text), `${vertical} never calls deriveLocationSelection`).toBe(true);
		expect(text, `${vertical} reads a tree rule's selection`).not.toMatch(/HierarchicalRule/u);
	});

	it('classifies every package that has a real-estate directory', () => {
		const withRealEstate = Object.entries(REAL_ESTATE_DIRECTORIES)
			.filter(([pkg, directory]) => isDirectory(`packages/${pkg}/${directory}`))
			.map(([pkg]) => pkg);
		const covered = new Set([
			...SHELLS_ON_THE_SHARED_PANEL,
			...Object.values(PANEL_IMPLEMENTATIONS).flat().map((entry) => entry.split('/')[1] ?? ''),
		]);

		expect(withRealEstate).toEqual(Object.keys(REAL_ESTATE_DIRECTORIES));
		expect(withRealEstate.filter((pkg) => !covered.has(pkg)), 'real-estate packages in neither list').toEqual([]);
		// And the filesystem holds no real-estate directory the map above does not know about.
		const packagesWithAny = readdirSync(resolve(REPO_ROOT, 'packages'))
			.filter((pkg) => sources.some(({ path }) => path.startsWith(`packages/${pkg}/`) && path.includes('/real-estate/')));

		expect(packagesWithAny.filter((pkg) => pkg !== 'examples-shared' && !(pkg in REAL_ESTATE_DIRECTORIES))).toEqual([]);
	});

	it.each(SHELLS_ON_THE_SHARED_PANEL)('%s renders the shared panel rather than a location section of its own', (pkg) => {
		const { fileCount, text } = readSources([`packages/${pkg}/${REAL_ESTATE_DIRECTORIES[pkg] ?? ''}`]);

		expect(fileCount).toBeGreaterThan(0);
		expect(text, `${pkg} appears to have forked the location section`).not.toMatch(/HierarchicalPicker|LocationSection\s*=/u);
	});
});
