/**
 * `showPageMeta` — write the title, description and canonical link of the route being shown into the
 * document head, once they are known.
 *
 * @remarks
 * For the apps whose router reports the route as a path and leaves the head to them (the two React demo
 * apps and the documentation site, through `examples-shared/app-router`): each time the path changes,
 * the app shows that path's metadata, and cancels the previous path's.
 *
 * The metadata may arrive asynchronously, because the React apps load the documentation's titles on
 * demand. A resolution that arrives after it was cancelled is dropped, so a slow lookup can never write
 * the previous route's canonical over the current one. A lookup that fails (a chunk that cannot load)
 * leaves the head as the shell or the previous route left it; the page itself reports the failure.
 *
 * Framework-free, like the rest of this subpath: the caller decides when the path has changed.
 *
 * @packageDocumentation
 */

import { applyPageMeta } from './applyPageMeta.js';
import { type PageMeta } from './pageMeta.js';

/** A path's metadata, now or once loaded. */
export type PageMetaResolver = (pathname: string) => PageMeta | Promise<PageMeta>;

/**
 * Apply a path's metadata to the head as soon as it resolves, unless cancelled first.
 *
 * @param pathname - The path being shown.
 * @param resolve - The metadata for a path, now or once loaded.
 * @param document - The document to write; the app's own by default.
 * @returns A cancel function, which drops the resolution if it has not arrived yet.
 */
export function showPageMeta(pathname: string, resolve: PageMetaResolver, document: Document = globalThis.document): () => void {
	let isCurrent = true;

	void Promise.resolve(resolve(pathname)).then(
		(meta) => {
			if (isCurrent) {
				applyPageMeta(document, meta);
			}
		},
		() => undefined,
	);

	return () => {
		isCurrent = false;
	};
}
