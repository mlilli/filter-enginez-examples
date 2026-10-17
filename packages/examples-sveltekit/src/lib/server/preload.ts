/**
 * `preload` — which of a page's assets SvelteKit asks the browser for from the page's head.
 *
 * @remarks
 * SvelteKit's `resolve(event, { preload })` decides, per asset of the page being rendered, whether
 * to announce it up front: as a `<link rel="preload">` / `<link rel="modulepreload">` in a prerendered
 * page's head, and as a `Link` header on a server-rendered response. Its default announces the
 * JavaScript and the stylesheets and no fonts, so a browser finds the brand fonts only once it has
 * parsed the stylesheet and laid out text that uses them, and the first paint swaps faces a moment
 * later.
 *
 * {@link preloadFirstScreenAsset} keeps the default for scripts and stylesheets and adds the two fonts
 * every first screen sets: Inter for body text and the display face for the header's wordmark and
 * page links. Not JetBrains Mono: its subset is the largest of the three (about 42 kB), the first
 * screen sets only the header's small subtitle in it, and a preload competes for the same early
 * bandwidth as the startup scripts. The other five apps preload the same two faces
 * (`scripts/lib/font-preloads.mjs`), and this app's build checks its prerendered hub against that list
 * with `scripts/check-font-preloads.mjs`, so the two cannot drift apart.
 *
 * Server-only (`$lib/server/`): `src/hooks.server.ts` is its one caller.
 *
 * @packageDocumentation
 */

/** One asset SvelteKit offers to preload: what kind it is and its URL. */
export interface PreloadCandidate {
	/** The asset's kind, as SvelteKit classifies it. */
	readonly type: 'asset' | 'css' | 'font' | 'js';
	/** The asset's URL, e.g. `./_app/immutable/assets/Inter-Subset.DlVByD-t.woff2`. */
	readonly path: string;
}

/**
 * The brand fonts every first screen sets, by the stem of the subset's file name in
 * `@filter-enginez/brand`. SvelteKit writes a font as `<stem>.<hash>.woff2`.
 */
export const PRELOADED_FONT_STEMS: readonly string[] = ['FilterEngineZDisplay-Subset', 'Inter-Subset'];

/**
 * Whether SvelteKit should announce an asset from the page's head.
 *
 * @param candidate - The asset SvelteKit offers.
 * @returns `true` for every script and stylesheet (SvelteKit's default), and for the two first-screen
 *   brand fonts; `false` for every other font and for any other asset.
 */
export function preloadFirstScreenAsset({ path, type }: PreloadCandidate): boolean {
	if (type === 'font') {
		const fileName = path.slice(path.lastIndexOf('/') + 1);

		return PRELOADED_FONT_STEMS.some((stem) => fileName.startsWith(`${stem}.`));
	}

	return type === 'js' || type === 'css';
}
