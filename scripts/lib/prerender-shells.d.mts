/**
 * Types for `prerender-shells.mjs`, restated structurally like `route-shells.d.mts`: this directory does
 * not compile `examples-shared`'s source.
 *
 * @packageDocumentation
 */

/** A host whose build prerenders its dataset routes: the six demo apps. */
export type PrerenderHost = 'angular' | 'react-plain' | 'react-rtk' | 'sveltekit' | 'vanilla' | 'vue';

/** One app in the verticals registry: its id and the routes it serves. */
export interface VerticalRoutes {
	readonly id: PrerenderHost;
	readonly routes: readonly string[];
}

/** Where a host's app root is. */
export interface AppRoot {
	/** The selector the booted page's root is read from. */
	readonly selector: string;
	/**
	 * The root as a sibling of the snapshot's layer, which the shell's style makes transparent: the root
	 * itself, or its children where the root is `display: contents`, which no opacity reaches.
	 */
	readonly sibling: string;
	/** The root's opening tag, as the shell holds it. */
	readonly tag: string;
}

/** The ids and attributes of `examples-shared`'s `PRERENDER`. */
export interface PrerenderConstants {
	readonly cardsSlotAttribute: string;
	readonly countAttribute: string;
	readonly desktopCardsTemplateId: string;
	readonly desktopQuery: string;
	readonly desktopTemplateId: string;
	readonly filteredAttribute: string;
	readonly fullTierAttribute: string;
	readonly hostId: string;
	readonly lowMemoryGigabytes: number;
	readonly phoneCardsTemplateId: string;
	readonly phoneTemplateId: string;
}

/** What `packages/examples-shared/src/prerender/index.ts` exports to the build. */
export interface PrerenderModule {
	readonly CLIENT_DATASET_ROUTE_PATHS: readonly string[];
	readonly FULL_TIER_ROUTE_PATHS: readonly string[];
	readonly PRERENDER: PrerenderConstants;
	readonly SERVER_DATASET_ROUTE_PATHS: readonly string[];
	readonly prerenderPickerScript: () => string;
}

/** One width's snapshot of a booted page. */
export interface WidthSnapshot {
	/** The root's markup, its result grid emptied and marked as the cards' slot. */
	readonly page: string;
	/** The result grid's cards. */
	readonly cards: string;
}

/** A route's snapshot at both widths, and the styles the shell needs for it. */
export interface RouteSnapshot {
	readonly desktop: WidthSnapshot;
	readonly isFullTier: boolean;
	/** Inline `<style>` contents the booted page had and the shell does not. */
	readonly missingStyles: readonly string[];
	/** Stylesheet URLs the booted page had and the shell does not. */
	readonly missingStylesheets: readonly string[];
	readonly phone: WidthSnapshot;
}

export const PRERENDER_MODULE: string;
export const APP_ROOTS: Readonly<Record<PrerenderHost, AppRoot>>;
export function loadPrerenderModule(): Promise<PrerenderModule>;
export function loadVerticalRoutes(): Promise<readonly VerticalRoutes[]>;
export function prerenderedRoutes(host: PrerenderHost, routes: readonly string[], prerender: PrerenderModule): string[];
export function writePrerenderedShell(shell: string, snapshot: RouteSnapshot, root: AppRoot, prerender: PrerenderModule): string;
