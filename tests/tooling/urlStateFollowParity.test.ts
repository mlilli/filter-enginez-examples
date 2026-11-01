/**
 * Every app follows `?f=` in place while a route is mounted: the React apps through
 * `<FilterEngineUrlSync>`, the other four through the shared URL follower, wired the same way in each.
 *
 * @remarks
 * ### What the four non-React apps must each do
 *
 * Their URL layers write `?f=` with `history.replaceState` and read it when a route boots. Following
 * Back, Forward and same-route navigations is `examples-shared/url-state-follower`, and it holds only
 * if each app wires all three of its seams; a missing one fails silently, as a route that simply stops
 * following, or as one that reloads its own writes:
 *
 *   1. **The URL layer starts a follower with the route's engine and disposes it** with the route
 *      (`createUrlStateFollower(` and `follower.dispose()` in the module that defines
 *      `startEngineUrlSync`).
 *   2. **Every write reports itself**: each `history.replaceState(` in that module is followed by a
 *      `noteUrlStateWrite(`, so the follower never loads the app's own write back.
 *   3. **The router reports same-route navigations** (`notifyUrlNavigation(` in the module that
 *      handles the app's navigations), since `pushState` fires no event. Back and Forward reach the
 *      follower through `popstate` without it.
 *
 * ### What the React apps must do
 *
 * Mount `<FilterEngineUrlSync>`, which does all of the above for a `react-router` app. Checked by name
 * in each React app's source, so an app that dropped it fails here rather than in a browser.
 *
 * Comments are stripped before matching, so a docblock naming a call neither satisfies nor fails it.
 * The app roster is derived from `packages/` and cross-checked, and every file this reads must exist.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/repoFiles.js';

/** The four apps that bind the URL themselves, and the module of each that handles navigations. */
const FOLLOWER_APPS: Readonly<Record<string, { readonly navigationModule: string; readonly urlStateModule: string }>> = {
	'examples-angular': { navigationModule: 'src/app/app.component.ts', urlStateModule: 'src/app/url/url-state.ts' },
	'examples-sveltekit': { navigationModule: 'src/routes/+layout.svelte', urlStateModule: 'src/lib/url/urlState.ts' },
	'examples-vanilla': { navigationModule: 'src/router.ts', urlStateModule: 'src/url/urlState.ts' },
	'examples-vue': { navigationModule: 'src/router.ts', urlStateModule: 'src/url/urlState.ts' },
};

/** The two apps whose `react-router` binding is `<FilterEngineUrlSync>`. */
const REACT_APPS = ['examples-react-plain', 'examples-react-rtk'] as const;

/**
 * A module's code without its comments.
 *
 * @param source - The module's text.
 * @returns The code. A `//` after a colon or a quote is left alone: it is a URL in a string.
 */
function withoutComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/(?<![:'"`\w])\/\/[^\n]*/gu, '');
}

/**
 * Read one of an app's modules, without comments.
 *
 * @param app - The package directory name.
 * @param path - The module, relative to the package.
 * @returns Its code.
 */
function readModule(app: string, path: string): string {
	const file = resolve(REPO_ROOT, 'packages', app, path);

	expect(existsSync(file), `packages/${app}/${path} is missing; update FOLLOWER_APPS`).toBe(true);

	return withoutComments(readFileSync(file, 'utf8'));
}

/**
 * Every source file under a directory.
 *
 * @param directory - Absolute path.
 * @returns Absolute paths of the `.ts` / `.tsx` files, tests included.
 */
function sourceFiles(directory: string): readonly string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);

		if (statSync(path).isDirectory()) {
			return sourceFiles(path);
		}

		return /\.tsx?$/u.test(name) && !/\.(?:test|spec)\.tsx?$/u.test(name) ? [path] : [];
	});
}

/**
 * How many times `pattern` occurs in `code`.
 *
 * @param code - The code.
 * @param pattern - A global pattern.
 * @returns The count.
 */
function count(code: string, pattern: RegExp): number {
	return [...code.matchAll(pattern)].length;
}

describe('every app follows ?f= in place', () => {
	it('names every demo app: four that follow the URL themselves, two on <FilterEngineUrlSync>', () => {
		const apps = readdirSync(resolve(REPO_ROOT, 'packages')).filter(
			(name) => /^examples-/u.test(name) && existsSync(resolve(REPO_ROOT, 'packages', name, 'src')) && !['examples-docs', 'examples-server', 'examples-shared'].includes(name),
		);

		expect(apps.sort()).toEqual([...Object.keys(FOLLOWER_APPS), ...REACT_APPS].sort());
	});

	describe.each(Object.entries(FOLLOWER_APPS))('%s', (app, { navigationModule, urlStateModule }) => {
		it('starts a URL follower in startEngineUrlSync and disposes it with the route', () => {
			const code = readModule(app, urlStateModule);

			expect(code, `${urlStateModule} no longer defines startEngineUrlSync`).toMatch(/export function startEngineUrlSync\b/u);
			expect(count(code, /\bcreateUrlStateFollower\(/gu), `${urlStateModule} must start exactly one follower`).toBe(1);
			expect(code, `${urlStateModule} must dispose its follower in the teardown`).toMatch(/\bfollower\.dispose\(\)/u);
		});

		it('reports every write it makes to the follower', () => {
			const code = readModule(app, urlStateModule);
			const writes = count(code, /\bhistory\.replaceState\(/gu);

			expect(writes, `${urlStateModule} writes ?f= nowhere; the scan found nothing to check`).toBeGreaterThan(0);
			expect(count(code, /\bnoteUrlStateWrite\(/gu), `${urlStateModule}: every history.replaceState( needs a noteUrlStateWrite( after it`).toBe(writes);
		});

		it('tells the follower about the router’s own same-route navigations', () => {
			expect(readModule(app, navigationModule), `${navigationModule} must call notifyUrlNavigation() after a navigation that keeps the route`).toMatch(
				/\bnotifyUrlNavigation\(\)/u,
			);
		});
	});

	it.each(REACT_APPS)('%s mounts <FilterEngineUrlSync>', (app) => {
		const files = sourceFiles(resolve(REPO_ROOT, 'packages', app, 'src'));

		expect(files.length).toBeGreaterThan(0);
		expect(files.some((file) => /<FilterEngineUrlSync\b/u.test(withoutComments(readFileSync(file, 'utf8'))))).toBe(true);
	});
});
