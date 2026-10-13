/**
 * `@filter-enginez/examples-shared/verticals` — who each demo app IS.
 *
 * @remarks
 * One registry of the six verticals: the stack each one demonstrates, the binding package it proves,
 * the reactive surface underneath, its dev and production origins, and which routes it actually has.
 * Framework-free data, no engine import, no DOM.
 *
 * ### Why this exists as shared data rather than six string literals
 *
 * Two consumers want the same facts and would otherwise invent them separately.
 *
 * The **page headers** put `Dataset · Stack` under the wordmark, on one consistent axis in every
 * app, so someone landing on a screenshot can tell which app they are looking at. Hand-written
 * subtitles per app would mix dataset, framework and engine tier arbitrarily.
 *
 * The **`/compare` page** needs the identical vocabulary plus the origins, because its whole job is
 * "here is this exact filter state, in each of the six". If the header says "Vanilla" and the
 * comparison page says "no framework", the demo has already contradicted itself.
 *
 * ### The tier is part of the stack label, not a separate field
 *
 * `/books` and `/books-server` are the same framework over a different ENGINE — one in-process, one
 * across `fetch`. `/books-raw` is the same framework with no adapter at all. Those distinctions are
 * the interesting thing about those routes, so they ride in the stack label as a parenthetical:
 * `React RTK (server)`, `Vanilla (bare core)`. See {@link stackLabel}.
 *
 * @packageDocumentation
 */

/** The six demo applications. */
export type VerticalId =
	| 'angular'
	| 'react-plain'
	| 'react-rtk'
	| 'sveltekit'
	| 'vanilla'
	| 'vue';

/**
 * How a route reaches the engine, named whenever the contrast is the point.
 *
 * @remarks
 * `undefined` means "the ordinary way this vertical does it", which is the common case and should not
 * have to announce itself. A tier is supplied when the route exists to demonstrate a DIFFERENT
 * arrangement of the same engine.
 *
 * `signals` looks redundant — four verticals are signals-backed and none of them say so — and on the
 * vanilla app it is load-bearing. That vertical ships `/books` and `/books-raw` side by side to show
 * that the adapter buys granularity rather than capability; labelling only the second one leaves
 * `(bare core)` as a suffix with nothing to contrast against, and a visitor on `/books` cannot tell
 * they are looking at the other half of the comparison.
 */
export type EngineTier = 'bare-core' | 'config' | 'server' | 'signals' | 'worker';

/** What one vertical is, and where to find it. */
export interface VerticalDescriptor {
	/** Stable id. Matches nothing in the URL — this is a code-level key. */
	readonly id: VerticalId;
	/** The stack label shown under the wordmark and in the comparison table. */
	readonly name: string;
	/** The UI framework and major version, for the comparison table's first column. */
	readonly framework: string;
	/** The binding package this vertical exists to prove, or `null` for the framework-less app. */
	readonly binding: string | null;
	/** Which reactive surface the binding sits on. */
	readonly surface: 'none' | 'rxjs' | 'signals';
	/**
	 * The dev-server origin.
	 *
	 * @remarks
	 * Canonically declared in `playwright.config.ts` — see its port-map docblock, which
	 * `tests/tooling/devServerPorts.test.ts` asserts this against so the two cannot drift.
	 */
	readonly devOrigin: string;
	/**
	 * The deployed origin: the vertical's own subdomain of `filterenginez.com`, no trailing slash.
	 *
	 * @remarks
	 * Each vertical is its own site on its own host, so no app needs a base path, a router basename or
	 * a scoped service worker. The host is canonically declared as the custom domain in the app's
	 * `wrangler.jsonc` — `tests/tooling/cloudflareDeploy.test.ts` asserts this value against it, so the
	 * cross-app links and the deployment cannot point at different hosts.
	 */
	readonly productionOrigin: string;
	/** Routes this vertical actually serves. Not aspirational — `/compare` links only to these. */
	readonly routes: readonly string[];
	/** One line for the comparison table, naming what is distinctive rather than repeating the name. */
	readonly blurb: string;
}

/**
 * The six, in the order they should be presented.
 *
 * @remarks
 * Ordered by how much framework is involved, most to least, so the vanilla app lands last and reads
 * as the punchline it is. Not alphabetical, deliberately.
 */
export const VERTICALS: readonly VerticalDescriptor[] = [
	{
		binding: '@filter-enginez/react-signals',
		blurb: 'Adds the optional Redux mirror via redux-bridge — the engine stays the source of truth.',
		devOrigin: 'http://127.0.0.1:5174',
		framework: 'React 19',
		id: 'react-rtk',
		name: 'React RTK',
		productionOrigin: 'https://react-rtk.filterenginez.com',
		routes: ['/books', '/books-server', '/books-config', '/wine', '/real-estate', '/docs', '/compare'],
		surface: 'signals',
	},
	{
		binding: '@filter-enginez/react-signals',
		blurb: 'The same app with no store library at all, proving the Redux mirror is optional.',
		devOrigin: 'http://127.0.0.1:5176',
		framework: 'React 19',
		id: 'react-plain',
		name: 'React plain',
		productionOrigin: 'https://react.filterenginez.com',
		routes: ['/books', '/books-server', '/books-config', '/wine', '/real-estate', '/docs', '/compare'],
		surface: 'signals',
	},
	{
		binding: '@filter-enginez/svelte-signals',
		blurb: 'Runs the isomorphic core in SvelteKit’s own server tier, with a zero-JS SSR fallback.',
		devOrigin: 'http://127.0.0.1:5175',
		framework: 'SvelteKit 5',
		id: 'sveltekit',
		name: 'SvelteKit',
		productionOrigin: 'https://svelte.filterenginez.com',
		routes: ['/books', '/books-server', '/wine', '/wine-server', '/real-estate', '/compare'],
		surface: 'signals',
	},
	{
		binding: '@filter-enginez/vue-signals',
		blurb: 'Holds the engine in shallowRef — Vue’s deep proxy would break its signals.',
		devOrigin: 'http://127.0.0.1:5178',
		framework: 'Vue 3',
		id: 'vue',
		name: 'Vue',
		productionOrigin: 'https://vue.filterenginez.com',
		routes: ['/books', '/wine', '/real-estate', '/compare'],
		surface: 'signals',
	},
	{
		binding: '@filter-enginez/angular-rxjs',
		blurb: 'Zoneless and standalone; consumes the engine’s Observables natively, so the binding is DI only.',
		devOrigin: 'http://127.0.0.1:4200',
		framework: 'Angular 22',
		id: 'angular',
		name: 'Angular',
		productionOrigin: 'https://angular.filterenginez.com',
		// Must match `app.routes.ts`: `compareLinks` filters on this array, so a route missing here
		// would silently drop Angular from that dataset's `/compare` table. `/wine` is pinned by
		// `tests/tooling/winePanelFacetParity.test.ts`.
		routes: ['/books', '/books-server', '/wine', '/real-estate', '/compare'],
		surface: 'rxjs',
	},
	{
		binding: null,
		blurb: '/books goes through reactive-signals, /books-raw through the bare core — the pair shows what the adapter buys.',
		devOrigin: 'http://127.0.0.1:5179',
		framework: 'None',
		id: 'vanilla',
		name: 'Vanilla',
		productionOrigin: 'https://vanilla.filterenginez.com',
		routes: ['/books', '/books-raw', '/wine', '/wine-server', '/real-estate', '/compare'],
		surface: 'none',
	},
];

/**
 * The landing site at the apex, `filterenginez.com` — not a vertical, but a page the verticals link to.
 *
 * @remarks
 * It hosts the one "How the engine works" page every app's landing hub, the documentation and the
 * lab link to, so it needs the same two origins a vertical has, for the same reason: a developer
 * running everything locally must land on the local site, and a visitor on the deployed one. Declared
 * here beside {@link VERTICALS} so one file states every origin a cross-app link can resolve to;
 * `../compare/origins.ts` resolves between the two exactly as it does for a vertical.
 *
 * `devOrigin` is pinned against `playwright.config.ts` by `tests/tooling/devServerPorts.test.ts`, and
 * `productionOrigin` against the custom domain in `packages/site/wrangler.jsonc` by
 * `tests/tooling/cloudflareDeploy.test.ts`.
 */
export const SITE: Readonly<Pick<VerticalDescriptor, 'devOrigin' | 'productionOrigin'>> = {
	devOrigin: 'http://127.0.0.1:5181',
	productionOrigin: 'https://filterenginez.com',
};

/**
 * The path of the "How the engine works" page on {@link SITE}.
 *
 * @remarks
 * Extensionless and without a trailing slash, the one canonical form: Cloudflare's static assets
 * serve `how-it-works.html` at it, the site's Worker redirects the `.html` and trailing-slash forms
 * to it, and Vite's dev server answers it too, so a link built from this path works in every layout.
 */
export const HOW_IT_WORKS_PATH = '/how-it-works';

/** Lookup by id. @internal */
const BY_ID = new Map(VERTICALS.map((entry) => [entry.id, entry]));

/**
 * The descriptor for one vertical.
 *
 * @param id - Which vertical.
 * @returns Its descriptor.
 * @throws If `id` is not one of the six — a typo here should not degrade to a blank header.
 */
export function vertical(id: VerticalId): VerticalDescriptor {
	const found = BY_ID.get(id);

	if (found === undefined) {
		throw new Error(`Unknown vertical id: ${id}`);
	}

	return found;
}

/** How each engine tier reads in a stack label. @internal */
const TIER_SUFFIX: Record<EngineTier, string> = {
	'bare-core': 'bare core',
	config: 'JSON config',
	server: 'server',
	signals: 'signals',
	worker: 'worker',
};

/**
 * The stack label for a route — `React RTK`, or `React RTK (server)`.
 *
 * @param id - Which vertical.
 * @param tier - The route's engine tier, when it differs from the vertical's default.
 * @returns The label.
 */
export function stackLabel(id: VerticalId, tier?: EngineTier): string {
	const { name } = vertical(id);

	return tier === undefined ? name : `${name} (${TIER_SUFFIX[tier]})`;
}

/**
 * The subtitle that sits under the wordmark: `Books · React RTK`.
 *
 * @remarks
 * The separator is a middle dot with hair spacing on both sides, matching every other `·` in the
 * app chrome. The dataset half is passed in rather than looked up, because a route knows its own
 * dataset and this module has no business owning dataset vocabulary.
 *
 * @param dataset - The dataset label, e.g. `Books`.
 * @param id - Which vertical.
 * @param tier - The route's engine tier, when it differs from the vertical's default.
 * @returns The subtitle.
 */
export function verticalSubtitle(dataset: string, id: VerticalId, tier?: EngineTier): string {
	return `${dataset} · ${stackLabel(id, tier)}`;
}
