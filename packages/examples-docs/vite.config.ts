/**
 * Vite configuration for `@filter-enginez/examples-docs` — the standalone documentation site.
 *
 * @remarks
 * Deliberately minimal versus the demo apps: the docs slice is self-contained (its styling ships as an
 * injected `DOCS_CSS` string, its only runtime workspace import is `@filter-enginez/core`, and the
 * in-browser playground runs `createFilterEngine` on the MAIN THREAD over a lazily-imported corpus).
 * So there is no Tailwind, no Leaflet, no worker chunk, and no `/api` proxy here — just the React
 * plugin, the `process.env` shim every browser bundle needs, the load-bearing single-copy dedupe, and
 * two build-only edits to `index.html`: the first screen's font preloads (shared with the demo apps)
 * and the modulepreloads of the docs shell ({@link preloadDocsShell}).
 */

import react from '@vitejs/plugin-react';
import { defineConfig, type HtmlTagDescriptor, type Plugin, runnerImport } from 'vite';

import { criticalCssPlugin } from '../../scripts/lib/critical-css.mjs';
import { fontPreloadsPlugin } from '../../scripts/lib/font-preloads.mjs';
import { SIDE_EFFECT_FREE_BARRELS } from '../../scripts/lib/tree-shaking.mjs';

/**
 * The modules every first visit to this site renders, by the end of their source path: the docs
 * layout, the docs home (the site's root), and the page catalog the head tags are written from.
 */
const DOCS_SHELL_MODULES: readonly string[] = [
	'/src/docs/DocsLayout.tsx',
	'/src/docs/DocsHomePage.tsx',
	'/src/page-meta/docsPageMeta.ts',
];

/**
 * Preload the docs shell's chunks from `index.html`, so the first screen needs no request the HTML
 * did not already start.
 *
 * @remarks
 * The site mounts the shared documentation route, whose layout and pages are lazy: the React apps serve the
 * docs under `/docs` beside their own pages, and a static import there would put the docs in their
 * startup bundles. Here the docs are the whole site, so lazy alone costs a round trip — the browser
 * learns it needs the layout and the home page only once the entry has run and the router has matched
 * the URL. This lists those chunks, and every chunk they import statically, as
 * `<link rel="modulepreload">` in the built page, so they download in parallel with the entry. The code
 * stays split, so the React apps are unaffected.
 *
 * A module named in {@link DOCS_SHELL_MODULES} that is in no chunk fails the build: after a rename,
 * a preload that silently matched nothing would read exactly like one that worked. Build only, like
 * every hashed-name edit.
 *
 * @returns The Vite plugin.
 */
function preloadDocsShell(): Plugin {
	return {
		apply: 'build',
		name: 'filter-enginez-preload-docs-shell',
		transformIndexHtml: {
			handler(html, context): HtmlTagDescriptor[] {
				if (context.bundle === undefined) {
					throw new Error(`${context.filename}: the build passed no bundle to find the docs shell in.`);
				}

				const chunks = new Map(
					Object.values(context.bundle).flatMap((output) => (output.type === 'chunk' ? [[output.fileName, output] as const] : [])),
				);
				const pending = DOCS_SHELL_MODULES.map((module) => {
					const chunk = [...chunks.values()].find((candidate) => candidate.moduleIds.some((id) => id.endsWith(module)));

					if (chunk === undefined) {
						throw new Error(`${context.filename}: no chunk holds ${module}, so the docs shell cannot be preloaded.`);
					}

					return chunk.fileName;
				});
				const preloads = new Set<string>();

				for (let fileName = pending.pop(); fileName !== undefined; fileName = pending.pop()) {
					if (!preloads.has(fileName)) {
						preloads.add(fileName);
						pending.push(...(chunks.get(fileName)?.imports ?? []));
					}
				}

				return [...preloads]
					.filter((fileName) => !html.includes(`/${fileName}"`))
					.sort()
					.map((fileName) => ({
						attrs: { crossorigin: true, href: `/${fileName}`, rel: 'modulepreload' },
						injectTo: 'head',
						tag: 'link',
					}));
			},
			order: 'post',
		},
	};
}

export default defineConfig({
	build: {
		// The brand package's barrels re-export every brand component; declared free of side effects, they
		// no longer pull a component only some other page draws into the first screen's chunks
		// (scripts/lib/tree-shaking.mjs).
		rolldownOptions: { treeshake: { moduleSideEffects: [...SIDE_EFFECT_FREE_BARRELS]}},
		sourcemap: true,
		target: 'es2022',
	},
	/**
	 * Inline Node-style globals CJS-flavored transitive deps reference at module top. Without these the
	 * dev server runs but throws `ReferenceError: process is not defined` on the first `process.env`
	 * read. `process.env.NODE_ENV` becomes the string literal; other reads land on the empty-object stub
	 * (correct "unset" semantics in a browser). `global` → `globalThis` aliases the Node global object.
	 */
	define: {
		global: 'globalThis',
		'process.env': '{}',
		'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
	},
	optimizeDeps: {
		// Only bare npm deps — never the pnpm-linked `@filter-enginez/*` `.ts`-source workspace packages,
		// which Vite would snapshot once and then serve stale on every source edit.
		include: ['react', 'react-dom', 'react-dom/client'],
	},
	// `criticalCssPlugin` comes after `preloadDocsShell`: the docs shell it preloads draws from the whole
	// stylesheet, so the page preloads the sheet as well (scripts/lib/critical-css.mjs).
	plugins: [react(), fontPreloadsPlugin(), preloadDocsShell(), criticalCssPlugin({ runnerImport })],
	resolve: {
		// One React + one signals-core copy across the linked workspace graph. Comlink is kept in the
		// dedupe list for parity with the React apps even though the docs never spawn a worker.
		dedupe: ['react', 'react-dom', '@preact/signals-core', 'comlink'],
	},
	server: {
		host: '127.0.0.1',
		// 24616 — the next free slot after the demo apps + API server (see the port map in
		// `playwright.config.ts`). `strictPort` so a collision fails loudly instead of drifting.
		port: 24616,
		strictPort: true,
	},
});
