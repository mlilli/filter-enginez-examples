/**
 * Types for `critical-css.mjs`.
 *
 * @remarks
 * The module is plain JavaScript so the apps' Vite configs load it as it is; they and `tests/tooling`
 * import it, and typed lint cannot read types out of an unchecked `.mjs`, the same seam as
 * `font-preloads.d.mts`. The plugin's types are structural rather than Vite's own: this directory sits
 * outside every package, where `vite` does not resolve, and the shapes below are all the plugin uses.
 * They are assignable to Vite's, which is what each config's `plugins: [...]` checks.
 *
 * @packageDocumentation
 */

/** The class names a page can use, as `classUsage` in `packages/site/src/criticalAssets.ts` reads them. */
export interface CriticalCssClassUsage {
	readonly prefixes: readonly string[];
	readonly words: ReadonlySet<string>;
}

/** What `criticalStylesheet` kept of a stylesheet, and what it left out. */
export interface CriticalCssCut {
	readonly css: string;
	readonly keptRuleCount: number;
	readonly omittedKeyframes: readonly string[];
	readonly omittedSelectors: readonly (readonly string[])[];
	readonly ruleCount: number;
}

/** The functions of `packages/site/src/criticalAssets.ts` the plugin calls. */
export interface CriticalAssetsModule {
	classUsage(sources: readonly string[]): CriticalCssClassUsage;
	criticalStylesheet(css: string, usage: CriticalCssClassUsage): CriticalCssCut;
	inlineStylesheets(html: string, readStylesheet: (href: string) => string | undefined): { readonly html: string };
	needsFullStylesheet(
		critical: CriticalCssCut,
		usage: { readonly everything: CriticalCssClassUsage; readonly loaded: CriticalCssClassUsage; readonly startup: CriticalCssClassUsage },
	): boolean;
}

/** One file of a Vite build, as much of it as the plugin reads. */
export interface CriticalCssBundleOutput {
	readonly code?: string;
	readonly dynamicImports?: readonly string[];
	readonly fileName: string;
	readonly imports?: readonly string[];
	readonly isEntry?: boolean;
	readonly source?: string | Uint8Array;
	readonly type: string;
	readonly viteMetadata?: { readonly importedCss: ReadonlySet<string> };
}

/** What the plugin read from the bundle, once, before the page is written. */
export interface CriticalCssAnalysis {
	readonly bundle: Readonly<Record<string, CriticalCssBundleOutput>>;
	readonly critical: CriticalCssCut;
	readonly everythingUsage: CriticalCssClassUsage;
	readonly fullSheet: string;
	readonly module: CriticalAssetsModule;
	readonly startup: ReadonlySet<string>;
	readonly startupUsage: CriticalCssClassUsage;
}

/** Options for {@link criticalCssPlugin}. */
export interface CriticalCssOptions {
	/** Vite's `runnerImport`, which loads the TypeScript module that cuts and inlines the stylesheet. */
	readonly runnerImport: (moduleId: string, inlineConfig?: { readonly root?: string }) => Promise<{ readonly module: unknown }>;
}

/** The part of Vite's resolved config the plugin reads. */
export interface CriticalCssResolvedConfig {
	readonly root: string;
}

/** The context Vite passes to `build.modulePreload.resolveDependencies`. */
export interface CriticalCssDependencyContext {
	readonly hostId: string;
	readonly hostType: 'html' | 'js';
}

/** The part of Vite's `IndexHtmlTransformContext` the plugin reads. */
export interface CriticalCssHtmlContext {
	readonly filename: string;
}

/** The Vite plugin {@link criticalCssPlugin} returns. */
export interface CriticalCssPlugin {
	readonly apply: 'build';
	readonly config: () => {
		readonly build: {
			readonly modulePreload: {
				readonly resolveDependencies: (filename: string, deps: string[], context: CriticalCssDependencyContext) => string[];
			};
		};
	};
	readonly configResolved: (config: CriticalCssResolvedConfig) => void;
	readonly generateBundle: {
		readonly handler: (options: unknown, bundle: Readonly<Record<string, CriticalCssBundleOutput>>) => Promise<void>;
		readonly order: 'pre';
	};
	readonly name: string;
	readonly transformIndexHtml: {
		readonly handler: (html: string, context: CriticalCssHtmlContext) => string;
		readonly order: 'post';
	};
	readonly writeBundle: (
		this: { info: (message: string) => void },
		options: unknown,
		bundle: Readonly<Record<string, CriticalCssBundleOutput>>,
	) => void;
}

/** The module that cuts and inlines the stylesheet, as an absolute path. */
export declare const CRITICAL_ASSETS_MODULE: string;

/**
 * The chunks a page's first screen runs: the entry, and every chunk it imports statically.
 *
 * @param bundle - The build's output.
 * @returns The entry chunk, and the file name of every chunk on the first screen.
 * @throws {Error} Unless the bundle has exactly one entry chunk.
 */
export declare function startupChunks(bundle: Readonly<Record<string, CriticalCssBundleOutput>>): {
	readonly entry: CriticalCssBundleOutput;
	readonly files: Set<string>;
};

/**
 * The plugin: inline the first screen's part of the stylesheet, and load the whole sheet with the
 * on-demand code that needs it.
 *
 * @param options - The app config's `runnerImport`.
 * @returns The plugin.
 */
export declare function criticalCssPlugin(options: CriticalCssOptions): CriticalCssPlugin;
