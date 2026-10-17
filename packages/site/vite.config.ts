/**
 * Vite configuration for `@filter-enginez/site` — `filterenginez.com`: the landing page, the
 * "How the engine works" page and the comparison page.
 *
 * @remarks
 * Four HTML entry points. For every one Vite bundles `src/styles.css` (which pulls
 * `@filter-enginez/ui-styles` and, through it, the brand tokens and the self-hosted fonts out of
 * `@filter-enginez/brand`, hashed for long-lived caching) and copies `public/` (`robots.txt` and the
 * `_headers` that lets browsers keep those hashed files) as-is. `404.html` ships no JavaScript, and
 * `index.html` ships one small module, `src/home/main.ts`, which reveals and wires the install command's
 * copy button (the page reads and works in full without it; `tests/tooling/cloudflareDeploy.test.ts`
 * holds it to that one script). No page loads the modulepreload polyfill: every browser the site
 * supports either preloads modules itself or loads them a moment later without the hint, and the home
 * page has none to preload.
 *
 * ### Each page carries its stylesheet, and asks for its fonts from its head
 *
 * {@link criticalAssets} replaces each page's stylesheet link with the stylesheet itself and adds a
 * preload for each font its first screen sets, so the first render waits on the HTML alone rather than
 * on a second round trip for the CSS and a third for the fonts (`src/criticalAssets.ts`). The
 * inlined stylesheets are then dropped from the build, since no page links them any more.
 *
 * ### `sitemap.xml` is generated
 *
 * {@link sitemap} writes it into the build from the route registries, for every host under
 * filterenginez.com (`src/sitemap/sitemap.ts`); `public/robots.txt` names it, as every app's does.
 *
 * ### `how-it-works.html` is rendered at build time, then enhanced
 *
 * Its text — the eight algorithm bands, the act-two divider, the table of contents and the
 * benchmark's reference numbers — is written into the HTML by {@link pagePrerender} from the
 * shared content model, so the page reads in full without JavaScript. Its one module script,
 * `src/how-it-works/main.ts`, then mounts the animated figures and the live benchmark into the
 * placeholders that markup leaves. The hook runs in the dev server too, so `pnpm dev` serves exactly
 * the markup the build ships, at `/how-it-works`.
 *
 * ### `compare.html` is rendered at build time, then re-rendered for its query
 *
 * The same arrangement, by {@link pagePrerender}: the build writes a cold visit to the default dataset,
 * linked to the deployed apps, into the page (`src/compare/compareView.ts`), so it reads in full without
 * JavaScript. Its module script, `src/compare/main.ts`, then renders the view the visitor asked for —
 * the dataset, a preset, or the `?f=` an app's Compare button sent — with the same function.
 *
 * ### Brand images come from their canonical files, at build time
 *
 * The icon set (favicons, the ICO, the app icons and the web manifest), the mark and the Open Graph card
 * are emitted into the build by {@link brandImages} straight from the brand package, where they are
 * maintained as byte copies of the design system's exports, rather than committed here as copies that
 * could drift. They keep fixed names, with no hash, because other systems hold their URLs: social cards
 * cache `og:image`, browsers and search engines ask for `/favicon.ico` and `/apple-touch-icon.png` by
 * convention, and the manifest names its icons. In development the same map is served by a middleware,
 * so `pnpm dev` shows exactly what ships.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, runnerImport } from 'vite';

import type * as CompareView from './src/compare/compareView.js';
import type * as CriticalAssets from './src/criticalAssets.js';
import type * as HowItWorksPrerender from './src/how-it-works/prerender.js';
import type * as Sitemap from './src/sitemap/sitemap.js';

const require = createRequire(import.meta.url);

/**
 * The brand files the site serves at its root: the icon set every host serves (the same list as
 * `ICON_SET` in `scripts/sync-brand-assets.mjs`, which `tests/tooling/brandAssets.test.ts` holds the
 * two to), the full logomark and the Open Graph card.
 */
const BRAND_FILES: readonly string[] = [
	'apple-touch-icon.png',
	'favicon-16.png',
	'favicon-32.png',
	'favicon-48.png',
	'favicon-96.png',
	'favicon.ico',
	'favicon.svg',
	'icon-192.png',
	'icon-512-maskable.png',
	'icon-512.png',
	'mark.svg',
	'og-card.png',
	'site.webmanifest',
];

/**
 * Each image the page serves at the site root, and the canonical file in the brand package it is
 * emitted from.
 *
 * @remarks
 * A `Map` rather than an object literal: a request path is untrusted input, and an object lookup would
 * also answer for inherited names such as `/constructor`. `get` returns `string | undefined` under any
 * compiler options, too, so the type-aware lint of this file does not depend on which tsconfig ESLint
 * borrows for a file outside every `include`.
 */
const BRAND_IMAGES: ReadonlyMap<string, string> = new Map(
	BRAND_FILES.map((name) => [name, require.resolve(`@filter-enginez/brand/assets/${name}`)]),
);

/** Content types for the dev-server half of {@link brandImages}, by file extension. */
const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
	['.ico', 'image/x-icon'],
	['.png', 'image/png'],
	['.svg', 'image/svg+xml'],
	['.webmanifest', 'application/manifest+json'],
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

/** The how-it-works page's HTML entry. */
const HOW_IT_WORKS_ENTRY = fileURLToPath(new URL('how-it-works.html', import.meta.url));

/** The comparison page's HTML entry. */
const COMPARE_ENTRY = fileURLToPath(new URL('compare.html', import.meta.url));

/** The module that renders the how-it-works page's text (`prerender.ts`). */
const HOW_IT_WORKS_PRERENDER_MODULE = fileURLToPath(new URL('src/how-it-works/prerender.ts', import.meta.url));

/** The module that builds the sitemap (`sitemap.ts`). */
const SITEMAP_MODULE = fileURLToPath(new URL('src/sitemap/sitemap.ts', import.meta.url));

/** The module that inlines a built page's stylesheets and preloads its fonts (`criticalAssets.ts`). */
const CRITICAL_ASSETS_MODULE = fileURLToPath(new URL('src/criticalAssets.ts', import.meta.url));

/** The module that renders the comparison page's view (`compareView.ts`). */
const COMPARE_PRERENDER_MODULE = fileURLToPath(new URL('src/compare/compareView.ts', import.meta.url));

/**
 * Each HTML entry rendered at build time, and the function that renders it.
 *
 * @remarks
 * A `Map` keyed by the entry's absolute path, so a lookup answers only for these two files and every
 * other entry passes through untouched.
 */
const PAGE_PRERENDERS: ReadonlyMap<string, (html: string) => Promise<string>> = new Map([
	[
		HOW_IT_WORKS_ENTRY,
		async (html: string) =>
			(await runnerImport<typeof HowItWorksPrerender>(HOW_IT_WORKS_PRERENDER_MODULE, { root: PACKAGE_ROOT })).module
				.prerenderHowItWorks(html),
	],
	[
		COMPARE_ENTRY,
		async (html: string) =>
			(await runnerImport<typeof CompareView>(COMPARE_PRERENDER_MODULE, { root: PACKAGE_ROOT })).module.prerenderCompare(
				html,
			),
	],
]);

/**
 * Render the how-it-works page's text and the comparison page's cold visit into their HTML, in the
 * build and in the dev server.
 *
 * @remarks
 * `order: 'pre'` runs it before Vite's own HTML processing, so the generated markup is treated exactly
 * like hand-written markup. Every other entry passes through untouched. A missing or duplicated slot
 * marker throws (see `prerender.ts` and `compareView.ts`), failing the build rather than shipping a
 * page with nothing to say.
 *
 * ### Why `runnerImport` rather than an `import` at the top of this file
 *
 * Both renderers read from `@filter-enginez/examples-shared`, a workspace package whose exports point
 * at TypeScript source. Vite loads this config with every bare import left to Node, which cannot
 * resolve that source's `.js`-suffixed relative imports. `runnerImport` loads the module through
 * Vite's own module runner instead — the resolver every app's dev server already uses for that package
 * — at the moment the page is rendered. In the dev server that also means an edit to the content shows
 * on the next reload, with no restart.
 *
 * @returns The Vite plugin.
 */
function pagePrerender(): Plugin {
	return {
		name: 'filter-enginez-page-prerender',
		transformIndexHtml: {
			handler: async (html, context) => {
				const render = PAGE_PRERENDERS.get(context.filename);

				return render === undefined ? html : render(html);
			},
			order: 'pre',
		},
	};
}

/**
 * The time of the commit checked out, as git prints it, or `null` outside a git checkout.
 *
 * @returns The `HEAD` commit time (`%cI`, ISO 8601 with its offset), or `null`.
 */
function headCommitTime(): string | null {
	try {
		return execFileSync('git', ['log', '-1', '--format=%cI', 'HEAD'], { cwd: PACKAGE_ROOT, encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

/**
 * Generate `sitemap.xml` from the sites' page lists: into the build, and at `/sitemap.xml` in the dev
 * server.
 *
 * @remarks
 * `src/sitemap/sitemap.ts` decides what it lists and why; this loads it through `runnerImport`, for
 * the reason {@link pagePrerender} gives, and dates it with `SOURCE_DATE_EPOCH` or the `HEAD` commit
 * time. A sitemap that cannot be dated fails the build.
 *
 * @returns The Vite plugin.
 */
function sitemap(): Plugin {
	/** Build the document. */
	const render = async (): Promise<string> => {
		const { module } = await runnerImport<typeof Sitemap>(SITEMAP_MODULE, { root: PACKAGE_ROOT });

		return module.renderSitemap(module.sitemapEntries(), module.sitemapLastmod(process.env['SOURCE_DATE_EPOCH'], headCommitTime()));
	};

	return {
		configureServer(server) {
			server.middlewares.use('/sitemap.xml', (_request, response) => {
				void render().then((xml) => {
					response.setHeader('content-type', 'application/xml; charset=utf-8');
					response.end(xml);
				});
			});
		},
		async generateBundle() {
			this.emitFile({ fileName: 'sitemap.xml', source: await render(), type: 'asset' });
		},
		name: 'filter-enginez-sitemap',
	};
}

/**
 * The brand fonts every page's first screen sets, by the file name of the subset in
 * `@filter-enginez/brand`, each preloaded from every page's head by {@link criticalAssets}.
 *
 * @remarks
 * All three, on all four pages, because the shared header alone sets two of them before any page
 * content: its wordmark and page links in the display face, its subtitle in the mono face. Below it,
 * every page's first screen has body text in Inter, and the home page's actions and install command are
 * mono too. A font the first screen did not set would be wasted bandwidth ahead of the ones it does.
 */
const PRELOADED_FONTS: readonly string[] = ['FilterEngineZDisplay-Subset.woff2', 'Inter-Subset.woff2', 'JetBrainsMono-Subset.woff2'];

/**
 * Inline each built page's stylesheets and preload its first screen's fonts; then drop the stylesheets
 * no page links any more.
 *
 * @remarks
 * Build only: the dev server injects CSS through its client, with no stylesheet file to inline. The
 * HTML hook runs `post`, after Vite has written each page's asset links, so it sees the final hashed
 * names; the bundle hook runs `post` too, after every page has been written, so a stylesheet two pages
 * share is still there for the second. A stylesheet that a JavaScript chunk names (a CSS dependency of a
 * dynamic import) stays in the build. The functions themselves are loaded through `runnerImport`, as
 * {@link pagePrerender}'s are: this config's bundler leaves a TypeScript module's `.js` import unresolved.
 *
 * @returns The Vite plugin.
 */
function criticalAssets(): Plugin {
	/** Every stylesheet some page inlined, by its file name in the bundle. */
	const inlinedStylesheets = new Set<string>();

	return {
		apply: 'build',
		generateBundle: {
			handler(_options, bundle) {
				const chunkCode = Object.values(bundle)
					.map((output) => (output.type === 'chunk' ? output.code : ''))
					.join('\n');

				for (const fileName of inlinedStylesheets) {
					if (!chunkCode.includes(fileName)) {
						// A bundle is a plain record of file name to output, and deleting an entry is how a
						// plugin removes a file from the build.
						Reflect.deleteProperty(bundle, fileName);
					}
				}
			},
			order: 'post',
		},
		name: 'filter-enginez-critical-assets',
		transformIndexHtml: {
			handler: async (html, context) => {
				if (context.bundle === undefined) {
					throw new Error(`${context.filename}: the build passed no bundle to read the stylesheets from.`);
				}

				const { inlineStylesheets, preloadFonts } = (await runnerImport<typeof CriticalAssets>(CRITICAL_ASSETS_MODULE, { root: PACKAGE_ROOT })).module;
				const assets = new Map(
					Object.values(context.bundle).flatMap((output) => (output.type === 'asset' ? [[`/${output.fileName}`, output] as const] : [])),
				);
				const page = inlineStylesheets(html, (href) => {
					const source = assets.get(href)?.source;

					return typeof source === 'string' || source === undefined ? source : new TextDecoder().decode(source);
				});
				const fontHrefs = PRELOADED_FONTS.map((name) => {
					const font = [...assets.values()].find((asset) => asset.originalFileNames.some((original) => original.endsWith(`/${name}`)));

					if (font === undefined) {
						throw new Error(`${context.filename}: the build has no ${name} to preload.`);
					}

					return `/${font.fileName}`;
				});

				for (const href of page.inlined) {
					inlinedStylesheets.add(href.slice(1));
				}

				return preloadFonts(page.html, fontHrefs);
			},
			order: 'post',
		},
	};
}

export default defineConfig({
	build: {
		// The polyfill makes `<link rel="modulepreload">` work in browsers without it, by fetching the
		// listed chunks from a script of its own. Every browser the site supports either has
		// modulepreload or loads the same chunks a moment later from the entry's imports, so the polyfill
		// would be one more script on every page for nothing.
		modulePreload: { polyfill: false },
		rolldownOptions: {
			input: {
				compare: COMPARE_ENTRY,
				howItWorks: HOW_IT_WORKS_ENTRY,
				index: fileURLToPath(new URL('index.html', import.meta.url)),
				notFound: fileURLToPath(new URL('404.html', import.meta.url)),
			},
		},
		target: 'es2022',
	},
	plugins: [brandImages(), pagePrerender(), sitemap(), criticalAssets()],
	server: {
		fs: {
			// The brand fonts referenced by `tokens.css` live in a sibling package.
			allow: ['../..'],
		},
		host: '127.0.0.1',
		// 24617 — the next free slot after the documentation site's 24616. In the Playwright port map, because
		// the how-it-works and compare specs drive this server and every app's header links to it in
		// development (`SITE.devOrigin` in examples-shared's verticals registry). `strictPort` so a
		// collision fails loudly.
		port: 24617,
		strictPort: true,
	},
});
