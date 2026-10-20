/**
 * `@filter-enginez/examples-shared/page-meta` — each demo page's title, description and canonical URL,
 * and the helper that writes them into the document head.
 *
 * @remarks
 * React-free: the four non-React apps import it on every route. The documentation's pages have their own
 * subpath, `./page-meta-docs`, loaded only where documentation is served.
 *
 * @packageDocumentation
 */

export { applyPageMeta } from './applyPageMeta.js';
export {
	BRAND_NAME,
	DOCS_BASE_PATH,
	DOCS_ORIGIN,
	docsCanonicalUrl,
	isDocsPath,
	notFoundPageMeta,
	type PageMeta,
	verticalIndexablePaths,
	type VerticalPage,
	verticalPageMeta,
	verticalPages,
} from './pageMeta.js';
export { type PageMetaResolver, showPageMeta } from './showPageMeta.js';
