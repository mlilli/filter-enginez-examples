/**
 * The Cloudflare deployment, held together: every site's `wrangler.jsonc`, the hosts the apps link to,
 * the landing page's sitemap and links, and the deploy job that ships them.
 *
 * @remarks
 * A package is deployed if and only if it carries a `wrangler.jsonc`; `scripts/lib/deploy-targets.mjs`
 * lists them, and the deploy job's matrix is that list. Every assertion here starts from it (or from
 * the verticals registry it must agree with) rather than from a list written in this file, so a new
 * site is checked the day its config appears.
 *
 * What would otherwise fail silently, and where:
 *
 * - **A cross-app link to a host nothing serves.** The comparison page links each vertical to its
 *   registry `productionOrigin`; the Worker is served on the config's custom domain. Nothing at build time
 *   compares the two, and a typo surfaces as a dead link in production only.
 * - **A deploy of the wrong directory.** Wrangler uploads whatever `assets.directory` names. Pointed
 *   at a stale or partial directory, the deploy succeeds; pointed outside what the build strips, the
 *   local-only wine corpus could ship.
 * - **A public address nobody chose.** `workers_dev` and preview URLs default ON for a Worker without
 *   routes, and each is a second, unlisted copy of the site.
 * - **A sitemap or landing page that forgets a site,** or lists one that is not deployed — or lists a
 *   page on the apex that the site's build does not produce.
 * - **An app's `/about` or `/compare` that stops answering.** "How the engine works" and the comparison
 *   page are each one page on the apex, and a link to any app's `/about` or `/compare` must land there —
 *   the latter with its query string, which carries the filter state the link was made to share.
 *
 * Read as TEXT where the subject is a file humans edit; the registry is parsed rather than imported,
 * because this project resolves no workspace packages (see `devServerPorts.test.ts`).
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { type DeployTarget, listDeployTargets, parseJsonc } from '../../scripts/lib/deploy-targets.mjs';
import { workerRunsFirstFor } from './support/workersRouting.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The registrable domain every site lives under. */
const APEX_HOST = 'filterenginez.com';

/** The landing page's package directory, the one target served at the apex. */
const SITE_PACKAGE = 'site';

/** The Worker entry examples-server provides for the apps whose dev servers proxy `/api`. */
const API_WORKER_ENTRY = '../examples-server/src/cloudflareWorker.ts';

/** The build step every corpus-linked app ends with (see `buildsStripLocalCorpus.test.ts`). */
const STRIP_COMMAND = 'node ../../scripts/strip-local-corpus.mjs';

/** Where every app's `/about` must send a visitor. */
const HOW_IT_WORKS_URL = `https://${APEX_HOST}/how-it-works`;

/** The `_redirects` rule each static-asset app carries for `/about`. */
const ABOUT_REDIRECT_RULE = `/about ${HOW_IT_WORKS_URL} 301`;

/** Where every app's `/compare` must send a visitor (with the request's query string). */
const COMPARE_URL = `https://${APEX_HOST}/compare`;

/**
 * The `_redirects` rules each static-asset app carries for `/compare`.
 *
 * @remarks
 * The destination has NO query string of its own, and that is what keeps the visitor's: Workers static
 * assets append the request's query to a destination that has none, and replace it when the
 * destination has one (verified under `wrangler dev`: `/compare?dataset=wine&f=…` answers
 * `Location: https://filterenginez.com/compare?dataset=wine&f=…`). The trailing-slash spelling gets its
 * own line, because a `_redirects` source matches its path exactly.
 */
const COMPARE_REDIRECT_RULES = [`/compare ${COMPARE_URL} 301`, `/compare/ ${COMPARE_URL} 301`];

const TARGETS = listDeployTargets();

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
 * Each vertical's id and production origin, parsed out of the registry source.
 *
 * @returns `id → productionOrigin`.
 */
function registryProductionOrigins(): ReadonlyMap<string, string> {
	const registry = readRepoFile('packages/examples-shared/src/verticals/verticals.ts');

	// `id` precedes `productionOrigin` inside each descriptor (the keys are sorted), and `[^}]*?` keeps
	// the match inside one object literal.
	return new Map(
		[...registry.matchAll(/id: '([a-z-]+)',[^}]*?productionOrigin: '([^']+)'/gu)].map(([, id, origin]) => [id ?? '', origin ?? '']),
	);
}

/**
 * Whether a package's dev server proxies `/api` to examples-server — Vite's `server.proxy`, or
 * Angular's `proxy.config.json`.
 *
 * @param packageDirectory - The package directory under `packages/`.
 * @returns `true` when the app calls a same-origin `/api` in development.
 */
function proxiesApi(packageDirectory: string): boolean {
	const viteConfig = `packages/${packageDirectory}/vite.config.ts`;
	const angularProxy = `packages/${packageDirectory}/proxy.config.json`;

	return (existsSync(resolve(REPO_ROOT, viteConfig)) && /^\s*'\/api': \{$/mu.test(readRepoFile(viteConfig)))
		|| (existsSync(resolve(REPO_ROOT, angularProxy)) && readRepoFile(angularProxy).includes('"/api"'));
}

/**
 * The output directories a package's `build` script strips the local corpus from, or `[]` when its
 * build has no strip step.
 *
 * @param packageDirectory - The package directory under `packages/`.
 * @returns Paths relative to the package, POSIX-normalized, without a leading `./`.
 */
function strippedDirectories(packageDirectory: string): readonly string[] {
	const manifest = JSON.parse(readRepoFile(`packages/${packageDirectory}/package.json`)) as {
		readonly scripts?: Readonly<Record<string, string>>;
	};
	const lastCommand = (manifest.scripts?.['build'] ?? '').split('&&').at(-1)?.trim() ?? '';

	return lastCommand.startsWith(STRIP_COMMAND)
		? lastCommand.slice(STRIP_COMMAND.length).trim().split(/\s+/u).map((path) => posix.normalize(path))
		: [];
}

/**
 * The packages `link-wine-corpus.mjs` links the real wine corpus into.
 *
 * @returns Package directory names.
 */
function corpusLinkedPackages(): readonly string[] {
	const listBody = /const TARGET_DIRS = \[([\s\S]*?)\];/u.exec(readRepoFile('scripts/link-wine-corpus.mjs'))?.[1] ?? '';

	return [...listBody.matchAll(/'packages\/([^/']+)\/[^']+'/gu)].map((match) => match[1] ?? '');
}

/**
 * A target's `assets.directory`, relative to its package, POSIX-normalized, without a leading `./`.
 *
 * @param target - The deploy target.
 * @returns The directory.
 */
function packageRelativeAssets(target: DeployTarget): string {
	return posix.normalize(target.config.assets?.directory ?? '');
}

/**
 * The `deploy` job's block in `ci.yml`, from its key to the next job or the end of the file.
 *
 * @returns The block's text.
 */
function deployJobBlock(): string {
	return /^ {2}deploy:\n[\s\S]*?(?=^ {2}\S|(?![\s\S]))/mu.exec(readRepoFile('.github/workflows/ci.yml'))?.[0] ?? '';
}

/**
 * The site's pages other than the home page, as the Worker lists them (`PAGE_PATHS` in
 * `siteRequestHandler.ts`), read as text.
 *
 * @returns Canonical paths, e.g. `/how-it-works`.
 */
function sitePagePaths(): readonly string[] {
	const list = /export const PAGE_PATHS: readonly string\[\] = \[([^\]]*)\];/u.exec(readRepoFile('packages/site/src/siteRequestHandler.ts'))?.[1] ?? '';

	return [...list.matchAll(/'([^']+)'/gu)].map(([, path]) => path ?? '');
}

/**
 * The HTML entries the site's Vite build renders, other than `index.html` and `404.html`, as page
 * paths (`how-it-works.html` → `/how-it-works`).
 *
 * @returns Canonical paths.
 */
function siteBuiltPagePaths(): readonly string[] {
	const config = readRepoFile('packages/site/vite.config.ts');

	return [...config.matchAll(/new URL\('([a-z0-9-]+)\.html', import\.meta\.url\)/gu)]
		.map(([, name]) => name ?? '')
		.filter((name) => name !== 'index' && name !== '404')
		.map((name) => `/${name}`);
}

const PRODUCTION_ORIGINS = registryProductionOrigins();
const SITE_TARGET = TARGETS.find((target) => target.packageDirectory === SITE_PACKAGE);
const SUBDOMAIN_HOSTS = TARGETS.filter((target) => target !== SITE_TARGET).flatMap((target) => target.hosts);

describe('deploy targets', () => {
	it('finds the deployable packages and the registry, so the cases below are not vacuous', () => {
		expect(TARGETS.length).toBeGreaterThanOrEqual(8);
		expect(PRODUCTION_ORIGINS.size, 'no productionOrigin parsed out of verticals.ts').toBe(6);
		expect(SITE_TARGET, `packages/${SITE_PACKAGE}/wrangler.jsonc is missing`).toBeDefined();
	});

	it('deploys every vertical, the documentation site and the landing page — and nothing else', () => {
		const expected = [...[...PRODUCTION_ORIGINS.keys()].map((id) => `examples-${id}`), 'examples-docs', SITE_PACKAGE];

		expect(TARGETS.map((target) => target.packageDirectory).sort()).toEqual(expected.sort());
	});

	it('gives every Worker its own name', () => {
		const names = TARGETS.map((target) => target.config.name);

		expect(new Set(names).size).toBe(names.length);
		for (const name of names) {
			expect(name).toMatch(/^filter-enginez-[a-z-]+$/u);
		}
	});

	it('serves no two sites on one host', () => {
		const hosts = TARGETS.flatMap((target) => target.hosts);

		expect(new Set(hosts).size).toBe(hosts.length);
	});

	for (const target of TARGETS) {
		describe(target.packageDirectory, () => {
			it('is reachable only on its custom domains: no workers.dev URL, no preview URLs', () => {
				expect(target.config.workers_dev, 'set "workers_dev": false').toBe(false);
				expect(target.config.preview_urls, 'set "preview_urls": false').toBe(false);
				expect(target.hosts.length, 'no custom-domain route').toBeGreaterThan(0);
				expect(target.config.routes?.every((route) => route.custom_domain === true), 'every route must be a custom domain').toBe(true);
				for (const host of target.hosts) {
					expect(host === APEX_HOST || host.endsWith(`.${APEX_HOST}`), host).toBe(true);
				}
			});

			it('pins a compatibility date no later than today', () => {
				const date = target.config.compatibility_date ?? '';

				expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
				expect(date <= new Date().toISOString().slice(0, 10), `${date} is in the future`).toBe(true);
			});

			it('deploys a directory its build writes, and only from inside what the build strips', () => {
				const assets = packageRelativeAssets(target);
				const stripped = strippedDirectories(target.packageDirectory);

				expect(assets, 'no assets.directory').not.toBe('.');
				if (corpusLinkedPackages().includes(target.packageDirectory)) {
					// The corpus is linked into this app's static directory, so its deploy output must sit
					// inside a directory the build's last step cleans — or the corpus ships.
					expect(
						stripped.some((directory) => assets === directory || assets.startsWith(`${directory}/`)),
						`${assets} is not inside any directory the build strips (${stripped.join(', ')})`,
					).toBe(true);
				}
			});

			it('handles requests the way its app routes them', () => {
				const { assets } = target.config;

				if (target === SITE_TARGET) {
					return;
				}
				if (existsSync(resolve(REPO_ROOT, `packages/${target.packageDirectory}/svelte.config.js`))) {
					// SvelteKit routes on the server: the Worker answers every path that is not a file.
					expect(assets?.not_found_handling).toBeUndefined();
					expect(assets?.binding).toBe('ASSETS');
					expect(posix.dirname(posix.normalize(target.config.main ?? '')), 'main must sit in the assets directory').toBe(packageRelativeAssets(target));
					expect(target.config.compatibility_flags).toContain('nodejs_compat');
				} else {
					// Every other app routes on the client, from browser history.
					expect(assets?.not_found_handling).toBe('single-page-application');
				}
			});

			it('answers the same-origin /api its dev server proxies — with examples-server’s Worker, or not at all', () => {
				if (target === SITE_TARGET || existsSync(resolve(REPO_ROOT, `packages/${target.packageDirectory}/svelte.config.js`))) {
					return;
				}
				if (proxiesApi(target.packageDirectory)) {
					// `run_worker_first` itself, including the corpus files it leaves to the assets, is
					// checked in `staticCorpusAssets.test.ts`.
					expect(target.config.main).toBe(API_WORKER_ENTRY);
					expect(target.config.assets?.binding).toBe('ASSETS');
					expect(workerRunsFirstFor(target.config.assets?.run_worker_first, '/api/query'), 'the Worker must answer /api/*').toBe(true);
				} else {
					// No server-backed route, so no Worker script: a request is never a billed invocation.
					expect(target.config.main).toBeUndefined();
				}
			});

			it('keeps Wrangler’s local bundles out of the package lint', () => {
				// `wrangler dev` writes generated bundles to `.wrangler/` beside the config; a lint that
				// reads them fails with thousands of findings in code nobody wrote.
				expect(readRepoFile(`packages/${target.packageDirectory}/eslint.config.js`)).toContain("'.wrangler/**'");
			});
		});
	}
});

describe('production origins', () => {
	it.each([...registryProductionOrigins()])('%s links to the host its Worker is served on', (id, origin) => {
		const target = TARGETS.find((candidate) => candidate.packageDirectory === `examples-${id}`);

		expect(target, `packages/examples-${id}/wrangler.jsonc is missing`).toBeDefined();
		expect(target?.hosts.map((host) => `https://${host}`)).toEqual([origin]);
	});
});

describe('the landing page', () => {
	it('is served at the apex and redirects www to it, so the Worker must run first', () => {
		expect(SITE_TARGET?.hosts.slice().sort()).toEqual([APEX_HOST, `www.${APEX_HOST}`]);
		expect(SITE_TARGET?.config.assets?.run_worker_first).toBe(true);
		expect(SITE_TARGET?.config.main).toBe('./src/worker.ts');
	});

	it('lists the root of every deployed site and every page of the apex in sitemap.xml, and nothing else', () => {
		const sitemap = readRepoFile('packages/site/public/sitemap.xml');
		const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(([, url]) => url ?? '');
		const expected = [
			`https://${APEX_HOST}/`,
			...SUBDOMAIN_HOSTS.map((host) => `https://${host}/`),
			...siteBuiltPagePaths().map((path) => `https://${APEX_HOST}${path}`),
		];

		expect(listed.slice().sort()).toEqual(expected.slice().sort());
	});

	it('builds every page the sitemap lists on the apex, and serves it at the listed path', () => {
		// A path on the apex is allowed in the sitemap only if it is a page: an HTML entry the site's
		// Vite build renders, at the canonical path the Worker redirects that page's other spellings to,
		// and naming that same URL as its own canonical.
		const apexPages = [...readRepoFile('packages/site/public/sitemap.xml').matchAll(/<loc>https:\/\/filterenginez\.com(\/[^<]+)<\/loc>/gu)]
			.map(([, path]) => path ?? '')
			.filter((path) => path !== '/');

		expect(apexPages, 'the sitemap lists no page on the apex besides its root').not.toEqual([]);
		expect(siteBuiltPagePaths().slice().sort()).toEqual(apexPages.slice().sort());
		expect(sitePagePaths().slice().sort()).toEqual(apexPages.slice().sort());
		for (const path of apexPages) {
			const entry = `packages/site${path}.html`;

			expect(existsSync(resolve(REPO_ROOT, entry)), `${entry} is missing`).toBe(true);
			expect(readRepoFile(entry)).toContain(`<link rel="canonical" href="https://${APEX_HOST}${path}" />`);
		}
	});

	it('points robots.txt at the sitemap', () => {
		expect(readRepoFile('packages/site/public/robots.txt')).toMatch(new RegExp(`^Sitemap: https://${APEX_HOST}/sitemap\\.xml$`, 'mu'));
	});

	it('links to every demo, the docs, npm and both repositories', () => {
		const page = readRepoFile('packages/site/index.html');
		const required = [
			...SUBDOMAIN_HOSTS.map((host) => `https://${host}/`),
			'/how-it-works',
			'/compare',
			'https://www.npmjs.com/org/filter-enginez',
			'https://github.com/mlilli/filter-enginez',
			'https://github.com/mlilli/filter-enginez-examples',
		];

		expect(required.filter((url) => !page.includes(`href="${url}"`))).toEqual([]);
	});

	it('lists exactly the six demo apps in the demo grid, one card each, at the id the apps link to', () => {
		// Every app's "All demos" link points at `/#demos`, so the section must keep that id; and the grid
		// holds the six apps and nothing else, so six cards fill one, two or three columns with no orphan.
		const page = readRepoFile('packages/site/index.html');
		const demos = /<section id="demos"[\s\S]*?<\/section>/u.exec(page)?.[0] ?? '';
		const cardTargets = [...demos.matchAll(/<a class="fe-landing__card[^"]*" href="([^"]+)"/gu)].map(([, href]) => href ?? '');
		const appHomes = [...PRODUCTION_ORIGINS.values()].map((origin) => `${origin}/`);

		expect(demos, 'no <section id="demos"> on the home page').not.toBe('');
		expect(cardTargets.slice().sort()).toEqual(appHomes.slice().sort());
	});

	it('groups the hero’s four actions two and two, each group named', () => {
		const page = readRepoFile('packages/site/index.html');
		const actions = /<div class="hero-actions">([\s\S]*?)<div class="install">/u.exec(page)?.[1] ?? '';
		const groups = [...actions.matchAll(/role="group" aria-labelledby="([^"]+)"[\s\S]*?<\/ul>/gu)];

		expect(groups.map((group) => [...group[0].matchAll(/<a class="hero-actions__link/gu)].length)).toEqual([2, 2]);
		for (const [, labelId] of groups) {
			expect(actions, `the label #${labelId ?? ''} of a hero group`).toContain(`id="${labelId ?? ''}"`);
		}
	});

	it('declares the apex as canonical, an absolute Open Graph image, and parseable structured data', () => {
		const page = readRepoFile('packages/site/index.html');
		const structuredData = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/u.exec(page)?.[1] ?? '';

		expect(page).toContain(`<link rel="canonical" href="https://${APEX_HOST}/" />`);
		expect(page).toContain(`<meta property="og:image" content="https://${APEX_HOST}/og-card.png" />`);
		expect(JSON.parse(structuredData)).toMatchObject({ '@context': 'https://schema.org', '@type': 'SoftwareSourceCode' });
	});
});

describe('every app’s /about and /compare', () => {
	const verticals = TARGETS.filter((target) => PRODUCTION_ORIGINS.has(target.packageDirectory.replace(/^examples-/u, '')));

	it('covers all six deployed verticals, so the cases below are not vacuous', () => {
		expect(verticals).toHaveLength(6);
	});

	for (const target of verticals) {
		const directory = `packages/${target.packageDirectory}`;

		it(`${target.packageDirectory} answers /about with a 301 to ${HOW_IT_WORKS_URL}`, () => {
			if (existsSync(resolve(REPO_ROOT, directory, 'svelte.config.js'))) {
				// Served by SvelteKit's own Worker, which `_redirects` never sees: the route redirects.
				const route = readRepoFile(`${directory}/src/routes/about/+server.ts`);

				expect(route).toMatch(/export const GET: RequestHandler = \(\{ url \}\) => redirect\(301, howItWorksUrl\(url\)\);/u);

				return;
			}

			// A static-asset app: Workers static assets apply `public/_redirects` (copied into the build
			// output), but never to a request the Worker answers first.
			const redirects = `${directory}/public/_redirects`;

			expect(existsSync(resolve(REPO_ROOT, redirects)), `${redirects} is missing`).toBe(true);
			expect(readRepoFile(redirects).split('\n')).toContain(ABOUT_REDIRECT_RULE);
			expect(workerRunsFirstFor(target.config.assets?.run_worker_first, '/about'), 'the Worker runs first for /about').toBe(false);
		});
	}

	for (const target of verticals) {
		const directory = `packages/${target.packageDirectory}`;

		it(`${target.packageDirectory} answers /compare with a 301 to ${COMPARE_URL}, keeping the query`, () => {
			if (existsSync(resolve(REPO_ROOT, directory, 'svelte.config.js'))) {
				// Served by SvelteKit's own Worker, which `_redirects` never sees: the route redirects, and
				// appends the request's query itself.
				const route = readRepoFile(`${directory}/src/routes/compare/+server.ts`);

				expect(route).toMatch(
					/export const GET: RequestHandler = \(\{ url \}\) => redirect\(301, `\$\{siteUrl\(COMPARE_PATH, url\)\}\$\{url\.search\}`\);/u,
				);
				expect(existsSync(resolve(REPO_ROOT, directory, 'src/routes/compare/+page.svelte')), 'an in-app compare page').toBe(false);

				return;
			}

			const lines = readRepoFile(`${directory}/public/_redirects`).split('\n');

			expect(COMPARE_REDIRECT_RULES.filter((rule) => !lines.includes(rule))).toEqual([]);
			// A destination carrying its own `?` would REPLACE the visitor's query, dropping their state.
			expect(lines.filter((line) => line.startsWith('/compare') && line.includes('?'))).toEqual([]);
			expect(workerRunsFirstFor(target.config.assets?.run_worker_first, '/compare'), 'the Worker runs first for /compare').toBe(false);
		});
	}

	it('reads run_worker_first the way Workers does, so the case above can fail', () => {
		expect(workerRunsFirstFor(['/api/*'], '/about')).toBe(false);
		expect(workerRunsFirstFor(['/api/*'], '/api/query')).toBe(true);
		expect(workerRunsFirstFor(['/api/*', '!/api/corpus/*'], '/api/query')).toBe(true);
		// A negative pattern wins over a positive one, whatever their order.
		expect(workerRunsFirstFor(['/api/*', '!/api/corpus/*'], '/api/corpus/wine.json')).toBe(false);
		expect(workerRunsFirstFor(['!/api/corpus/*', '/api/*'], '/api/corpus/wine.json')).toBe(false);
		// `*` matches across `/`, and every other character is literal.
		expect(workerRunsFirstFor(['/api/*'], '/api/a/b')).toBe(true);
		expect(workerRunsFirstFor(['/api.json'], '/api-json')).toBe(false);
		// A negative pattern alone sends nothing to the Worker.
		expect(workerRunsFirstFor(['!/api/corpus/*'], '/about')).toBe(false);
		expect(workerRunsFirstFor(true, '/about')).toBe(true);
		expect(workerRunsFirstFor(undefined, '/about')).toBe(false);
	});
});

describe('the deploy job', () => {
	const job = deployJobBlock();
	const workflow = readRepoFile('.github/workflows/ci.yml');

	it('exists in ci.yml, so the cases below are not vacuous', () => {
		expect(job).toContain('wrangler deploy');
	});

	it('takes its matrix from the wrangler.jsonc files rather than a list of its own', () => {
		expect(workflow).toContain('node scripts/list-deploy-targets.mjs --github-output');
		expect(job).toContain('fromJSON(needs.gates.outputs.deploy-targets)');
		for (const target of TARGETS) {
			expect(job, `${target.packageName} is named in the deploy job — derive it instead`).not.toContain(target.packageName);
		}
	});

	it('runs only after the gates pass, only for a push to main, and lets every site finish', () => {
		expect(job).toMatch(/^ {4}needs: gates$/mu);
		expect(job).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
		expect(job).toMatch(/^ {6}fail-fast: false$/mu);
	});

	it('builds SvelteKit for Workers, and turbo passes the switch through to the build', () => {
		const turbo = parseJsonc(readRepoFile('turbo.json')) as { readonly tasks: { readonly build: { readonly env?: readonly string[] }}};

		expect(job).toMatch(/^ {6}SVELTEKIT_ADAPTER: cloudflare$/mu);
		expect(turbo.tasks.build.env).toContain('SVELTEKIT_ADAPTER');
	});

	it('checks the deploy output for the local-only wine corpus before uploading it, unconditionally', () => {
		expect(job.indexOf("-name 'data-real-*'")).toBeGreaterThan(-1);
		expect(job.indexOf("-name 'data-real-*'")).toBeLessThan(job.indexOf('wrangler deploy'));
		// No step of the job is conditional: an `if:` on the corpus check (or on the build before it)
		// would let a deploy upload whatever the directory holds.
		expect(job).not.toMatch(/^ {8}if:/mu);
	});

	it('ships each bundled font’s OFL.txt with every site, before uploading it', () => {
		// The SIL Open Font License travels with the fonts (NOTICE.md), and every site serves them.
		// The step copies with a glob, so every font directory must hold its own license for the glob to
		// find — a font added without one would ship unlicensed and the step would not notice.
		const fontDirectories = readdirSync(resolve(REPO_ROOT, 'packages/brand/src/fonts'), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);

		expect(fontDirectories.length).toBeGreaterThanOrEqual(3);
		expect(fontDirectories.filter((font) => !existsSync(resolve(REPO_ROOT, 'packages/brand/src/fonts', font, 'OFL.txt')))).toEqual([]);
		expect(job.indexOf('packages/brand/src/fonts/*/OFL.txt')).toBeGreaterThan(-1);
		expect(job.indexOf('packages/brand/src/fonts/*/OFL.txt')).toBeLessThan(job.indexOf('wrangler deploy'));
	});

	it('is never cancelled midway on main by a newer run', () => {
		expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
	});
});
