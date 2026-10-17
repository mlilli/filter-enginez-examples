/**
 * Every site lets browsers keep its content-hashed build files for a year, and nothing else.
 *
 * @remarks
 * Workers static assets send `Cache-Control: public, max-age=0, must-revalidate` by default, so a
 * returning visitor's browser asks again for every script, stylesheet and font, and gets a `304` for
 * each. A file whose name carries a hash of its content never changes at its URL, so the build output
 * that is hashed can be cached outright (`immutable`), through a `_headers` file in the deploy
 * directory. The rules are copied from each app's static directory, except SvelteKit's, whose
 * Cloudflare adapter writes its own for `/_app/immutable/*`.
 *
 * What would otherwise fail silently, and where:
 *
 * - **A site left on the default,** or given rules for directories its bundler does not write: no
 *   error, just a revalidation per file on every visit.
 * - **A rule that reaches a file without a hash in its name** — a page, the icon set, the manifest, a
 *   corpus file, the mock service worker. Browsers would keep the old one for a year after it changed,
 *   and nothing could take it back. Each rule is matched here against every file the site's static
 *   directory copies into its build, all of which keep their names.
 * - **Hashing switched off** for the files a rule names (Angular's `outputHashing`, a Vite config's
 *   output file names), which would make the same rule a year-long cache of whatever was deployed last.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The one header every rule sets: a year, and no revalidation. */
const IMMUTABLE = 'Cache-Control: public, max-age=31536000, immutable';

/** Where a Vite build writes every hashed file: its default `build.assetsDir`. */
const VITE_RULES = ['/assets/*'] as const;

/**
 * Where Angular's production build writes its hashed files: scripts and stylesheets at the root, named
 * `<kind>-<hash>`, and every file a stylesheet or script imports under `media/`.
 */
const ANGULAR_RULES = ['/main-*.js', '/polyfills-*.js', '/chunk-*', '/styles-*.css', '/worker-*.js', '/media/*'] as const;

/**
 * Paths every site answers with a file that keeps its name, whether or not its static directory holds
 * it: the pages, the files the landing site's build emits from the brand package, the corpus files the
 * deploy job writes, and the font licenses it copies in.
 */
const FIXED_NAME_PATHS = [
	'/',
	'/index.html',
	'/404.html',
	'/how-it-works',
	'/compare',
	'/favicon.ico',
	'/mark.svg',
	'/og-card.png',
	'/site.webmanifest',
	'/sitemap.xml',
	'/api/corpus/wine.json',
	'/licenses/fonts/inter/OFL.txt',
] as const;

/** One project of `angular.json`, as far as this suite reads it: its build target's configurations. */
interface AngularProject {
	/** The project's targets. */
	readonly architect: {
		/** `ng build`, with one set of options per configuration name. */
		readonly build: {
			/** By configuration name; `production` is what the deploy job builds. */
			readonly configurations: Readonly<Record<string, AngularBuildConfiguration>>;
		};
	};
}

/** The one build option this suite reads. */
interface AngularBuildConfiguration {
	/** Which output files carry a content hash in their names: `all`, `media`, `bundles` or `none`. */
	readonly outputHashing?: string;
}

/** The part of `angular.json` this suite reads. */
interface AngularWorkspace {
	/** Each project, by name. */
	readonly projects: Readonly<Record<string, AngularProject>>;
}

/** One `_headers` rule: a URL pattern and the header lines under it. */
interface HeaderRule {
	/** The header lines, trimmed. */
	readonly headers: readonly string[];
	/** The URL pattern. */
	readonly pattern: string;
}

/**
 * Read a repository file as text.
 *
 * @param path - Path relative to the repository root.
 * @returns The contents.
 */
function readRepoFile(path: string): string {
	return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

/**
 * Parse a `_headers` file: a pattern on an unindented line, its headers on the indented lines below.
 *
 * @param text - The file.
 * @returns The rules, in order.
 */
function parseHeaders(text: string): readonly HeaderRule[] {
	const rules: { headers: string[]; pattern: string }[] = [];

	for (const line of text.split('\n')) {
		if (line.trim() === '' || line.trimStart().startsWith('#')) {
			continue;
		}
		if (/^\s/u.test(line)) {
			rules.at(-1)?.headers.push(line.trim());
		} else {
			rules.push({ headers: [], pattern: line.trim() });
		}
	}

	return rules;
}

/**
 * Whether a `_headers` URL pattern matches a path: `*` matches any run of characters, `:name` one path
 * segment, and everything else itself.
 *
 * @param pattern - The pattern.
 * @param path - A request path.
 * @returns `true` on a match.
 */
function matchesPattern(pattern: string, path: string): boolean {
	const source = pattern
		.split(/(\*|:[A-Za-z]\w*)/u)
		.map((part) => {
			if (part === '*') {
				return '.*';
			}

			return part.startsWith(':') ? '[^/]+' : part.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
		})
		.join('');

	return new RegExp(`^${source}$`, 'u').test(path);
}

/**
 * Every file under a directory, as the request paths a build serves them at.
 *
 * @param directory - Absolute path of a static directory.
 * @returns Paths such as `/favicon.ico` and `/api/corpus/wine.json`.
 */
function servedPaths(directory: string): readonly string[] {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => `${entry.parentPath.slice(directory.length)}/${entry.name}`);
}

const TARGETS = listDeployTargets();

describe('hashed build files are cached for a year', () => {
	it('finds every deploy target, so the cases below are not vacuous', () => {
		expect(TARGETS.length).toBeGreaterThanOrEqual(8);
	});

	for (const target of TARGETS) {
		const directory = `packages/${target.packageDirectory}`;
		const isSvelteKit = existsSync(resolve(REPO_ROOT, directory, 'svelte.config.js'));
		const isAngular = existsSync(resolve(REPO_ROOT, directory, 'angular.json'));

		if (isSvelteKit) {
			it(`${target.packageDirectory}: its Cloudflare adapter writes the rule for /_app/immutable/*`, () => {
				// adapter-cloudflare appends `/_app/immutable/*` with `Cache-Control: public, immutable,
				// max-age=31536000` to the deploy directory's `_headers`; the deploy job builds with it.
				expect(readRepoFile(`${directory}/svelte.config.js`)).toContain("await import('@sveltejs/adapter-cloudflare')");
				expect(existsSync(resolve(REPO_ROOT, directory, 'static/_headers')), 'static/_headers would be merged with the adapter’s').toBe(false);
			});

			continue;
		}

		it(`${target.packageDirectory}: public/_headers caches exactly where the build writes hashed files`, () => {
			const rules = parseHeaders(readRepoFile(`${directory}/public/_headers`));

			expect(rules.map((rule) => rule.pattern)).toEqual(isAngular ? [...ANGULAR_RULES] : [...VITE_RULES]);
			for (const rule of rules) {
				expect(rule.headers, rule.pattern).toEqual([IMMUTABLE]);
			}
		});

		it(`${target.packageDirectory}: no rule reaches a file that keeps its name`, () => {
			const rules = parseHeaders(readRepoFile(`${directory}/public/_headers`));
			const fixedNames = [...servedPaths(resolve(REPO_ROOT, directory, 'public')), ...FIXED_NAME_PATHS];

			expect(fixedNames.length).toBeGreaterThan(FIXED_NAME_PATHS.length);
			expect(fixedNames.filter((path) => rules.some((rule) => matchesPattern(rule.pattern, path)))).toEqual([]);
		});

		it(`${target.packageDirectory}: its build names the files those rules reach by their content hash`, () => {
			if (isAngular) {
				const workspace = JSON.parse(readRepoFile(`${directory}/angular.json`)) as AngularWorkspace;
				const projects = Object.values(workspace.projects);

				expect(projects.length).toBeGreaterThan(0);
				for (const project of projects) {
					expect(project.architect.build.configurations['production']?.outputHashing).toBe('all');
				}

				return;
			}
			// Vite hashes every file it writes under `assets/` unless the config renames its output.
			expect(readRepoFile(`${directory}/vite.config.ts`)).not.toMatch(/\b(?:assetsDir|assetFileNames|chunkFileNames|entryFileNames)\b/u);
		});
	}
});

describe('the _headers reading this suite does', () => {
	it('matches the way Workers static assets match, so the cases above can fail', () => {
		expect(matchesPattern('/assets/*', '/assets/Inter-Subset-DlVByD-t.woff2')).toBe(true);
		expect(matchesPattern('/assets/*', '/assets.json')).toBe(false);
		expect(matchesPattern('/chunk-*', '/chunk-ABC123.js')).toBe(true);
		expect(matchesPattern('/main-*.js', '/main.js')).toBe(false);
		expect(matchesPattern('/main-*.js', '/main-ABC123.js')).toBe(true);
		expect(matchesPattern('/media/:file', '/media/a.png')).toBe(true);
		expect(matchesPattern('/media/:file', '/media/a/b.png')).toBe(false);
		expect(matchesPattern('/*', '/favicon.ico')).toBe(true);
	});

	it('reads rules and their headers, skipping comments and blank lines', () => {
		expect(parseHeaders(`# a comment\n/a/*\n  X-One: 1\n\t! X-Two\n\n/b\n  X-Three: 3\n`)).toEqual([
			{ headers: ['X-One: 1', '! X-Two'], pattern: '/a/*' },
			{ headers: ['X-Three: 3'], pattern: '/b' },
		]);
	});
});
