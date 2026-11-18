/**
 * The pure half of `../prerender-routes.mjs`: where each host's app root sits in its HTML, which routes a
 * host prerenders, and how a snapshot is written into a route's shell.
 *
 * @remarks
 * Kept apart from the browser-driving script so `tests/tooling` can check it without a browser. The
 * ids and attributes come from `examples-shared`'s `prerender-core` (`PRERENDER`), the one place the
 * build step, the apps and the server read them.
 *
 * @packageDocumentation
 */

import { join } from 'node:path';

import { REPO_ROOT } from './route-shells.mjs';
import { importTypeScript } from './typescript-source.mjs';

/** `examples-shared`'s prerender module: the constants and the inlined picker. */
export const PRERENDER_MODULE = join(REPO_ROOT, 'packages/examples-shared/src/prerender/index.ts');

/**
 * Each prerendering host's app root: the selector its booted page is read from, and the opening tag the
 * snapshot is written in front of in the shell. Every shell holds that tag exactly once.
 *
 * @type {Readonly<Record<import('./prerender-shells.d.mts').PrerenderHost, import('./prerender-shells.d.mts').AppRoot>>}
 */
export const APP_ROOTS = {
	angular: { selector: 'fe-root', sibling: 'fe-root', tag: '<fe-root>' },
	'react-plain': { selector: '#root', sibling: '#root', tag: '<div id="root">' },
	'react-rtk': { selector: '#root', sibling: '#root', tag: '<div id="root">' },
	sveltekit: { selector: 'body > div[style="display: contents"]', sibling: 'div[style="display: contents"] > *', tag: '<div style="display: contents">' },
	vanilla: { selector: '#app', sibling: '#app', tag: '<div id="app">' },
	vue: { selector: '#app', sibling: '#app', tag: '<div id="app">' },
};

/**
 * Load the prerender constants and the picker's source.
 *
 * @returns {Promise<import('./prerender-shells.d.mts').PrerenderModule>} The module.
 */
export async function loadPrerenderModule() {
	return /** @type {import('./prerender-shells.d.mts').PrerenderModule} */ (await importTypeScript(PRERENDER_MODULE));
}

/**
 * The verticals registry's apps and their routes.
 *
 * @returns {Promise<readonly import('./prerender-shells.d.mts').VerticalRoutes[]>} Each app's id and routes.
 */
export async function loadVerticalRoutes() {
	const { VERTICALS } = /** @type {{ VERTICALS: readonly import('./prerender-shells.d.mts').VerticalRoutes[] }} */ (
		await importTypeScript(join(REPO_ROOT, 'packages/examples-shared/src/verticals/verticals.ts'))
	);

	return VERTICALS;
}

/**
 * The dataset routes a host prerenders: every client-booted dataset route it serves, and its
 * server-backed ones unless the host renders those on the server itself (SvelteKit).
 *
 * @param {import('./prerender-shells.d.mts').PrerenderHost} host - The host.
 * @param {readonly string[]} routes - Its routes, from the verticals registry.
 * @param {import('./prerender-shells.d.mts').PrerenderModule} prerender - {@link loadPrerenderModule}.
 * @returns {string[]} The paths, in the registry's order.
 */
export function prerenderedRoutes(host, routes, prerender) {
	return routes.filter(
		(path) =>
			prerender.CLIENT_DATASET_ROUTE_PATHS.includes(path) ||
			(host !== 'sveltekit' && prerender.SERVER_DATASET_ROUTE_PATHS.includes(path)),
	);
}

/**
 * Escape text for an attribute value or a `<style>` element's neighbor: only what could end the context.
 *
 * @param {string} value - The text.
 * @returns {string} It, with `&`, `"` and `<` escaped.
 */
function escapeAttribute(value) {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/**
 * Write a route's snapshot into its shell.
 *
 * @remarks
 * Into the head go the stylesheets the booted page had and the shell does not (the Vite apps load their
 * CSS from JavaScript, Angular adds its component styles at run time), as render-blocking links, so the
 * snapshot is styled as the live page was from the first paint. No font preloads beyond the shell's own:
 * the text paints at once in its size-matched fallback face (`font-display: swap`), and every byte
 * requested ahead of that first paint delays it on a slow connection. In front of the app root go the two page templates, the two
 * cards templates and the inline picker; the root itself is untouched, so the app boots into it as on
 * any other page.
 *
 * @param {string} shell - The route's HTML shell as the build wrote it.
 * @param {import('./prerender-shells.d.mts').RouteSnapshot} snapshot - What the browser read.
 * @param {import('./prerender-shells.d.mts').AppRoot} root - The host's app root.
 * @param {import('./prerender-shells.d.mts').PrerenderModule} prerender - {@link loadPrerenderModule}.
 * @returns {string} The prerendered shell.
 * @throws {Error} When the shell already holds a snapshot, or does not hold the root tag exactly once.
 */
export function writePrerenderedShell(shell, snapshot, root, prerender) {
	const { PRERENDER } = prerender;

	if (shell.includes(`id="${PRERENDER.phoneTemplateId}"`)) {
		throw new Error('the shell already holds a prerendered page; is the step running twice over one build?');
	}

	const rootAt = shell.indexOf(root.tag);

	if (rootAt === -1 || shell.indexOf(root.tag, rootAt + 1) !== -1) {
		throw new Error(`the shell must hold the app root "${root.tag}" exactly once`);
	}

	const headEnd = shell.indexOf('</head>');

	if (headEnd === -1 || headEnd > rootAt) {
		throw new Error('the shell has no </head> before its app root');
	}

	const absolute = snapshot.missingStylesheets.filter((href) => !href.startsWith('/'));

	if (absolute.length > 0) {
		throw new Error(`a stylesheet must be a site path, not an address the build alone can reach: ${absolute.join(', ')}`);
	}

	const pageAttributes = snapshot.isFullTier ? ` ${PRERENDER.fullTierAttribute}` : '';
	const styles = [
		// The app's root stays transparent while the snapshot's layer exists (`prerender-core` says why).
		`<style>#${PRERENDER.hostId} ~ ${root.sibling} { opacity: 0; }</style>`,
		...snapshot.missingStylesheets.map((href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">`),
		...snapshot.missingStyles.map((css) => `<style>${css.replaceAll('</style', '<\\/style')}</style>`),
	].join('');
	const body = [
		`<template id="${PRERENDER.phoneTemplateId}"${pageAttributes}>${snapshot.phone.page}</template>`,
		`<template id="${PRERENDER.desktopTemplateId}"${pageAttributes}>${snapshot.desktop.page}</template>`,
		`<template id="${PRERENDER.phoneCardsTemplateId}">${snapshot.phone.cards}</template>`,
		`<template id="${PRERENDER.desktopCardsTemplateId}">${snapshot.desktop.cards}</template>`,
		`<script>${prerender.prerenderPickerScript()}</script>`,
	].join('');

	return `${shell.slice(0, headEnd)}${styles}${shell.slice(headEnd, rootAt)}${body}${shell.slice(rootAt)}`;
}
