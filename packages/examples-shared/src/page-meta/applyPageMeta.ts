/**
 * `applyPageMeta` — write a page's title, description, canonical link and robots directive into the
 * document head.
 *
 * @remarks
 * The single-page apps call it on every navigation, with the metadata `./pageMeta.ts` (or
 * `./docsPageMeta.ts`) gives the new route; SvelteKit renders the same tags in its root layout instead.
 * Each tag is updated in place when the shell already has one, created when it has none, and removed
 * when the page should not carry it, so a navigation never leaves the previous route's canonical behind:
 *
 * - an indexable page gets `<link rel="canonical">` and no robots directive;
 * - a page that is not indexed (`canonicalUrl: null`) gets `<meta name="robots" content="noindex">`
 *   and no canonical.
 *
 * Search engines that render JavaScript read the tags as the route leaves them.
 *
 * @packageDocumentation
 */

import { type PageMeta } from './pageMeta.js';

/**
 * Find the head element matching a selector, creating it from a tag name and attributes when absent.
 *
 * @param document - The document to write.
 * @param selector - Matches the element when it exists.
 * @param tagName - What to create when it does not.
 * @param attributes - The identifying attributes of a created element.
 * @returns The element, now in the head.
 */
function ensureHeadElement(
	document: Document,
	selector: string,
	tagName: 'link' | 'meta',
	attributes: Readonly<Record<string, string>>,
): HTMLElement {
	const existing = document.head.querySelector<HTMLElement>(selector);

	if (existing !== null) {
		return existing;
	}

	const created = document.createElement(tagName);

	for (const [name, value] of Object.entries(attributes)) {
		created.setAttribute(name, value);
	}
	document.head.append(created);

	return created;
}

/**
 * Write a page's metadata into the document head.
 *
 * @param document - The document to write; the app's own `document`.
 * @param meta - The page's metadata.
 */
export function applyPageMeta(document: Document, meta: PageMeta): void {
	document.title = meta.title;
	ensureHeadElement(document, 'meta[name="description"]', 'meta', { name: 'description' }).setAttribute('content', meta.description);

	if (meta.canonicalUrl === null) {
		document.head.querySelector('link[rel="canonical"]')?.remove();
		ensureHeadElement(document, 'meta[name="robots"]', 'meta', { name: 'robots' }).setAttribute('content', 'noindex');

		return;
	}
	document.head.querySelector('meta[name="robots"]')?.remove();
	ensureHeadElement(document, 'link[rel="canonical"]', 'link', { rel: 'canonical' }).setAttribute('href', meta.canonicalUrl);
}
