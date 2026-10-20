/**
 * The Vite plugin that takes each demo app's stylesheet off its page's critical path: the page carries
 * the part of the sheet its first screen can use, and the whole sheet arrives with the code that needs
 * the rest.
 *
 * @remarks
 * Each Vite app has one stylesheet, which styles every route it serves, and Vite links it from the
 * page's head. A browser renders nothing until a linked stylesheet arrives, so every first visit waited
 * a round trip for CSS that was mostly for screens it had not opened: the hub draws the header, the
 * dataset cards and nothing of the filter panel, the result grid or the documentation.
 *
 * So the build does two things, and the page links no stylesheet at all:
 *
 * - **The page carries its first screen's CSS.** The first screen is what the page's own scripts
 *   render: its entry and every chunk the entry imports statically, the same set the browser downloads
 *   before the first render (`scripts/check-startup-budget.mjs` measures it). The plugin reads the
 *   class names those scripts and the page's markup can write, cuts the stylesheet down to the rules
 *   they can match, and replaces the stylesheet link with a `<style>` holding the cut
 *   (`criticalStylesheet` and `inlineStylesheets` in `packages/site/src/criticalAssets.ts`).
 * - **The whole sheet loads with the code that needs it.** Every route the first screen does not draw
 *   arrives through a dynamic `import()`, which Vite's preload helper wraps: it fetches the imported
 *   chunk's dependencies, CSS included, and resolves the import only once that CSS has loaded. The
 *   plugin adds the whole sheet to the dependencies of every `import()` whose code can match a rule the
 *   cut left out (`needsFullStylesheet`), through Vite's `build.modulePreload.resolveDependencies`. So a
 *   route never renders before the rules it uses, and a visit that stays on the hub downloads them only
 *   if it starts loading a route (the React hubs prefetch a dataset's code when its card is hovered).
 *
 * Why that is safe, rule for rule, is `criticalStylesheet`'s to say: the cut is the sheet with rules
 * taken out, never changed or reordered, so a page renders the same with the cut alone (for the screens
 * it can draw) and with the cut and the whole sheet together (for every screen). The whole sheet is
 * the same file, in the same place in the cascade, as before: after the page's own styles, and before
 * the CSS of any chunk loaded after it.
 *
 * ### Which imports carry the whole sheet
 *
 * The code an `import()` adds is its chunk and that chunk's static imports, which Vite passes in. The
 * import carries the sheet when that code writes a class the first screen cannot, required by a
 * selector the cut left out that the app's code as a whole can match (`needsFullStylesheet` explains
 * why that is enough, for routes loaded side by side as much as one after another). A route that needs
 * nothing beyond the cut loads nothing more.
 *
 * When the page's head preloads chunks of its own beyond its first screen's (the documentation site
 * preloads the docs shell every one of its pages renders) and they need the whole sheet, the head
 * preloads the sheet too, so it is fetched as early as before, without holding up the first render.
 *
 * Build only: the dev server injects each module's CSS through its client, with no stylesheet link to
 * replace. The build fails rather than shipping a page that links a stylesheet, one whose CSS the
 * plugin cannot find, or a bundle with no single entry to read.
 *
 * Plain JavaScript, with its types in `critical-css.d.mts`, beside `font-preloads.mjs`. The cut and the
 * inlining are TypeScript in the landing site's package, which a Vite config cannot import directly
 * (its config loader leaves a `.js` import of a `.ts` file unresolved), so the plugin loads them through
 * the `runnerImport` each app's config passes in, as the site's own config does.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The module that cuts and inlines the stylesheet (`packages/site/src/criticalAssets.ts`). */
export const CRITICAL_ASSETS_MODULE = fileURLToPath(new URL('../../packages/site/src/criticalAssets.ts', import.meta.url));

/** A `<link rel="modulepreload">` of one of the build's chunks, and the chunk's file name. */
const MODULE_PRELOAD = /<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="\/([^"]+)"[^>]*>/gu;

/** A `<link>` that loads a stylesheet, in whatever form it is written. */
const ANY_STYLESHEET_LINK = /<link\b[^>]*\brel\s*=\s*["']?stylesheet\b[^>]*>/iu;

/**
 * The chunks a page's first screen runs: the entry, and every chunk it imports statically, transitively.
 *
 * @param {Readonly<Record<string, import('./critical-css.d.mts').CriticalCssBundleOutput>>} bundle - The build's output.
 * @returns {{ entry: import('./critical-css.d.mts').CriticalCssBundleOutput, files: Set<string> }} The
 *   entry chunk, and the file name of every chunk on the first screen, the entry's included.
 * @throws {Error} Unless the bundle has exactly one entry chunk.
 */
export function startupChunks(bundle) {
	const entries = Object.values(bundle).filter((output) => output.type === 'chunk' && output.isEntry === true);
	const [entry] = entries;

	if (entries.length !== 1 || entry === undefined) {
		throw new Error(`critical CSS: the build has ${String(entries.length)} entry chunks; the page's first screen is read from exactly one.`);
	}

	const files = new Set();
	const pending = [entry.fileName];

	for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
		if (!files.has(file)) {
			files.add(file);
			pending.push(...(bundle[file]?.imports ?? []));
		}
	}

	return { entry, files };
}

/**
 * The plugin.
 *
 * @param {import('./critical-css.d.mts').CriticalCssOptions} options - The app config's `runnerImport`.
 * @returns {import('./critical-css.d.mts').CriticalCssPlugin} The plugin.
 */
export function criticalCssPlugin({ runnerImport }) {
	/** @type {import('./critical-css.d.mts').CriticalCssAnalysis | undefined} */
	let analysis;
	/** The root the app is built from, where its `index.html` is. */
	let root = '';
	/** Every `import()` target the plugin was asked about, and those it gave the whole sheet. */
	const considered = new Set();
	const attached = new Set();
	/** The chunks holding an `import()` that was given the whole sheet. */
	const hosts = new Set();

	return {
		apply: 'build',
		config: () => ({
			build: {
				modulePreload: {
					resolveDependencies: (filename, deps, context) => {
						if (context.hostType !== 'js') {
							return deps;
						}
						if (analysis === undefined) {
							throw new Error(`critical CSS: Vite asked for ${filename}'s dependencies before the plugin read the bundle.`);
						}
						considered.add(filename);

						const { bundle, critical, everythingUsage, fullSheet, module, startupUsage } = analysis;
						const loaded = module.classUsage([filename, ...deps].map((file) => bundle[file]?.code ?? ''));

						if (!module.needsFullStylesheet(critical, { everything: everythingUsage, loaded, startup: startupUsage })) {
							return deps;
						}
						attached.add(filename);
						hosts.add(context.hostId);

						return [...deps, fullSheet];
					},
				},
			},
		}),
		configResolved: (config) => {
			root = config.root;
		},
		generateBundle: {
			async handler(_options, bundle) {
				const module = /** @type {import('./critical-css.d.mts').CriticalAssetsModule} */ (
					(await runnerImport(CRITICAL_ASSETS_MODULE, { root })).module
				);
				const { entry, files } = startupChunks(bundle);
				const sheets = [...files].flatMap((file) => [...(bundle[file]?.viteMetadata?.importedCss ?? [])]);
				const [fullSheet] = sheets;

				if (sheets.length !== 1 || fullSheet === undefined) {
					throw new Error(
						`critical CSS: the first screen imports ${String(sheets.length)} stylesheets (${sheets.join(', ')}); the plugin expects the app's one sheet, imported by ${entry.fileName}.`,
					);
				}

				const source = bundle[fullSheet]?.source;

				if (source === undefined) {
					throw new Error(`critical CSS: ${entry.fileName} imports ${fullSheet}, which is not in the bundle.`);
				}

				const css = typeof source === 'string' ? source : new TextDecoder().decode(source);
				const html = readFileSync(join(root, 'index.html'), 'utf8');
				const startupUsage = module.classUsage([html, ...[...files].map((file) => bundle[file]?.code ?? '')]);
				const everythingUsage = module.classUsage([html, ...Object.values(bundle).map((output) => output.code ?? '')]);

				analysis = {
					bundle,
					critical: module.criticalStylesheet(css, startupUsage),
					everythingUsage,
					fullSheet,
					module,
					startup: files,
					startupUsage,
				};
			},
			order: 'pre',
		},
		name: 'filter-enginez-critical-css',
		transformIndexHtml: {
			handler: (html, context) => {
				if (analysis === undefined) {
					throw new Error(`${context.filename}: the critical CSS was not cut before the page was written.`);
				}

				const { bundle, critical, everythingUsage, fullSheet, module, startup, startupUsage } = analysis;
				const page = module.inlineStylesheets(html, (href) => (href === `/${fullSheet}` ? critical.css : undefined)).html;
				const stylesheetLink = ANY_STYLESHEET_LINK.exec(page);

				if (stylesheetLink !== null) {
					throw new Error(`${context.filename} still links a stylesheet after its critical CSS was inlined: ${stylesheetLink[0]}`);
				}

				// Chunks the page asks for from its head beyond its first screen's own (the documentation site
				// preloads its docs shell, which every one of its pages renders) start loading at once, so the
				// sheet they need is fetched at once too: a preload, which does not hold up the first render.
				const preloaded = [...page.matchAll(MODULE_PRELOAD)].map(([, file]) => file ?? '').filter((file) => !startup.has(file));
				const loaded = module.classUsage(preloaded.map((file) => bundle[file]?.code ?? ''));

				return preloaded.length > 0 && module.needsFullStylesheet(critical, { everything: everythingUsage, loaded, startup: startupUsage })
					? page.replace('</head>', `\t<link rel="preload" as="style" crossorigin href="/${fullSheet}">\n\t</head>`)
					: page;
			},
			order: 'post',
		},
		writeBundle(_options, bundle) {
			if (analysis === undefined) {
				throw new Error('critical CSS: the bundle was written without the plugin reading it.');
			}

			const { critical, fullSheet } = analysis;
			const kilobytes = (/** @type {string} */ text) => `${(new TextEncoder().encode(text).length / 1000).toFixed(1)} kB`;
			const sheetName = fullSheet.slice(fullSheet.lastIndexOf('/') + 1);
			// What Vite wrote, read back: each chunk whose import was given the sheet names it in the
			// dependency list it hands the preload helper. A Vite that dropped what this plugin returned
			// would otherwise ship routes that render before their CSS, and build without a word.
			const unwritten = [...hosts].filter((host) => !(bundle[host]?.code ?? '').includes(sheetName));

			if (unwritten.length > 0) {
				throw new Error(`critical CSS: ${unwritten.join(', ')} should load ${fullSheet} with an import, but the built code does not name it.`);
			}

			// The counts are the evidence the cut ran and the sheet was attached: a step that did nothing reads
			// like one that passed.
			this.info(
				`critical CSS: index.html carries ${String(critical.keptRuleCount)} of ${String(critical.ruleCount)} rules (${kilobytes(critical.css)}); ` +
					`${fullSheet} loads with ${String(attached.size)} of ${String(considered.size)} on-demand imports`,
			);
		},
	};
}
