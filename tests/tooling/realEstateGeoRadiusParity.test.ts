/**
 * Every real-estate app commits and reads the distance filter through the one shared rule, and no app
 * commits a rule over a function field.
 *
 * @remarks
 * ### The question this answers, permanently
 *
 * A `?f=` link is how a filter state travels: the address bar holds it, a reload reads it back, and the
 * comparison page hands one link to all six apps. The distance filter therefore has to be one rule with
 * one serialization in every app, and a rule that survives the trip. A `GeoProximityRule` over a
 * function field does not: the field serializes as the placeholder `"<function>"`, so a reloaded or
 * shared link decodes into a rule that matches no listing, while the panel still shows the circle.
 *
 * The shared module `examples-shared/src/real-estate/real-estate-domain/geoRadiusRule.ts` builds the
 * rule over the `coords` field (`buildListingGeoRadiusRule`, `writeGeoRadius`) and reads it back
 * (`deriveGeoRadius`); `examples-shared/src/url/linkSerializer.test.ts` pins the exact `?f=` it produces
 * and that it round-trips. This suite pins, statically, that every panel goes through it, that nothing
 * else in the packages builds a geo rule, and that no rule anywhere is handed a function field.
 *
 * ### Two guards against passing for the wrong reason
 *
 * **Vacuity.** Every scan asserts it read files before asserting anything about them, and each pattern
 * is shown to match the shape it exists to catch.
 *
 * **The roster is cross-checked against the filesystem.** A package that grows a real-estate directory
 * has to appear in {@link PANEL_IMPLEMENTATIONS} or in {@link SHELLS_ON_THE_SHARED_PANEL}.
 *
 * @packageDocumentation
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, walkRepoFiles } from './support/repoFiles.js';

/** Source extensions a panel or section can be written in. */
const SOURCE_EXTENSIONS = ['.svelte', '.ts', '.tsx', '.vue'] as const;

/** The one module that builds the distance rule every app commits. */
const GEO_RADIUS_RULE_MODULE = 'packages/examples-shared/src/real-estate/real-estate-domain/geoRadiusRule.ts';

/** The module that names the distance rule's id and field, and reads it out of a link. */
const GEO_RADIUS_LINKS_MODULE = 'packages/examples-shared/src/real-estate/real-estate-domain/geoRadiusLinks.ts';

/** The one module that builds the `?f=` serializer every app reads and writes links with. */
const LINK_SERIALIZER_MODULE = 'packages/examples-shared/src/url/linkSerializer.ts';

/**
 * Sources whose rule calls are documentation text, not rule construction.
 *
 * @remarks
 * The docs site's API reference and rule catalog hold signatures and examples as string data
 * (`geo(field, …)`, `geo('coords', …)`), which the patterns below would read as calls. Nothing there
 * reaches an engine.
 */
const DOCUMENTATION_DATA_DIRECTORY = 'packages/examples-shared/src/docs/content/';

/**
 * The real-estate panel implementations, and the sources each one's distance section lives in.
 *
 * @remarks
 * **Five implementations, not six**: the two React apps render the shared React panel, which
 * {@link SHELLS_ON_THE_SHARED_PANEL} asserts rather than trusts.
 */
const PANEL_IMPLEMENTATIONS: Readonly<Record<string, readonly string[]>> = {
	angular: ['packages/examples-angular/src/app/real-estate'],
	react: ['packages/examples-shared/src/real-estate/GeoRadiusSection.tsx'],
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

/** A geo rule built by hand: the factory or the constructor, called anywhere. */
const HAND_BUILT_GEO_RULE = /\b(?:geo\s*(?:<[^>]*>)?\(|new\s+GeoProximityRule\s*\()/u;

/**
 * The engine's rule factories, and any rule constructor, handed a function as their field: an arrow
 * function, a `function` expression, or a named extractor (`extractSomething`).
 *
 * @remarks
 * A function field serializes as `"<function>"`, so a rule built this way cannot survive a `?f=` link.
 */
const FUNCTION_FIELD_RULE = new RegExp(
	String.raw`(?:\b(?:bloomMembership|bool|dateRange|exists|fuzzy|geo|hierarchical|inSet|inSetofSets|numCompare|range|regex|text|value)`
	+ String.raw`|\bnew\s+[A-Z]\w*Rule)\s*(?:<[^>]*>)?\(\s*(?:\([^()]*\)\s*(?::\s*[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>|function\b|extract[A-Z]\w*)`,
	'u',
);

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

/**
 * Whether a repo-relative path exists and is a directory.
 *
 * @param relativePath - The path.
 * @returns `true` for a directory.
 */
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

describe('one distance rule in every real-estate app', () => {
	const sources = packageSources();
	const ruleBuildingSources = sources.filter(({ path }) => !path.startsWith(DOCUMENTATION_DATA_DIRECTORY));

	it('reads the packages’ sources, so the cases below are not vacuous', () => {
		expect(sources.length).toBeGreaterThan(100);
		expect(sources.map(({ path }) => path)).toEqual(expect.arrayContaining([GEO_RADIUS_RULE_MODULE, GEO_RADIUS_LINKS_MODULE, LINK_SERIALIZER_MODULE]));
		expect(sources.some(({ path }) => path.startsWith(DOCUMENTATION_DATA_DIRECTORY))).toBe(true);
	});

	it('builds the geo rule only in the shared module', () => {
		const builders = ruleBuildingSources.filter(({ text }) => HAND_BUILT_GEO_RULE.test(text)).map(({ path }) => path);

		expect(builders, 'commit the distance filter through buildListingGeoRadiusRule / writeGeoRadius instead').toEqual([GEO_RADIUS_RULE_MODULE]);
	});

	it('builds that rule over the coords string field', () => {
		const ruleModule = readFileSync(resolve(REPO_ROOT, GEO_RADIUS_RULE_MODULE), 'utf8');
		const linksModule = readFileSync(resolve(REPO_ROOT, GEO_RADIUS_LINKS_MODULE), 'utf8');

		expect(ruleModule).toMatch(/\bgeo\(GEO_RADIUS_FIELD,/u);
		expect(linksModule).toMatch(/export const GEO_RADIUS_FIELD = 'coords';/u);
	});

	it('hands no rule a function field, in any dataset', () => {
		// The pattern catches each shape it exists for, so a clean result below is a real one.
		for (const shape of [
			'geo(extractListingCoords, { center, radiusKm })',
			'range((item) => item.price, { max, min })',
			'inSet<string>(listing => listing.state, values)',
			'new HierarchicalRule((item: unknown): string => String(item), config)',
			'text(function (item) { return item.description; }, config)',
		]) {
			expect(FUNCTION_FIELD_RULE.test(shape), shape).toBe(true);
		}
		expect(FUNCTION_FIELD_RULE.test("range('priceUsd', { max, min })")).toBe(false);

		const offenders = ruleBuildingSources.filter(({ text }) => FUNCTION_FIELD_RULE.test(text)).map(({ path }) => path);

		expect(offenders, 'name the field by string: a function field serializes as "<function>" and matches nothing once a link is loaded').toEqual([]);
	});

	it('reads links through the shared distance-rule reader', () => {
		const serializer = readFileSync(resolve(REPO_ROOT, LINK_SERIALIZER_MODULE), 'utf8');

		expect(serializer, 'createLinkSerializer must decode through withNormalizedGeoRadiusRule').toMatch(/\bwithNormalizedGeoRadiusRule\(/u);
	});

	it.each(Object.keys(PANEL_IMPLEMENTATIONS))('the %s panel commits the distance filter through the shared rule', (vertical) => {
		const { fileCount, text } = readSources(PANEL_IMPLEMENTATIONS[vertical] ?? []);

		expect(fileCount).toBeGreaterThan(0);
		expect(/\b(?:buildListingGeoRadiusRule|writeGeoRadius)\(/u.test(text), `${vertical} never calls the shared distance commit`).toBe(true);
	});

	it.each(Object.keys(PANEL_IMPLEMENTATIONS))('the %s panel derives its checkbox, center and radius from the committed rule', (vertical) => {
		const { text } = readSources(PANEL_IMPLEMENTATIONS[vertical] ?? []);

		expect(/\bderiveGeoRadius\(/u.test(text), `${vertical} never calls deriveGeoRadius`).toBe(true);
		expect(text, `${vertical} reads the rule's config by casting it`).not.toMatch(/as\s+GeoProximityRule\b/u);
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
		const packagesWithAny = readdirSync(resolve(REPO_ROOT, 'packages'))
			.filter((pkg) => sources.some(({ path }) => path.startsWith(`packages/${pkg}/`) && path.includes('/real-estate/')));

		expect(packagesWithAny.filter((pkg) => pkg !== 'examples-shared' && !(pkg in REAL_ESTATE_DIRECTORIES))).toEqual([]);
	});

	it.each(SHELLS_ON_THE_SHARED_PANEL)('%s renders the shared panel rather than a distance section of its own', (pkg) => {
		const { fileCount, text } = readSources([`packages/${pkg}/${REAL_ESTATE_DIRECTORIES[pkg] ?? ''}`]);

		expect(fileCount).toBeGreaterThan(0);
		expect(text, `${pkg} appears to have forked the distance section`).not.toMatch(/\b(?:GeoRadiusSection|LeafletRadiusMap)\s*=/u);
	});
});
