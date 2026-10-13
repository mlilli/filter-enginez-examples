/**
 * Tests for `router` — the hand-written History-API router this vertical uses instead of a framework.
 *
 * @remarks
 * ### 🔴 The navigation race these tests guard
 *
 * `renderToken` protects the teardown lifecycle only. Its check sits after `await route.render(…)`,
 * so a superseded route's body has already run by then — and every page in this app calls
 * `replaceChildren()` on what it was handed once its boot resolves, to swap out the boot screen.
 * With a shared mount, a slow `/books` losing to a fast `/wine` would wipe wine and install books,
 * at the wine URL.
 *
 * The protection is structural rather than another check: each render gets its own mount element,
 * and the next navigation detaches it, so a loser's writes land off-document. `the loser's clobber`
 * below is the case that reproduces the real page shape — an ordinary "both painted" test passes
 * without the per-render mount, because it never calls `replaceChildren`.
 *
 * ### Clicks are dispatched, not `.click()`-ed
 *
 * The assertion for a link the router must LEAVE ALONE is `defaultPrevented === false` plus "the
 * route did not render" — two channels, because jsdom implements no navigation, so a missed
 * interception is otherwise indistinguishable from a correct pass-through.
 *
 * @packageDocumentation
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { el } from './dom.js';
import { type Route, type RouterHandle, startRouter } from './router.js';

/** Handles mounted by a test, disposed in `afterEach` so no listener leaks between cases. */
const mounted: RouterHandle[] = [];

/**
 * Every click the router must NOT claim because the user asked the browser for something else.
 *
 * @remarks
 * Enumerated rather than sampled: each one is a separate `||` term in the guard, so a table with
 * four of the five entries leaves one term free to be deleted without a failure.
 */
const MODIFIED_CLICKS: readonly { init: MouseEventInit; label: string }[] = [
	{ init: { metaKey: true }, label: 'a meta-click (open in a new tab)' },
	{ init: { ctrlKey: true }, label: 'a ctrl-click' },
	{ init: { shiftKey: true }, label: 'a shift-click (new window)' },
	{ init: { altKey: true }, label: 'an alt-click (download)' },
	{ init: { button: 1 }, label: 'a middle-click' },
];

/** Every href shape the router must hand back to the browser, one per term in the second guard. */
const BROWSER_OWNED_LINKS: readonly { attrs: Readonly<Record<string, string>>; label: string }[] = [
	{ attrs: { href: '#results' }, label: 'a hash link' },
	{ attrs: { href: 'https://filterenginez.com/wine' }, label: 'an absolute URL' },
	{ attrs: { download: '', href: '/wine' }, label: 'a download' },
	{ attrs: { href: '/wine', target: '_blank' }, label: 'an explicit target' },
];

/** Let the router's `void renderPath(...)` settle, including an awaited async render. */
async function flush(): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

/**
 * Mount a router at `path` and wait for its first render.
 *
 * @param path - The pathname to boot at.
 * @param routes - The route table.
 * @returns The container and the router handle.
 */
async function mountRouter(path: string, routes: readonly Route[]) {
	window.history.replaceState({}, '', path);

	const container = el('div');

	document.body.append(container);

	const handle = startRouter(container, routes);

	mounted.push(handle);
	await flush();

	return { container, handle };
}

/**
 * A route that paints one recognizable word.
 *
 * @param path - The pathname to match.
 * @param word - The text its render writes.
 * @param log - Optional ordering log; the route appends `render:<word>` and `teardown:<word>`.
 * @returns The route.
 */
function wordRoute(path: string, word: string, log?: string[]): Route {
	return {
		path,
		render: (container) => {
			log?.push(`render:${word}`);
			container.append(el('p', { text: word }));

			return () => {
				log?.push(`teardown:${word}`);
			};
		},
	};
}

/**
 * Dispatch a plain left-click that bubbles to the router's document listener.
 *
 * @param target - The node clicked (may be inside the anchor, to exercise `closest`).
 * @param init - Overrides — modifier keys, a non-primary button.
 * @returns The dispatched event, for reading `defaultPrevented`.
 */
function clickOn(target: HTMLElement, init: MouseEventInit = {}): MouseEvent {
	const event = new MouseEvent('click', { bubbles: true, button: 0, cancelable: true, ...init });

	target.dispatchEvent(event);

	return event;
}

/**
 * Put an anchor in the document.
 *
 * @param attrs - Attributes for the anchor (`href`, `target`, `download`).
 * @returns The anchor, already appended to `<body>`.
 */
function anchor(attrs: Readonly<Record<string, string>>): HTMLAnchorElement {
	const element = el('a', { attrs, children: [el('span', { text: 'go' })]});

	document.body.append(element);

	return element;
}

beforeEach(() => {
	document.body.replaceChildren();
	window.history.replaceState({}, '', '/');
});

afterEach(() => {
	for (const handle of mounted.splice(0)) {
		handle.dispose();
	}
});

describe('route resolution', () => {
	it('renders the exactly-matching route at mount', async () => {
		const { container } = await mountRouter('/books', [wordRoute('/books', 'BOOKS'), wordRoute('/wine', 'WINE')]);

		expect(container.textContent).toBe('BOOKS');
	});

	it('falls through to the catch-all, and prefers an exact match over it', async () => {
		// Order matters twice: `'*'` is found by a SECOND `find`, so it can sit anywhere in the table
		// and still lose to an exact match. A single `find` would make the table order load-bearing.
		const routes = [wordRoute('*', 'NOT-FOUND'), wordRoute('/books', 'BOOKS')];
		const { container, handle } = await mountRouter('/nope', routes);

		expect(container.textContent).toBe('NOT-FOUND');

		handle.navigate('/books');
		await flush();

		expect(container.textContent).toBe('BOOKS');
	});

	it('empties the container and renders nothing when nothing matches', async () => {
		const { container } = await mountRouter('/nope', [wordRoute('/books', 'BOOKS')]);

		expect(container.childNodes).toHaveLength(0);
	});

	it('pushes history on navigate, and re-renders without pushing when already there', async () => {
		const { container, handle } = await mountRouter('/books', [wordRoute('/books', 'BOOKS'), wordRoute('/wine', 'WINE')]);

		handle.navigate('/wine');
		await flush();

		expect(window.location.pathname).toBe('/wine');
		expect(container.textContent).toBe('WINE');

		const lengthBeforeReNavigate = window.history.length;

		handle.navigate('/wine');
		await flush();

		expect(window.history.length).toBe(lengthBeforeReNavigate);
		expect(container.textContent).toBe('WINE');
	});
});

describe('the navigation race', () => {
	/**
	 * A route shaped like every real page in this app: paint a boot screen, await, then
	 * `replaceChildren` the mount with the finished view.
	 *
	 * @param path - The pathname to match.
	 * @param word - The word its finished view paints.
	 * @param booted - Resolves when this route's "boot" completes.
	 * @param log - Ordering log.
	 * @returns The route.
	 */
	function bootingRoute(path: string, word: string, booted: Promise<void>, log: string[]): Route {
		return {
			path,
			render: async (mount) => {
				mount.append(el('p', { text: `booting ${word}` }));
				await booted;
				// The line that made this a clobber rather than a co-paint. Every page does it.
				mount.replaceChildren(el('p', { text: word }));
				log.push(`render:${word}`);

				return () => {
					log.push(`teardown:${word}`);
				};
			},
		};
	}

	it("does not let the loser's clobber replace the live route", async () => {
		// The race, exactly: click Books, click Wine, let the books boot finish and try to install
		// itself over wine — at the wine URL. Without the per-render mount this reads 'BOOKS'.
		const log: string[] = [];
		let finishBooks = (): void => undefined;
		const booksBooted = new Promise<void>((resolve) => {
			finishBooks = resolve;
		});
		const { container, handle } = await mountRouter('/books', [
			bootingRoute('/books', 'BOOKS', booksBooted, log),
			wordRoute('/wine', 'WINE', log),
		]);

		expect(container.textContent).toBe('booting BOOKS');

		handle.navigate('/wine');
		await flush();

		expect(container.textContent).toBe('WINE');

		finishBooks();
		await flush();

		expect(container.textContent).toBe('WINE');
		expect(log).toEqual(['render:WINE', 'render:BOOKS', 'teardown:BOOKS']);
	});

	it('gives each render a layout-transparent mount so the route root stays a direct child', () => {
		// `display: contents` is the reason the wrapper is safe to introduce at all — the app root's
		// children are `min-height: 100vh` and `position: sticky`, and a real box here would put a
		// plain block in the middle of both. Asserting the declaration, because nothing else can:
		// jsdom resolves `display` on the wrapper, not the layout consequences of it.
		const container = el('div');

		document.body.append(container);
		window.history.replaceState({}, '', '/books');

		const handle = startRouter(container, [wordRoute('/books', 'BOOKS')]);

		mounted.push(handle);

		// The mount is installed synchronously, before `render` is even awaited, so no flush here.
		const mount = container.querySelector<HTMLElement>('div');

		expect(mount?.style.display).toBe('contents');
		expect(container.childNodes).toHaveLength(1);
	});
});

describe('teardown lifecycle', () => {
	it('tears the old route down BEFORE the new one renders', async () => {
		// The ordering, not merely the fact. Rendering first and tearing down after would let a
		// route's teardown unsubscribe the engine the NEXT route just subscribed to.
		const log: string[] = [];
		const { handle } = await mountRouter('/books', [wordRoute('/books', 'BOOKS', log), wordRoute('/wine', 'WINE', log)]);

		handle.navigate('/wine');
		await flush();

		expect(log).toEqual(['render:BOOKS', 'teardown:BOOKS', 'render:WINE']);
	});

	it("discards a superseded async render's teardown instead of storing it", async () => {
		// The token guard. Without it the slow route's teardown OVERWRITES the live one, so the
		// mounted route is never torn down and the stale one is torn down late — which is why the
		// assertion is on the ordered log and not on a call count: both implementations call
		// `teardown:SLOW` exactly once, at opposite ends of the sequence.
		const log: string[] = [];
		let releaseSlow = (): void => undefined;
		const slow = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});
		const slowRoute: Route = {
			path: '/slow',
			render: async () => {
				await slow;
				log.push('render:SLOW');

				return () => {
					log.push('teardown:SLOW');
				};
			},
		};
		const { handle } = await mountRouter('/slow', [slowRoute, wordRoute('/fast', 'FAST', log)]);

		handle.navigate('/fast');
		await flush();

		expect(log).toEqual(['render:FAST']);

		releaseSlow();
		await flush();

		// The stale teardown runs on arrival and is thrown away…
		expect(log).toEqual(['render:FAST', 'render:SLOW', 'teardown:SLOW']);

		handle.dispose();

		// …leaving the LIVE route's teardown intact for dispose. Under the mutant this line is
		// `teardown:SLOW` a second time and FAST is never torn down at all.
		expect(log).toEqual(['render:FAST', 'render:SLOW', 'teardown:SLOW', 'teardown:FAST']);
	});

	it('runs the current teardown on dispose, exactly once', async () => {
		const log: string[] = [];
		const { handle } = await mountRouter('/books', [wordRoute('/books', 'BOOKS', log)]);

		handle.dispose();
		handle.dispose();

		expect(log).toEqual(['render:BOOKS', 'teardown:BOOKS']);
	});
});

describe('link interception', () => {
	it('routes a plain same-origin left click, resolving the anchor through closest()', async () => {
		// The click lands on the inner `<span>`, which is the normal case — every link in this app
		// wraps text or an icon, so a handler reading `event.target` directly would never match.
		const { container } = await mountRouter('/books', [wordRoute('/books', 'BOOKS'), wordRoute('/wine', 'WINE')]);
		const inner = anchor({ href: '/wine' }).querySelector('span');

		if (inner === null) {
			throw new Error('the anchor fixture must wrap an inner node, or this asserts nothing about closest()');
		}
		const event = clickOn(inner);

		await flush();

		expect(event.defaultPrevented).toBe(true);
		expect(window.location.pathname).toBe('/wine');
		expect(container.textContent).toBe('WINE');
	});

	it.each(MODIFIED_CLICKS)('leaves $label to the browser', async ({ init }) => {
		const { container } = await mountRouter('/books', [wordRoute('/books', 'BOOKS'), wordRoute('/wine', 'WINE')]);
		const event = clickOn(anchor({ href: '/wine' }), init);

		await flush();

		expect(event.defaultPrevented).toBe(false);
		expect(container.textContent).toBe('BOOKS');
	});

	it.each(BROWSER_OWNED_LINKS)('leaves $label to the browser', async ({ attrs }) => {
		const { container } = await mountRouter('/books', [wordRoute('/books', 'BOOKS'), wordRoute('/wine', 'WINE')]);
		const event = clickOn(anchor(attrs));

		await flush();

		expect(event.defaultPrevented).toBe(false);
		expect(container.textContent).toBe('BOOKS');
	});

	it('ignores a click that resolves to no anchor', async () => {
		const { container } = await mountRouter('/books', [wordRoute('/books', 'BOOKS')]);
		const loose = el('button', { attrs: { type: 'button' }, text: 'not a link' });

		document.body.append(loose);

		const event = clickOn(loose);

		await flush();

		expect(event.defaultPrevented).toBe(false);
		expect(container.textContent).toBe('BOOKS');
	});

	it('ignores a click another handler already claimed', async () => {
		// `defaultPrevented` is checked first so a control that happens to sit inside a link — the
		// pattern the compare page uses — keeps its own behavior instead of navigating.
		const { container } = await mountRouter('/books', [wordRoute('/books', 'BOOKS'), wordRoute('/wine', 'WINE')]);
		const link = anchor({ href: '/wine' });
		const event = new MouseEvent('click', { bubbles: true, button: 0, cancelable: true });

		event.preventDefault();
		link.dispatchEvent(event);
		await flush();

		expect(container.textContent).toBe('BOOKS');
	});
});

describe('history integration', () => {
	it('re-renders on popstate', async () => {
		const { container } = await mountRouter('/books', [wordRoute('/books', 'BOOKS'), wordRoute('/wine', 'WINE')]);

		window.history.replaceState({}, '', '/wine');
		window.dispatchEvent(new PopStateEvent('popstate'));
		await flush();

		expect(container.textContent).toBe('WINE');
	});

	it('detaches both listeners on dispose', async () => {
		const { container, handle } = await mountRouter('/books', [wordRoute('/books', 'BOOKS'), wordRoute('/wine', 'WINE')]);

		handle.dispose();

		const event = clickOn(anchor({ href: '/wine' }));

		window.history.replaceState({}, '', '/wine');
		window.dispatchEvent(new PopStateEvent('popstate'));
		await flush();

		// Both channels: the click listener is gone (nothing prevented) and so is the popstate one.
		// `dispose` does not empty the container, so the live route's paint is what "unchanged"
		// looks like here — a disposed router that still listened would replace it with WINE.
		expect(event.defaultPrevented).toBe(false);
		expect(container.textContent).toBe('BOOKS');
	});
});
