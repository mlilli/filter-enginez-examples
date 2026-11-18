#!/usr/bin/env node
/**
 * `serve-builds` — serve the six apps' production builds the way they are deployed, for the prerender
 * end-to-end suite (`playwright.prerender.config.ts`).
 *
 *     node scripts/serve-builds.mjs        # after `pnpm build`
 *
 * @remarks
 * Each Vite or Angular app is a Cloudflare Worker with static assets. Here each gets a port and the same
 * two halves: a path the app's `wrangler.jsonc` sends to its Worker first (`run_worker_first`) is
 * answered by that Worker's own code, examples-server's `handleWorkerRequest`, with the static files as
 * its assets binding; anything else is answered as the assets do (`html_handling` maps `/wine` to
 * `wine.html`, an unknown path gets `404.html` with status 404). So the server-backed pages' per-request
 * count runs exactly as deployed. One difference: the deploy job writes each dataset's corpus file into
 * `/api/corpus/`; with no such file here, those requests go to the Worker's handler, which writes the
 * same JSON. SvelteKit runs its own Node build (`adapter-node`, the local default).
 *
 * It refuses to start when a build is missing, naming the command that makes it: a suite run against
 * no build would fail in every test for one reason, far from the cause.
 *
 * @packageDocumentation
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { importTypeScript } from './lib/typescript-source.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Each built app and its port: the dev server's port plus ten (`playwright.config.ts` has those). */
const BUILT_APPS = [
	{ build: 'packages/examples-angular/dist/browser', name: 'angular', port: 24620, wrangler: 'packages/examples-angular/wrangler.jsonc' },
	{ build: 'packages/examples-react-rtk/dist', name: 'react-rtk', port: 24621, wrangler: 'packages/examples-react-rtk/wrangler.jsonc' },
	{ build: 'packages/examples-sveltekit/build', name: 'sveltekit', port: 24622, wrangler: null },
	{ build: 'packages/examples-react-plain/dist', name: 'react-plain', port: 24623, wrangler: 'packages/examples-react-plain/wrangler.jsonc' },
	{ build: 'packages/examples-vue/dist', name: 'vue', port: 24624, wrangler: 'packages/examples-vue/wrangler.jsonc' },
	{ build: 'packages/examples-vanilla/dist', name: 'vanilla', port: 24625, wrangler: 'packages/examples-vanilla/wrangler.jsonc' },
];

/** Content types for the files a build holds. */
const CONTENT_TYPES = new Map([
	['.css', 'text/css'],
	['.html', 'text/html; charset=utf-8'],
	['.ico', 'image/x-icon'],
	['.js', 'text/javascript'],
	['.json', 'application/json'],
	['.mjs', 'text/javascript'],
	['.png', 'image/png'],
	['.svg', 'image/svg+xml'],
	['.wasm', 'application/wasm'],
	['.webmanifest', 'application/manifest+json'],
	['.woff2', 'font/woff2'],
]);

/**
 * A `wrangler.jsonc`'s Worker script and its `run_worker_first` patterns.
 *
 * @param {string} path - Repo-relative.
 * @returns {{ main: string, runWorkerFirst: string[] }} What the deploy reads.
 */
function readWrangler(path) {
	const text = readFileSync(join(REPO_ROOT, path), 'utf8').replaceAll(/^\s*\/\/[^\n]*$/gmu, '');
	const config = /** @type {{ main: string, assets: { run_worker_first?: string[] } }} */ (JSON.parse(text));

	return { main: config.main, runWorkerFirst: config.assets.run_worker_first ?? []};
}

/**
 * Whether a path matches a `run_worker_first` pattern: `*` matches any run of characters.
 *
 * @param {string} pathname - The request path.
 * @param {string} pattern - The pattern, without its `!`.
 * @returns {boolean} Whether it matches.
 */
function matchesPattern(pathname, pattern) {
	return new RegExp(`^${pattern.replaceAll(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*')}$`, 'u').test(pathname);
}

/**
 * Whether the Worker runs first for a path: a pattern matches and no negated one does.
 *
 * @param {string} pathname - The request path.
 * @param {readonly string[]} patterns - `run_worker_first`.
 * @returns {boolean} Whether it does.
 */
function runsWorkerFirst(pathname, patterns) {
	const negated = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));
	const positive = patterns.filter((pattern) => !pattern.startsWith('!'));

	return positive.some((pattern) => matchesPattern(pathname, pattern)) && !negated.some((pattern) => matchesPattern(pathname, pattern));
}

/**
 * The static assets of a build, answered as Workers' assets answer.
 *
 * @param {string} directory - The build.
 * @param {string} pathname - The request path.
 * @returns {Response | null} The file, or `null` when the build has none (the caller decides).
 */
function assetFile(directory, pathname) {
	const candidates = pathname.endsWith('/') ? [join(directory, pathname, 'index.html')] : [join(directory, pathname), join(directory, `${pathname}.html`)];
	const file = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());

	if (file === undefined) {
		return null;
	}

	return new Response(readFileSync(file), { headers: { 'content-type': CONTENT_TYPES.get(extname(file)) ?? 'application/octet-stream' }});
}

/**
 * The assets binding over a build: a file, or `404.html` with status 404.
 *
 * @param {string} directory - The build.
 * @returns {{ fetch: (request: Request) => Promise<Response> }} The binding.
 */
function assetsBinding(directory) {
	return {
		fetch: async (request) =>
			assetFile(directory, new URL(request.url).pathname) ??
			new Response(readFileSync(join(directory, '404.html')), { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 404 }),
	};
}

/**
 * Serve one Worker-hosted build.
 *
 * @param {(typeof BUILT_APPS)[number]} app - The app.
 * @param {(request: Request, environment: unknown) => Promise<Response>} handleWorkerRequest - examples-server's Worker.
 */
function serveWorkerBuild(app, handleWorkerRequest) {
	const directory = join(REPO_ROOT, app.build);
	const { main, runWorkerFirst } = readWrangler(/** @type {string} */ (app.wrangler));
	const isApiWorker = main.endsWith('cloudflareWorker.ts');
	const assets = assetsBinding(directory);

	createServer((incoming, outgoing) => {
		const chunks = /** @type {Buffer[]} */ ([]);

		incoming.on('data', (chunk) => chunks.push(chunk));
		incoming.on('end', () => {
			const url = `http://127.0.0.1:${String(app.port)}${incoming.url ?? '/'}`;
			const request = new Request(url, {
				body: incoming.method === 'POST' ? Buffer.concat(chunks) : undefined,
				headers: /** @type {Record<string, string>} */ (incoming.headers),
				method: incoming.method,
			});
			const { pathname } = new URL(url);
			// The deploy job's corpus files: absent here, so the Worker's handler writes the same JSON.
			const isMissingCorpus = isApiWorker && pathname.startsWith('/api/corpus/') && assetFile(directory, pathname) === null;
			const answer =
				isApiWorker && (runsWorkerFirst(pathname, runWorkerFirst) || isMissingCorpus)
					? handleWorkerRequest(request, { ASSETS: assets })
					: assets.fetch(request);

			void answer.then(async (response) => {
				outgoing.writeHead(response.status, Object.fromEntries(response.headers));
				outgoing.end(Buffer.from(await response.arrayBuffer()));
			});
		});
	}).listen(app.port, '127.0.0.1');
}

const missing = BUILT_APPS.filter(({ build }) => !existsSync(join(REPO_ROOT, build)));

if (missing.length > 0) {
	console.error(`✗ serve-builds: no build at ${missing.map(({ build }) => build).join(', ')}. Run \`pnpm build\` first.`);
	process.exit(1);
}

const { handleWorkerRequest } = /** @type {{ handleWorkerRequest: (request: Request, environment: unknown) => Promise<Response> }} */ (
	await importTypeScript(join(REPO_ROOT, 'packages/examples-server/src/workerRequestHandler.ts'))
);

// SvelteKit's Node build is its own server. It starts first, and the others open their ports once it
// answers, so the last port opening (the config's readiness URL) means every app is up.
const sveltekit = BUILT_APPS.filter(({ wrangler }) => wrangler === null);

for (const app of sveltekit) {
	const child = spawn(process.execPath, [join(REPO_ROOT, app.build)], {
		env: { ...process.env, HOST: '127.0.0.1', ORIGIN: `http://127.0.0.1:${String(app.port)}`, PORT: String(app.port) },
		stdio: 'inherit',
	});

	process.on('exit', () => child.kill());
	for (let attempt = 0; ; attempt += 1) {
		try {
			await fetch(`http://127.0.0.1:${String(app.port)}/`);
			break;
		} catch {
			if (attempt >= 120) {
				console.error(`✗ serve-builds: the ${app.name} build did not answer on ${String(app.port)}.`);
				process.exit(1);
			}
			await new Promise((done) => {
				setTimeout(done, 250);
			});
		}
	}
}
for (const app of BUILT_APPS) {
	if (app.wrangler !== null) {
		serveWorkerBuild(app, handleWorkerRequest);
	}
}
console.log(`→ serve-builds: ${BUILT_APPS.map(({ name, port }) => `${name} on ${String(port)}`).join(', ')}`);
