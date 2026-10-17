/**
 * Types for `font-preloads.mjs`.
 *
 * @remarks
 * The module is plain JavaScript so Vite configs and bare `node` scripts load it as it is. The apps'
 * `vite.config.ts` files, `packages/site/src/criticalAssets.ts` and `tests/tooling` import it, and
 * typed lint cannot read types out of an unchecked `.mjs` — the same seam as `deploy-targets.d.mts`.
 *
 * The plugin's type is structural rather than Vite's own `Plugin`: this directory sits outside every
 * package, where `vite` does not resolve, and the shape below is all the plugin uses. It is assignable
 * to Vite's `Plugin`, which is what each `plugins: [...]` array checks.
 *
 * @packageDocumentation
 */

/** The brand fonts every demo app preloads, by the subset's file name in `@filter-enginez/brand`. */
export declare const APP_PRELOADED_FONTS: readonly string[];

/**
 * Add a font preload for each URL, before the page's first `<link>`.
 *
 * @param html - The page.
 * @param fontHrefs - The WOFF2 files to preload, as the page's stylesheet names them.
 * @returns The page with the preloads in its head.
 * @throws {Error} When the page has no `<link>` to put them before.
 */
export declare function preloadFonts(html: string, fontHrefs: readonly string[]): string;

/**
 * The `href` of every font preload in a page, in page order.
 *
 * @param html - The page.
 * @returns Each preload's `href`.
 */
export declare function readFontPreloads(html: string): string[];

/**
 * Whether every font preload in a page carries `type="font/woff2"` and `crossorigin`.
 *
 * @param html - The page.
 * @returns `true` when every font preload carries both.
 */
export declare function fontPreloadsAreWellFormed(html: string): boolean;

/**
 * The name a hashed build file was made from.
 *
 * @param fileName - The file's base name, e.g. `Inter-Subset-DlVByD-t.woff2`.
 * @returns The name without its content hash, e.g. `Inter-Subset.woff2`.
 */
export declare function sourceFontName(fileName: string): string;

/**
 * Find each font's hashed file in a build directory.
 *
 * @param directory - The build output directory.
 * @param fontNames - The fonts' original file names.
 * @returns A root-relative URL for each, in the order given.
 * @throws {Error} When a font is missing, or present under more than one hashed name.
 */
export declare function findBuiltFonts(directory: string, fontNames: readonly string[]): string[];

/** One file of a Vite build, as much of it as the plugin reads. */
export interface FontPreloadsBundleOutput {
	readonly fileName: string;
	readonly originalFileNames?: readonly string[];
	readonly type: string;
}

/** The part of Vite's `IndexHtmlTransformContext` the plugin reads. */
export interface FontPreloadsHtmlContext {
	readonly bundle?: Readonly<Record<string, FontPreloadsBundleOutput>>;
	readonly filename: string;
}

/** The Vite plugin {@link fontPreloadsPlugin} returns. */
export interface FontPreloadsPlugin {
	readonly apply: 'build';
	readonly name: string;
	readonly transformIndexHtml: {
		readonly handler: (html: string, context: FontPreloadsHtmlContext) => string;
		readonly order: 'post';
	};
}

/** Options for {@link fontPreloadsPlugin}. */
export interface FontPreloadsOptions {
	/** The fonts to preload, by original file name. Default {@link APP_PRELOADED_FONTS}. */
	readonly fonts?: readonly string[];
}

/**
 * The Vite plugin that preloads the given fonts from every page the build writes.
 *
 * @param options - Which fonts.
 * @returns The plugin.
 */
export declare function fontPreloadsPlugin(options?: FontPreloadsOptions): FontPreloadsPlugin;
