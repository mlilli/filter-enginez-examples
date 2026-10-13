/**
 * The dev-server port map, asserted against the configs that actually declare it.
 *
 * @remarks
 * Two apps on the same port with `strictPort: true` cannot run together: the second to start dies
 * outright, and nothing shows it until somebody runs both at once. That is the shape of bug this file
 * exists to catch: not a wrong value, but two configs quietly agreeing on the same one.
 *
 * The ports are parsed out of each app's real config rather than restated here. A hardcoded list
 * would pass while the apps drifted underneath it, which is precisely the failure being guarded.
 *
 * `strictPort` matters as much as the number: without it Vite silently takes the next free port, so
 * a collision becomes an app running somewhere the e2e config is not looking — a timeout rather than
 * an error.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { e2ePortsFromConfig } from '../../scripts/e2e-ports.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Vite-based dev servers: package directory → the port it must hold.
 *
 * @remarks
 * The five Vite verticals, plus the landing site: every app's landing page links to the site's
 * how-it-works page in development, so its port is a cross-app origin exactly like a vertical's, and
 * is held to the same assertions.
 */
const VITE_PORTS: Readonly<Record<string, number>> = {
	'examples-react-plain': 5176,
	'examples-react-rtk': 5174,
	'examples-sveltekit': 5175,
	'examples-vanilla': 5179,
	'examples-vue': 5178,
	site: 5181,
};

/** Angular declares its port in `angular.json` rather than a Vite config. */
const ANGULAR_PORT = 4200;

/** The Node filter API. */
const API_PORT = 8787;

/**
 * The standalone docs site.
 *
 * @remarks
 * Not in `VITE_PORTS` above: that map drives the per-app `port:` / `strictPort` assertions, and the
 * docs app is declared separately here so the preflight assertions below still see the full set.
 */
const DOCS_PORT = 5180;

/**
 * Read a package's Vite config.
 *
 * @param pkg - The package directory name.
 * @returns The file contents.
 */
function viteConfig(pkg: string): string {
	return readFileSync(resolve(REPO_ROOT, 'packages', pkg, 'vite.config.ts'), 'utf8');
}

describe('dev-server ports', () => {
	it.each(Object.entries(VITE_PORTS))('%s declares port %i', (pkg, port) => {
		// Anchored to a DECLARATION line, not a substring. These configs discuss their own ports in
		// prose, and a `toContain` match happily reads the comment — change the real value and such a
		// test still passes, because the sentence explaining the choice contains the string it is
		// looking for.
		expect(viteConfig(pkg)).toMatch(new RegExp(`^\\s*port: ${port},$`, 'mu'));
	});

	it.each(Object.keys(VITE_PORTS))('%s pins strictPort', (pkg) => {
		// Without it a collision silently relocates the app instead of failing, so the e2e config
		// waits on an origin nothing is serving and every spec times out with no cause on screen.
		//
		// Anchored for the same reason as the port assertion above: one of these configs mentions
		// `strictPort: true` inside an explanatory comment.
		expect(viteConfig(pkg)).toMatch(/^\s*strictPort: true,$/mu);
	});

	it('assigns every vertical a DISTINCT port', () => {
		// The collision check. Two apps declaring the same port each pass their own assertion above;
		// only a comparison across all of them fails.
		const ports = [...Object.values(VITE_PORTS), ANGULAR_PORT, API_PORT];

		expect(new Set(ports).size).toBe(ports.length);
	});

	it('keeps Angular on its angular.json port', () => {
		const angularJson = readFileSync(resolve(REPO_ROOT, 'packages/examples-angular/angular.json'), 'utf8');

		expect(angularJson).toContain(`"port": ${ANGULAR_PORT}`);
	});

	it('matches what the Playwright config waits on', () => {
		// The two halves that must agree: an app can hold a port perfectly and still fail the suite if
		// Playwright is watching a different one. Parsed from the config so a renamed constant does not
		// slip through.
		const playwright = readFileSync(resolve(REPO_ROOT, 'playwright.config.ts'), 'utf8');
		const declared = [...playwright.matchAll(/http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/gu)]
			.map(([, port]) => Number(port));

		for (const port of [...Object.values(VITE_PORTS), ANGULAR_PORT, API_PORT]) {
			expect(declared, `Playwright never references port ${port}`).toContain(port);
		}
	});

	it('has the e2e preflight probing every one of them', () => {
		// `scripts/check-e2e-ports.mjs` refuses to start the suite while a dev server holds a port,
		// and it PARSES them out of the Playwright config rather than restating them — same reason
		// this file parses rather than hardcodes. Parsing has its own failure mode though: the regex
		// quietly finds fewer ports if a `webServer` url is ever written in a shape it does not match
		// (a template string, an `http://[::1]` host, a port from an env var). The preflight would
		// then wave through the very server it exists to catch, silently. Asserting the parse against
		// the map above is what makes that loud.
		expect(e2ePortsFromConfig()).toEqual(
			[...Object.values(VITE_PORTS), ANGULAR_PORT, API_PORT, DOCS_PORT].sort((a, b) => a - b),
		);
	});

	it('keeps the preflight CLI un-imported, because it exits', () => {
		// `check-e2e-ports.mjs` probes sockets and calls `process.exit(1)` at top level — correct for a
		// CLI, fatal for an import. Importing it here would run the whole check inside Vitest and kill
		// the run with "process.exit unexpectedly called with 1" on any machine that has a dev server up,
		// and pass only where the thing being guarded against is absent, which is the worst way for a
		// test to pass. The pure half lives in `e2e-ports.mjs`; this keeps it there.
		const importers = [
			'tests/tooling/devServerPorts.test.ts',
			'scripts/e2e-ports.mjs',
			'playwright.config.ts',
			'package.json',
		].filter((file) => /from '.*check-e2e-ports\.mjs'|import\(.*check-e2e-ports\.mjs/u.test(
			readFileSync(resolve(REPO_ROOT, file), 'utf8'),
		));

		expect(importers, 'check-e2e-ports.mjs must be RUN, never imported').toEqual([]);
	});

	it('matches the origins the apps put in their own headers', () => {
		// A THIRD copy of the port map exists, deliberately: `examples-shared/verticals` is what a
		// header reads to print `Books · Angular`, and what `/compare` reads to link across the six —
		// and its `SITE` entry is what every landing page's "How the engine works" link resolves to.
		// Data duplicated on purpose has to be pinned, or the comparison page links to a port nothing
		// serves — in a page whose entire point is showing that the six agree.
		//
		// Read as TEXT, not imported: this project is repo-root and resolves no workspace packages, and
		// widening it to import one would break the boundary the project exists to hold.
		const registry = readFileSync(
			resolve(REPO_ROOT, 'packages/examples-shared/src/verticals/verticals.ts'),
			'utf8',
		);
		const declared = [...registry.matchAll(/devOrigin: 'http:\/\/127\.0\.0\.1:(\d{2,5})'/gu)]
			.map(([, port]) => Number(port))
			.sort((a, b) => a - b);

		expect(declared).toEqual(
			[...Object.values(VITE_PORTS), ANGULAR_PORT].sort((a, b) => a - b),
		);
	});

	it('keeps every tests/e2e origin helper on its own vertical’s port', () => {
		// A FOURTH copy. Each `tests/e2e/<name>Base.ts` hardcodes an origin that every spec for that
		// vertical navigates to, and nothing else compares it with anything.
		//
		// **Cross-checked against the REGISTRY rather than against a list written here.** The
		// `devOrigin` fields are already pinned to the canonical map by the assertion above, so
		// hanging this off them adds a guard without adding a copy — and it catches the failure a
		// membership test cannot: a base file holding a REAL port belonging to a DIFFERENT vertical.
		// That one is silent in the worst way, because the app answers. Every spec then drives the
		// wrong app and fails on a subtitle assertion naming a stack nobody was testing.
		//
		// The file-name → registry-id map is the one thing declared here, and it exists because the
		// two genuinely differ in one place: `svelteBase.ts` serves the vertical whose id is
		// `sveltekit`. That mismatch is the same trap `wineFlow.ts` types `VerticalId` to catch.
		const BASE_FILE_VERTICAL_IDS: Readonly<Record<string, string>> = {
			angularBase: 'angular',
			reactPlainBase: 'react-plain',
			svelteBase: 'sveltekit',
			vanillaBase: 'vanilla',
			vueBase: 'vue',
		};
		const registry = readFileSync(
			resolve(REPO_ROOT, 'packages/examples-shared/src/verticals/verticals.ts'),
			'utf8',
		);
		const mismatches: string[] = [];

		for (const [baseFile, verticalId] of Object.entries(BASE_FILE_VERTICAL_IDS)) {
			const helper = readFileSync(resolve(REPO_ROOT, 'tests/e2e', `${baseFile}.ts`), 'utf8');
			const declared = helper.match(/'http:\/\/127\.0\.0\.1:(\d{2,5})'/u)?.[1];
			// The registry entry is `id: '<verticalId>'` followed within the same object by its
			// `devOrigin`; `[^}]*?` keeps the search inside that one descriptor.
			const canonical = registry
				.match(new RegExp(`id: '${verticalId}',[^}]*?devOrigin: 'http://127\\.0\\.0\\.1:(\\d{2,5})'`, 'u'))?.[1]
				?? registry
					.match(new RegExp(`devOrigin: 'http://127\\.0\\.0\\.1:(\\d{2,5})',[^}]*?id: '${verticalId}'`, 'u'))?.[1];

			// Both halves non-empty FIRST. A regex that stopped matching either file would otherwise
			// compare `undefined` with `undefined` and pass — vacuously, and forever.
			expect(declared, `no origin parsed out of tests/e2e/${baseFile}.ts`).toBeDefined();
			expect(canonical, `no devOrigin parsed for '${verticalId}' out of the registry`).toBeDefined();

			if (declared !== canonical) {
				mismatches.push(`${baseFile}.ts serves :${String(declared)}, but '${verticalId}' is :${String(canonical)}`);
			}
		}

		expect(mismatches).toEqual([]);
	});

	it('keeps the landing site’s e2e origin helper on the registry’s SITE origin', () => {
		// The same FOURTH-copy check for the one origin that is not a vertical: the how-it-works spec
		// navigates to `siteBase.ts`'s origin, and the apps' landing pages link to `SITE.devOrigin`. Both
		// must be the port the site's dev server holds, or the spec tests one server while the links
		// point at another.
		const registry = readFileSync(
			resolve(REPO_ROOT, 'packages/examples-shared/src/verticals/verticals.ts'),
			'utf8',
		);
		const canonical = registry.match(/export const SITE[^}]*?devOrigin: 'http:\/\/127\.0\.0\.1:(\d{2,5})'/u)?.[1];
		const declared = readFileSync(resolve(REPO_ROOT, 'tests/e2e/siteBase.ts'), 'utf8')
			.match(/'http:\/\/127\.0\.0\.1:(\d{2,5})'/u)?.[1];

		expect(canonical, 'no SITE.devOrigin parsed out of the registry').toBeDefined();
		expect(declared, 'no origin parsed out of tests/e2e/siteBase.ts').toBeDefined();
		expect(Number(declared)).toBe(VITE_PORTS['site']);
		expect(Number(canonical)).toBe(VITE_PORTS['site']);
	});

	it('has the e2e preflight LABELLING every port it probes', () => {
		// An unlabelled port still reports, as a bare number. Since the labels name the script that
		// starts each vertical, an unlabelled one is a failure message that says a port is busy and
		// nothing about what to stop — which is most of the value.
		const preflight = readFileSync(resolve(REPO_ROOT, 'scripts/check-e2e-ports.mjs'), 'utf8');
		const labelled = new Set(
			[...preflight.matchAll(/^\t(\d{2,5}): \[/gmu)].map(([, port]) => Number(port)),
		);

		expect(e2ePortsFromConfig().filter((port) => !labelled.has(port))).toEqual([]);
	});
});
