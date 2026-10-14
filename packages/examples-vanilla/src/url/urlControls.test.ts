/**
 * Tests for the header's URL controls.
 *
 * @remarks
 * The copy-link button carries React's icon. Losing it would be visible on screen and invisible to
 * the view-level tests, because they assert behavior (does clicking a chip filter?) and this is
 * presentation. It is exercised directly rather than through a page, since the page boots
 * an engine and none of that bears on whether the button has a glyph in it.
 */

import { SITE } from '@filter-enginez/examples-shared/verticals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompareLinkButton, createCopyLinkButton, createUrlFormatToggle } from './urlControls.js';
import { readConfigFromUrl } from './urlState.js';

describe('createCopyLinkButton', () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it('renders the chain-link icon alongside the label', () => {
		const { dispose, element } = createCopyLinkButton();

		expect(element.querySelector('svg')).not.toBeNull();
		expect(element.textContent).toBe('Copy link');
		dispose();
	});

	it('marks the icon aria-hidden and strokes it with currentColor', () => {
		// `currentColor` rather than a literal: the button's cyan shifts on hover, and a hardcoded
		// stroke would leave the glyph behind. `aria-hidden` because the button already has a label —
		// without it a screen reader announces the graphic too.
		const { dispose, element } = createCopyLinkButton();
		const icon = element.querySelector('svg');

		expect(icon?.getAttribute('aria-hidden')).toBe('true');
		expect(icon?.getAttribute('stroke')).toBe('currentColor');
		dispose();
	});

	it('swaps the label to "Copied" and back, leaving the icon in place', async () => {
		vi.useFakeTimers();

		try {
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: { writeText: async (): Promise<void> => Promise.resolve() },
			});

			const { dispose, element } = createCopyLinkButton();

			element.click();
			// `advanceTimersByTimeAsync` rather than a hand-counted stack of `await Promise.resolve()`:
			// the stub is `async`, so the number of microtasks between the click and the label swap is
			// an implementation detail, and counting them makes the test fail for reasons unrelated to
			// what it is checking. This drains the microtask queue for us.
			await vi.advanceTimersByTimeAsync(0);

			expect(element.textContent).toBe('Copied');
			// The icon is a sibling of the label span, so a naive `textContent = …` on the BUTTON would
			// have destroyed it. This is the assertion that pins that.
			expect(element.querySelector('svg')).not.toBeNull();

			vi.advanceTimersByTime(1500);

			expect(element.textContent).toBe('Copy link');
			expect(element.querySelector('svg')).not.toBeNull();
			dispose();
		} finally {
			vi.useRealTimers();
		}
	});

	it('restarts the countdown on a second click rather than reverting mid-flight', async () => {
		// Without the `clearTimeout`, the FIRST click's timer survives the second and fires on the
		// original schedule — so a user who copies twice watches "Copied" drop back to "Copy link"
		// early, which reads as the copy having failed.
		vi.useFakeTimers();

		try {
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: { writeText: async (): Promise<void> => Promise.resolve() },
			});

			const { dispose, element } = createCopyLinkButton();

			element.click();
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(1200);

			expect(element.textContent).toBe('Copied');

			element.click();
			await vi.advanceTimersByTimeAsync(0);
			// 400ms past the FIRST timer's deadline. A surviving first timer reverts the label here.
			await vi.advanceTimersByTimeAsync(400);

			expect(element.textContent).toBe('Copied');

			await vi.advanceTimersByTimeAsync(1100);

			expect(element.textContent).toBe('Copy link');
			dispose();
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves the label alone when the clipboard is denied', async () => {
		// An insecure origin or a denied permission rejects. Showing "Copied" over a clipboard that
		// holds nothing is the one outcome worse than showing nothing.
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: async (): Promise<void> => Promise.reject(new Error('denied')) },
		});

		const { dispose, element } = createCopyLinkButton();

		element.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(element.textContent).toBe('Copy link');
		dispose();
	});

	it('clears a pending timer on dispose, so a torn-down route cannot write to a dead node', async () => {
		vi.useFakeTimers();

		try {
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: { writeText: async (): Promise<void> => Promise.resolve() },
			});

			const { dispose, element } = createCopyLinkButton();

			element.click();
			await vi.advanceTimersByTimeAsync(0);

			expect(element.textContent).toBe('Copied');

			dispose();
			await vi.advanceTimersByTimeAsync(2000);

			// Still "Copied": the callback never ran. It is harmless on a detached node, which is
			// exactly why a leak here would go unnoticed without an assertion.
			expect(element.textContent).toBe('Copied');
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('createUrlFormatToggle', () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it('carries the shared "URL" kicker, not a per-vertical variant', () => {
		// This literal is hardcoded in six framework-specific components over the same shared
		// `ui-styles` block, so nothing but this case keeps vanilla's reading "URL READABLE" like the
		// other five verticals' rather than drifting to a variant of its own.
		const { dispose, element } = createUrlFormatToggle();

		expect(element.querySelector('.fe-url-format-toggle__kicker')?.textContent).toBe('URL');
		expect(element.getAttribute('aria-label')).toBe('Cycle the shareable-URL format');
		dispose();
	});

	it('cycles the app-wide format on click and re-labels itself from the subscription', () => {
		// Two claims in one, and the second is the interesting one: the label is not written by the
		// click handler. It is written by the subscriber, so a toggle that cycled without notifying
		// would keep its old text while every other consumer moved on.
		const { dispose, element } = createUrlFormatToggle();
		const before = element.textContent;

		element.click();

		const after = element.textContent;

		expect(after).not.toBe(before);

		element.click();
		element.click();

		// Three clicks through a three-way cycle returns to the start.
		expect(element.textContent).toBe(before);
		dispose();
	});
});

/**
 * The Compare button's two states, and the attribute that distinguishes them.
 *
 * @remarks
 * Presentation again, and again invisible to the view-level tests — but with a sharper edge than the
 * copy-link icon. The enabled and disabled states differ by ONE attribute, `aria-disabled`, and both
 * the stylesheet and the e2e select on the exact value `'true'`. Two plausible ways of writing it
 * miss that: `setAttribute('aria-disabled', String(isComparable))` leaves `"false"` behind on the
 * enabled button, and `toggleAttribute` forced on sets the EMPTY STRING. Either produces a control
 * that looks right in one channel and wrong in the other, so both states are asserted by value.
 */
describe('createCompareLinkButton', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		window.history.replaceState(null, '', '/');
		// The button subscribes on construction and is handed the CURRENT value immediately, so the
		// URL has to be settled before it is built — which is also the order the pages use.
		readConfigFromUrl();
	});

	afterEach(() => {
		window.history.replaceState(null, '', '/');
		readConfigFromUrl();
	});

	it('is inert, with no state, and refuses the navigation', () => {
		const { dispose, element } = createCompareLinkButton('books');

		expect(element.getAttribute('aria-disabled')).toBe('true');

		const event = new MouseEvent('click', { bubbles: true, cancelable: true });

		element.dispatchEvent(event);

		expect(event.defaultPrevented, 'an inert Compare button still navigated').toBe(true);
		dispose();
	});

	it('drops the attribute entirely once there is state, rather than setting it false', () => {
		window.history.replaceState(null, '', '/?f=h~{"version":1,"rules":[]}');
		readConfigFromUrl();

		const { dispose, element } = createCompareLinkButton('books');

		// `null`, not `'false'`. See the describe docblock — `String(isComparable)` is the natural
		// mistake and it passes any assertion phrased as "not 'true'".
		expect(element.getAttribute('aria-disabled')).toBeNull();

		const event = new MouseEvent('click', { bubbles: true, cancelable: true });

		element.dispatchEvent(event);

		expect(event.defaultPrevented, 'a ready Compare button refused its own navigation').toBe(false);
		dispose();
	});

	it('carries the state in an ABSOLUTE href, which is what keeps the router out of it', () => {
		const serialized = 'h~{"version":1,"rules":[]}';

		window.history.replaceState(null, '', `/?f=${encodeURIComponent(serialized)}`);
		readConfigFromUrl();

		const { dispose, element } = createCompareLinkButton('real-estate');
		const href = new URL(element.getAttribute('href') ?? '');

		// The hand-rolled router intercepts a click only when the href starts with `/`. An absolute
		// URL is therefore what leaves navigation to the browser — and the page is on another origin,
		// the landing site (its local server here, since jsdom serves from a loopback host).
		expect(element.getAttribute('href')?.startsWith('/')).toBe(false);
		expect(href.origin).toBe(SITE.devOrigin);
		expect(href.pathname).toBe('/compare');
		expect(href.searchParams.get('dataset')).toBe('real-estate');
		expect(href.searchParams.get('f')).toBe(serialized);
		dispose();
	});

	it('re-targets itself when the state changes, without being rebuilt', () => {
		const { dispose, element } = createCompareLinkButton('books');

		expect(element.getAttribute('aria-disabled')).toBe('true');

		window.history.replaceState(null, '', '/?f=h~{"version":1,"rules":[]}');
		readConfigFromUrl();

		// The whole reason this control subscribes rather than reading the URL when clicked: nothing
		// rebuilt it, and it already knows.
		expect(element.getAttribute('aria-disabled')).toBeNull();
		// `getAttribute`, not `.href`: `HeaderControl.element` is typed `HTMLElement` — the interface
		// every header control shares — so the anchor-specific property is not on it.
		expect(new URL(element.getAttribute('href') ?? '').searchParams.get('f')).toBe('h~{"version":1,"rules":[]}');
		dispose();
	});

	it('stops listening once disposed', () => {
		const { dispose, element } = createCompareLinkButton('books');

		dispose();
		window.history.replaceState(null, '', '/?f=h~{"version":1,"rules":[]}');
		readConfigFromUrl();

		expect(element.getAttribute('aria-disabled')).toBe('true');
	});
});
