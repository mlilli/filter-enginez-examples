#!/usr/bin/env node
/**
 * `write-route-shells` — give every page a client-routed host serves its own HTML shell, and every
 * other path the app's not-found page with a 404.
 *
 *     node ../../scripts/write-route-shells.mjs dist --host vue            # a Vite app, after `vite build`
 *     node ../../scripts/write-route-shells.mjs dist/browser --host angular
 *
 * @remarks
 * Each host is a Cloudflare Worker with static assets and `not_found_handling: "404-page"`: a path
 * with a file answers with it, and any other path with the nearest `404.html` and status 404. So the
 * build writes, from its own `index.html`:
 *
 * - **one shell per page** the host serves, at the file Workers' default `html_handling` serves at the
 *   page's path (`wine.html` for `/wine`, `docs/rules/range.html` for `/docs/rules/range`), with that
 *   page's title, description and canonical URL in its head;
 * - **`index.html`** again, with the hub's head and its canonical URL;
 * - **`404.html`**, with the not-found page's title and `noindex`.
 *
 * The app boots on each of them and renders the route the address names, the not-found page for an
 * unknown one. The pages and their heads come from `examples-shared`'s page catalog
 * (`src/page-meta/hostPages.ts`), the list the sitemap reads too; before writing anything, the step
 * checks the app's router against it (`lib/route-shells.mjs` says why) and fails on any difference.
 * It also fails rather than overwrite a file the build already wrote under a shell's name, and on a
 * page that already carries a canonical link: run twice over one build, it would otherwise write every
 * head twice.
 *
 * `tests/tooling/routeShells.test.ts` checks that every client-routed host's build ends with this step.
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { checkRouterAgainstCatalog, loadRouteCatalog, NOT_FOUND_SHELL, writeShellHead } from './lib/route-shells.mjs';

/** How the script is called, for its error messages. */
const USAGE = 'usage: node write-route-shells.mjs <build-output-directory> --host <host>';

/**
 * Print a failure and exit.
 *
 * @param {string} message - What is wrong and how to fix it.
 * @returns {never} Never; the process exits.
 */
function fail(message) {
	console.error(`✗ write-route-shells: ${message}`);
	process.exit(1);
}

const [outputArgument, hostFlag, host, ...extra] = process.argv.slice(2);

if (outputArgument === undefined || hostFlag !== '--host' || host === undefined || extra.length > 0) {
	fail(USAGE);
}

const outputDirectory = resolve(outputArgument);
const indexPath = join(outputDirectory, 'index.html');

if (!existsSync(indexPath)) {
	fail(`${indexPath} does not exist — is the build script pointing at the right output?`);
}

try {
	const catalog = await loadRouteCatalog();
	const { hostPages } = catalog;
	const routedHost = /** @type {import('./lib/route-shells.d.mts').RoutedHost} */ (host);

	if (!hostPages.ROUTED_HOSTS.includes(routedHost) || !hostPages.isShellHost(routedHost)) {
		fail(`"${host}" is not a host that writes route shells; expected one of ${hostPages.ROUTED_HOSTS.filter((candidate) => hostPages.isShellHost(candidate)).join(', ')}.`);
	}

	checkRouterAgainstCatalog(routedHost, catalog);

	const builtPage = readFileSync(indexPath, 'utf8');
	const shells = [
		...hostPages.hostPages(routedHost).map(({ meta, path }) => ({ file: hostPages.shellFileName(path), meta })),
		{ file: NOT_FOUND_SHELL, meta: hostPages.hostNotFoundMeta(routedHost) },
	];

	for (const { file } of shells) {
		if (file !== 'index.html' && existsSync(join(outputDirectory, file))) {
			fail(`${join(outputDirectory, file)} already exists: the build wrote a file where a page's shell goes. Rename one of them.`);
		}
	}
	for (const { file, meta } of shells) {
		const path = join(outputDirectory, file);

		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, writeShellHead(builtPage, meta));
	}
	console.log(`→ write-route-shells: ${host}: ${String(shells.length - 1)} page shells and ${NOT_FOUND_SHELL} in ${outputDirectory}`);
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
