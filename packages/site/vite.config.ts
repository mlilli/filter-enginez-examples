/**
 * Vite configuration for `@filter-enginez/site` — `filterenginez.com`: the landing page and the
 * "How the engine works" page.
 *
 * @remarks
 * Three HTML entry points. `index.html` and `404.html` ship no JavaScript: for them Vite bundles
 * `src/styles.css` (which pulls the brand tokens and the self-hosted fonts out of
 * `@filter-enginez/brand`, hashed for long-lived caching) and copies `public/` (`robots.txt`,
 * `sitemap.xml`) as-is.
 *
 * ### `how-it-works.html` is rendered at build time, then enhanced
 *
 * Its text — the eight algorithm bands, the act-two divider, the table of contents and the
 * benchmark's reference numbers — is written into the HTML by {@link howItWorksPrerender} from the
 * shared content model, so the page reads in full without JavaScript. Its one module script,
 * `src/how-it-works/main.ts`, then mounts the animated figures and the live benchmark into the
 * placeholders that markup leaves. The hook runs in the dev server too, so `pnpm dev` serves exactly
 * the markup the build ships, at `/how-it-works`.
 *
 * ### Brand images come from their canonical files, at build time
 *
 * The favicons, the mark, the Apple touch icon and the Open Graph card are emitted into the build by
 * {@link brandImages} straight from where they are maintained — the brand package and the design
 * system — rather than committed here as copies that could drift. They keep fixed names, with no hash,
 * because other systems hold their URLs: social cards cache `og:image`, and browsers ask for
 * `/favicon.svg` and `/apple-touch-icon.png` by convention. In development the same map is served by
 * a middleware, so `pnpm dev` shows exactly what ships.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, runnerImport } from 'vite';

import type * as HowItWorksPrerender from './src/how-it-works/prerender.js';

const require = createRequire(import.meta.url);

/** The design system's raster exports, for the two images the brand package does not carry. */
const DESIGN_SYSTEM_PNG = fileURLToPath(new URL('../../docs/branding/design-system/assets/logomark/png/', import.meta.url));

/**
 * Each image the page serves at the site root, and the canonical file it is emitted from.
 *
 * @remarks
 * A `Map` rather than an object literal: a request path is untrusted input, and an object lookup would
 * also answer for inherited names such as `/constructor`. `get` returns `string | undefined` under any
 * compiler options, too, so the type-aware lint of this file does not depend on which tsconfig ESLint
 * borrows for a file outside every `include`.
 */
const BRAND_IMAGES: ReadonlyMap<string, string> = new Map([
	['apple-touch-icon.png', `${DESIGN_SYSTEM_PNG}apple-touch-icon-180.png`],
	['favicon-16.png', require.resolve('@filter-enginez/brand/assets/favicon-16.png')],
	['favicon-32.png', require.resolve('@filter-enginez/brand/assets/favicon-32.png')],
	['favicon.svg', require.resolve('@filter-enginez/brand/assets/favicon.svg')],
	['mark.svg', require.resolve('@filter-enginez/brand/assets/mark.svg')],
	['og-card.png', `${DESIGN_SYSTEM_PNG}og-card.png`],
]);

/** Content types for the dev-server half of {@link brandImages}, by file extension. */
const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
	['.png', 'image/png'],
	['.svg', 'image/svg+xml'],
]);

/**
 * Serve {@link BRAND_IMAGES} in development and emit them into the production build.
 *
 * @returns The Vite plugin.
 */
function brandImages(): Plugin {
	return {
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const fileName = (request.url ?? '').split('?')[0]?.slice(1) ?? '';
				const source = BRAND_IMAGES.get(fileName);

				if (source === undefined) {
					next();

					return;
				}

				response.setHeader('content-type', CONTENT_TYPES.get(extname(fileName)) ?? 'application/octet-stream');
				response.end(readFileSync(source));
			});
		},
		generateBundle() {
			for (const [fileName, source] of BRAND_IMAGES) {
				this.emitFile({ fileName, source: readFileSync(source), type: 'asset' });
			}
		},
		name: 'filter-enginez-brand-images',
	};
}

/** This package's directory, the root the prerender module is loaded against. */
const PACKAGE_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** The how-it-works page's HTML entry, the one file {@link howItWorksPrerender} transforms. */
const HOW_IT_WORKS_ENTRY = fileURLToPath(new URL('how-it-works.html', import.meta.url));

/** The module that renders the page's text (`prerender.ts`), loaded by {@link howItWorksPrerender}. */
const PRERENDER_MODULE = fileURLToPath(new URL('src/how-it-works/prerender.ts', import.meta.url));

/**
 * Render the how-it-works page's text into `how-it-works.html`, in the build and in the dev server.
 *
 * @remarks
 * `order: 'pre'` runs it before Vite's own HTML processing, so the generated markup is treated exactly
 * like hand-written markup. Every other entry passes through untouched. A missing or duplicated slot
 * marker throws (see `prerender.ts`), failing the build rather than shipping a page with no text.
 *
 * ### Why `runnerImport` rather than an `import` at the top of this file
 *
 * `prerender.ts` reads the content model from `@filter-enginez/examples-shared`, a workspace package
 * whose exports point at TypeScript source. Vite loads this config with every bare import left to
 * Node, which cannot resolve that source's `.js`-suffixed relative imports. `runnerImport` loads the
 * module through Vite's own module runner instead — the resolver every app's dev server already uses
 * for that package — at the moment the page is rendered. In the dev server that also means an edit to
 * the content shows on the next reload, with no restart.
 *
 * @returns The Vite plugin.
 */
function howItWorksPrerender(): Plugin {
	return {
		name: 'filter-enginez-how-it-works-prerender',
		transformIndexHtml: {
			handler: async (html, context) => {
				if (context.filename !== HOW_IT_WORKS_ENTRY) {
					return html;
				}

				const { module } = await runnerImport<typeof HowItWorksPrerender>(PRERENDER_MODULE, { root: PACKAGE_ROOT });

				return module.prerenderHowItWorks(html);
			},
			order: 'pre',
		},
	};
}

export default defineConfig({
	build: {
		rolldownOptions: {
			input: {
				howItWorks: HOW_IT_WORKS_ENTRY,
				index: fileURLToPath(new URL('index.html', import.meta.url)),
				notFound: fileURLToPath(new URL('404.html', import.meta.url)),
			},
		},
		target: 'es2022',
	},
	plugins: [brandImages(), howItWorksPrerender()],
	server: {
		fs: {
			// The brand fonts referenced by `tokens.css` live in a sibling package.
			allow: ['../..'],
		},
		host: '127.0.0.1',
		// 5181 — the next free slot after the documentation site's 5180. In the Playwright port map, because
		// the how-it-works spec drives this server and every app's landing page links to it in
		// development (`SITE.devOrigin` in examples-shared's verticals registry). `strictPort` so a
		// collision fails loudly.
		port: 5181,
		strictPort: true,
	},
});
