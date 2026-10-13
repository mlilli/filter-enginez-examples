/**
 * Vite configuration for `@filter-enginez/site` — the static `filterenginez.com` landing page.
 *
 * @remarks
 * Two HTML entry points and no JavaScript in either: Vite's job here is to bundle `src/styles.css`
 * (which pulls the brand tokens and the self-hosted fonts out of `@filter-enginez/brand`, hashed for
 * long-lived caching) and to copy `public/` (`robots.txt`, `sitemap.xml`) as-is.
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
import { defineConfig, type Plugin } from 'vite';

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

				response.setHeader('content-type', CONTENT_TYPES.get(extname(fileName)) ??'application/octet-stream');
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

export default defineConfig({
	build: {
		rolldownOptions: {
			input: {
				index: fileURLToPath(new URL('index.html', import.meta.url)),
				notFound: fileURLToPath(new URL('404.html', import.meta.url)),
			},
		},
		target: 'es2022',
	},
	plugins: [brandImages()],
	server: {
		fs: {
			// The brand fonts referenced by `tokens.css` live in a sibling package.
			allow: ['../..'],
		},
		host: '127.0.0.1',
		// 5181 — the next free slot after the documentation site's 5180. Not in the Playwright port map:
		// the end-to-end suite does not drive this page. `strictPort` so a collision fails loudly.
		port: 5181,
		strictPort: true,
	},
});
