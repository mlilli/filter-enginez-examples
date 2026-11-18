/**
 * `@filter-enginez/examples-shared/prerender-core` — the page a dataset route shows before its app has
 * booted, and the hand-over to the app.
 *
 * @remarks
 * Every dataset route boots an engine before it can render: its code, its corpus, the engine build.
 * Until then a visitor would see a boot caption, and the result count — the largest thing on a phone's
 * first screen — would paint seconds late. So each app's build opens its own dataset routes in a
 * headless browser, waits for the booted page, and writes what it rendered into the route's HTML shell
 * (`scripts/prerender-routes.mjs`): the default, unfiltered state, once at a phone width and once at a
 * desktop width, because the apps lay a page out differently on either side of the desktop breakpoint.
 *
 * In the shell those two snapshots are `<template>`s, inert until {@link pickPrerender} — inlined into
 * the shell as a classic script, so it runs during parsing, before the first paint — copies the one
 * matching the viewport into a `#fe-prerender` layer over the top of the page. It shows nothing
 * when the snapshot could be wrong: on an address with a query string (a `?f=` filter state, a preset)
 * unless the server rewrote the page for that state ({@link PRERENDER.filteredAttribute}), and on a
 * device the wine route would boot a smaller corpus on ({@link PRERENDER.fullTierAttribute}).
 *
 * The app then boots exactly as it does without a snapshot, with one difference: its boot screens
 * render nothing while {@link hasPrerender} holds, and its dataset view calls {@link releasePrerender} in
 * the frame it first renders. The live page — built by the same components — is by then laid out
 * underneath the layer, in exactly the snapshot's place (transparent: the shell's own style keeps the app's
 * root at `opacity: 0` while the layer exists). From then on the layer lets clicks through to it and is
 * hidden from assistive technology, which reads the live page. It is removed, revealing the live page with
 * nothing moving, as soon as the count's webfont is in and the live page shows the snapshot's count — at
 * once, as a rule: the webfonts are preloaded and arrive long before the app has booted, and the app
 * renders the state the snapshot shows — or at the visitor's first input (a key, a pointer, a scroll, a
 * touch, a resize to another width) if that comes first. The count can differ for a while on a server-backed route with a
 * filtered address, whose engine applies the address's state a round trip after it first renders (the
 * Worker wrote that state's count into the snapshot), so the layer waits for it; a live count that differs
 * and has held still, idle, for {@link SETTLED_COUNT_MS} is the truth, and the layer goes then. A boot
 * that fails, or a page that cannot load, removes it at once ({@link dismissPrerender}).
 *
 * **Why the fonts.** The snapshot's result count is the page's largest contentful paint, usually painted
 * before the webfonts arrive, in the count's fallback face. A browser records a new largest paint only for
 * an element that paints larger, so the takeover must not reveal a count larger than the snapshot's was.
 * The fallback face is cut to the webfont's figures for exactly this (`@filter-enginez/brand`'s
 * `fallback-font-metrics.py`), and once the webfont is in, the app's count paints in its own face at the
 * snapshot's size.
 *
 * Framework-free and import-free: the build step, every app and the server read the same constants.
 *
 * @packageDocumentation
 */

/** The ids and attributes the build step writes, the picker reads and the server rewrites. */
export const PRERENDER = {
	/** On the result grid's list element in a page template: where the cards go. */
	cardsSlotAttribute: 'data-fe-prerender-cards',
	/** On the result count's number in a page template: the text a server rewrites for a filtered request. */
	countAttribute: 'data-fe-prerender-count',
	/** The cards template at a desktop width (the grid's items, kept apart from the page around them). */
	desktopCardsTemplateId: 'fe-prerender-cards-desktop',
	/** The `matchMedia` query that picks the desktop snapshot: the apps' own layout breakpoint. */
	desktopQuery: '(min-width: 1024px)',
	/** The page template at a desktop width. */
	desktopTemplateId: 'fe-prerender-desktop',
	/** On the page templates: the server rewrote this page for the request's filter state. */
	filteredAttribute: 'data-fe-prerender-filtered',
	/** On the page templates: the snapshot holds the full corpus tier, which a low-memory device does not boot. */
	fullTierAttribute: 'data-fe-prerender-full-tier',
	/** The element the picker creates and the app removes. */
	hostId: 'fe-prerender',
	/** Device memory, in gigabytes, at or below which the wine route boots its low-memory tier. */
	lowMemoryGigabytes: 1,
	/** The cards template at a phone width. */
	phoneCardsTemplateId: 'fe-prerender-cards-phone',
	/** The page template at a phone width. */
	phoneTemplateId: 'fe-prerender-phone',
	/** On the host once the app has taken over: it lets clicks through, and goes once the live page matches it. */
	releasedAttribute: 'data-fe-prerender-released',
} as const;

/** The dataset routes whose engine boots in the browser. Every app's build prerenders each one it serves. */
export const CLIENT_DATASET_ROUTE_PATHS: readonly string[] = ['/books', '/books-config', '/books-raw', '/real-estate', '/wine'];

/**
 * The dataset routes whose engine is the examples server's. The client-rendered apps prerender them
 * too, and the Worker in front of them rewrites the count for a filtered address; SvelteKit renders
 * them on the server per request.
 */
export const SERVER_DATASET_ROUTE_PATHS: readonly string[] = ['/books-server', '/wine-server'];

/** The routes whose snapshot holds the wine corpus's full tier, which a low-memory device does not boot. */
export const FULL_TIER_ROUTE_PATHS: readonly string[] = ['/wine'];

/** The constants {@link pickPrerender} needs, passed in so its source stands alone when inlined. */
export type PrerenderIds = typeof PRERENDER;

/** What {@link pickPrerender} reads from `window`. */
export interface PrerenderWindow {
	readonly getComputedStyle: (element: Element) => { readonly backgroundColor: string };
	readonly location: { readonly search: string };
	readonly matchMedia: (query: string) => { readonly matches: boolean };
	readonly navigator: { readonly deviceMemory?: number };
}

/**
 * Show the snapshot that fits this visit, or nothing.
 *
 * @remarks
 * Its source is inlined into every prerendered shell ({@link prerenderPickerScript}), so it must not
 * reference anything outside its own body: every constant arrives as `ids`.
 *
 * @param doc - The document being parsed.
 * @param win - The window: the address, the viewport query and the device memory.
 * @param ids - {@link PRERENDER}.
 * @returns Whether a snapshot is now on screen.
 */
export function pickPrerender(doc: Document, win: PrerenderWindow, ids: PrerenderIds): boolean {
	const phone = doc.getElementById(ids.phoneTemplateId);

	if (!(phone instanceof HTMLTemplateElement)) {
		return false;
	}
	if (win.location.search.length > 1 && !phone.hasAttribute(ids.filteredAttribute)) {
		return false;
	}

	const memory = win.navigator.deviceMemory;

	if (phone.hasAttribute(ids.fullTierAttribute) && typeof memory === 'number' && memory > 0 && memory <= ids.lowMemoryGigabytes) {
		return false;
	}

	const isDesktop = win.matchMedia(ids.desktopQuery).matches;
	const page = isDesktop ? doc.getElementById(ids.desktopTemplateId) : phone;

	if (!(page instanceof HTMLTemplateElement)) {
		return false;
	}

	const host = doc.createElement('div');

	host.id = ids.hostId;
	// A layer over the top of the page, where the app's root lays its page out: out of the flow, so the app
	// renders underneath in the same place, and opaque, so only one of the two shows.
	host.style.cssText = `position:absolute;top:0;left:0;right:0;z-index:2147483647;background-color:${win.getComputedStyle(doc.body).backgroundColor}`;
	host.append(page.content.cloneNode(true));

	const cards = doc.getElementById(isDesktop ? ids.desktopCardsTemplateId : ids.phoneCardsTemplateId);
	const slot = host.querySelector(`[${ids.cardsSlotAttribute}]`);

	if (cards instanceof HTMLTemplateElement && slot !== null) {
		slot.append(cards.content.cloneNode(true));
	}
	phone.before(host);

	return true;
}

/**
 * The classic script a prerendered shell runs while it is parsed: {@link pickPrerender} and its call.
 *
 * @returns The script's source, without the `<script>` tags.
 */
export function prerenderPickerScript(): string {
	return `(${pickPrerender.toString()})(document,window,${JSON.stringify(PRERENDER)});`;
}

/**
 * The page's document, or `undefined` where there is none (SvelteKit's server render).
 *
 * @returns It.
 */
function currentDocument(): Document | undefined {
	return typeof document === 'undefined' ? undefined : document;
}

/**
 * Whether a snapshot is on screen, waiting for the app: boot screens render nothing while it is.
 *
 * @param doc - The document; the global one by default.
 * @returns `true` until {@link releasePrerender}.
 */
export function hasPrerender(doc: Document | undefined = currentDocument()): boolean {
	const host = doc?.getElementById(PRERENDER.hostId);

	return host !== null && host !== undefined && !host.hasAttribute(PRERENDER.releasedAttribute);
}

/** The visitor's first input, on which a released snapshot goes at once. */
const FIRST_INPUT_EVENTS = ['keydown', 'pointerdown', 'scroll', 'touchstart', 'wheel'] as const;

/** The result count's number in the live page: the shared result-count markup every app renders. */
const LIVE_COUNT_SELECTOR = '.fe-result-count__number';

/** On the live count while a fetch is in flight or the number is still rolling to its value. */
const LIVE_COUNT_COMPUTING_CLASS = 'fe-result-count__number--computing';

/**
 * How long a live count that is not the snapshot's must hold still, idle, before the snapshot goes
 * anyway. Longer than the moment between an app's first render and its first fetch for the address's
 * state (an idle, unfiltered count on a server-backed route), short enough that a visitor never reads a
 * stale snapshot for long.
 */
const SETTLED_COUNT_MS = 1000;

/**
 * When the font the snapshot's count is set in is in: the webfont, once it has arrived.
 *
 * @remarks
 * Not `document.fonts.ready`: it settles while no text has asked for a face yet, and a preloaded webfont
 * stays unasked-for until the page's first layout, which can come after the app's first render.
 *
 * @param host - The snapshot's layer.
 * @returns A promise that settles then (also if the font cannot load), at once where there is no count or
 *   no font loading API.
 */
async function whenCountFontIsIn(host: HTMLElement): Promise<void> {
	const doc = host.ownerDocument;
	// `fonts` is missing outside a browser (jsdom).
	const fonts = doc.fonts as FontFaceSet | undefined;
	const count = host.querySelector(`[${PRERENDER.countAttribute}]`);

	if (fonts === undefined || count === null) {
		return;
	}

	// Not the `font` shorthand, which reads empty for a face with numeric variants set. Only the first family,
	// the webfont: a load of the whole stack fails as soon as one platform's local fallback is not installed.
	const style = getComputedStyle(count);
	const [webfont = ''] = style.fontFamily.split(',');

	await fonts.load(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${webfont.trim()}`, count.textContent).catch(() => undefined);
}

/**
 * The count a page shows.
 *
 * @param count - Its number's element, if any.
 * @returns Its text, trimmed (Angular's template keeps whitespace around the number); `undefined` for none.
 */
function countText(count: Element | null | undefined): string | undefined {
	return count?.textContent.trim();
}

/**
 * Hand the page to the app. Called by a dataset view in the frame it first renders. Idempotent, and a
 * no-op where no snapshot was shown.
 *
 * @remarks
 * The snapshot lets clicks through to the live page laid out underneath it, leaves the accessibility tree
 * to it (`aria-hidden`, `inert`), and is removed once the count's webfont is in and the live page shows the
 * snapshot's count (or another that has held still, idle, for {@link SETTLED_COUNT_MS}), or at the
 * visitor's first input if that is sooner. The module's remarks say why.
 *
 * @param doc - The document; the global one by default.
 */
export function releasePrerender(doc: Document | undefined = currentDocument()): void {
	const host = doc?.getElementById(PRERENDER.hostId);

	if (host === null || host === undefined || host.hasAttribute(PRERENDER.releasedAttribute)) {
		return;
	}
	host.setAttribute(PRERENDER.releasedAttribute, '');
	host.setAttribute('aria-hidden', 'true');
	host.inert = true;
	host.style.pointerEvents = 'none';

	const page = host.ownerDocument;
	const view = page.defaultView;
	const snapshotCount = countText(host.querySelector(`[${PRERENDER.countAttribute}]`));
	let isFontIn = false;
	let isCountReady = false;
	let lastCountState: string | undefined;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	const remove = (): void => {
		countWatch.disconnect();
		clearTimeout(settleTimer);
		host.remove();
		for (const type of FIRST_INPUT_EVENTS) {
			view?.removeEventListener(type, remove, true);
		}
		view?.removeEventListener('resize', removeOnNewWidth, true);
	};
	// A resize to another width, which the snapshot's layout would not follow. Not any resize: a phone fires
	// one at its first layout, once the viewport meta has taken the window from the default 980 pixels wide.
	const width = view?.innerWidth;
	const removeOnNewWidth = (): void => {
		if (view?.innerWidth !== width) {
			remove();
		}
	};
	const removeOnceReady = (): void => {
		if (isFontIn && isCountReady) {
			remove();
		}
	};
	const markCountReady = (): void => {
		isCountReady = true;
		countWatch.disconnect();
		removeOnceReady();
	};
	// The live count is ready once it shows the snapshot's; or, if it never does (data that changed since the
	// build, say), once it has held still, idle, for a moment: the live page is the truth.
	const checkCount = (): void => {
		const live = [...page.querySelectorAll(LIVE_COUNT_SELECTOR)].find((count) => !host.contains(count));
		const text = countText(live);
		const isIdle = text !== undefined && text !== '' && live?.classList.contains(LIVE_COUNT_COMPUTING_CLASS) === false;
		const state = `${String(isIdle)}:${text ?? ''}`;

		if (state === lastCountState) {
			return;
		}
		lastCountState = state;
		clearTimeout(settleTimer);
		if (snapshotCount === undefined || text === snapshotCount) {
			markCountReady();
		} else if (isIdle) {
			settleTimer = setTimeout(markCountReady, SETTLED_COUNT_MS);
		}
	};
	const countWatch = new MutationObserver(checkCount);

	for (const type of FIRST_INPUT_EVENTS) {
		view?.addEventListener(type, remove, { capture: true, once: true, passive: true });
	}
	view?.addEventListener('resize', removeOnNewWidth, { capture: true, passive: true });
	countWatch.observe(page, { attributeFilter: ['class'], attributes: true, characterData: true, childList: true, subtree: true });
	checkCount();
	void whenCountFontIsIn(host).then(() => {
		isFontIn = true;
		removeOnceReady();
	});
}

/**
 * Remove the snapshot now. Called by a screen that replaces the page rather than continuing it — a boot
 * that failed, a page that could not load — which must not wait under a snapshot of a working page.
 * Idempotent, and a no-op where no snapshot was shown.
 *
 * @param doc - The document; the global one by default.
 */
export function dismissPrerender(doc: Document | undefined = currentDocument()): void {
	doc?.getElementById(PRERENDER.hostId)?.remove();
}
