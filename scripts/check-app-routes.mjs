#!/usr/bin/env node
/**
 * `check-app-routes` — fail a build whose router serves different pages than the page catalog lists.
 *
 *     node ../../scripts/check-app-routes.mjs --host sveltekit     # from examples-sveltekit, in its build
 *
 * @remarks
 * The client-routed hosts make this check as they write their route shells (`write-route-shells.mjs`).
 * The SvelteKit app writes none, because its server renders every route and answers an unknown path
 * with its error page and a 404 by itself; but its routes are the catalog's list as much as any other
 * app's, read by its sitemap entries, its `llms.txt` and the comparison page, so its build runs the
 * same comparison (`lib/route-shells.mjs` says how each router is read).
 *
 * @packageDocumentation
 */

import { checkRouterAgainstCatalog, loadRouteCatalog } from './lib/route-shells.mjs';

const [hostFlag, host, ...extra] = process.argv.slice(2);

if (hostFlag !== '--host' || host === undefined || extra.length > 0) {
	console.error('✗ check-app-routes: usage: node check-app-routes.mjs --host <host>');
	process.exit(1);
}

try {
	const catalog = await loadRouteCatalog();
	const routedHost = /** @type {import('./lib/route-shells.d.mts').RoutedHost} */ (host);

	if (!catalog.hostPages.ROUTED_HOSTS.includes(routedHost)) {
		throw new Error(`"${host}" is not a routed host; expected one of ${catalog.hostPages.ROUTED_HOSTS.join(', ')}.`);
	}

	const paths = checkRouterAgainstCatalog(routedHost, catalog);

	console.log(`→ check-app-routes: ${host}: the router serves exactly the catalog's ${String(paths.length)} pages`);
} catch (error) {
	console.error(`✗ check-app-routes: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
